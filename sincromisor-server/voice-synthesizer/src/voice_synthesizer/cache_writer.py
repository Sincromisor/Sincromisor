"""検証済み音声の保存をサービスの生存期間へ移し、配信から書込み待ちを除く。"""

import io
import logging
import sys
import wave
from collections import deque
from collections.abc import Callable
from contextlib import ExitStack
from copy import deepcopy
from dataclasses import dataclass
from threading import Condition, Lock, Thread
from time import perf_counter

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from pydantic import BaseModel
from redis import Redis
from redis.backoff import NoBackoff
from redis.retry import Retry
from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult, VoiceVoxQuery
from voice_synthesizer.streaming_mora_timing import build_streaming_mora_queue
from voice_synthesizer.voice_stream import StreamContext

# 最大120秒の48kHz PCMを扱う保存を最大4件・48MiBに抑え、予約・実行中も同じ枠で数える。
MAX_WRITE_JOBS = 4
MAX_WRITE_BYTES = 48 * 1024 * 1024
# 結果DTOの固定フィールド・WAVヘッダー・コピー時の管理領域を音声量とは別に見込む。
GENERATED_METADATA_BYTES = 4096
S3_CONFIG = Config(
    signature_version="s3v4",
    s3={"addressing_style": "path"},
    connect_timeout=5,
    read_timeout=30,
    retries={"total_max_attempts": 1, "mode": "standard"},
)


@dataclass(frozen=True)
class _WriteJob:
    """予約後に独立コピーしたDTOと診断IDを保持し、接続の取消状態は持たない。"""

    request: VoiceSynthesizerRequest
    result: VoiceSynthesizerResult
    ids: dict[str, object]
    redis_only: bool
    retained_bytes: int
    accepted_at: float


def _retained_bytes(value: object) -> int:
    """直列化やコピーの前にDTOの保持量を見積もる。共有値も重ねて数え安全側に制限する。"""
    size = sys.getsizeof(value)
    if isinstance(value, BaseModel):
        return size + _retained_bytes(value.__dict__)
    if isinstance(value, dict):
        return size + sum(
            _retained_bytes(key) + _retained_bytes(item) for key, item in value.items()
        )
    if isinstance(value, (list, tuple)):
        return size + sum(_retained_bytes(item) for item in value)
    return size


def _complete_result(
    request: VoiceSynthesizerRequest, query: VoiceVoxQuery, pcm: bytearray
) -> VoiceSynthesizerResult:
    """予約済み枠内で、全区間の検証を終えたPCMを完成WAVと保存DTOへ包む。"""
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(48_000)
        audio.writeframes(pcm)
    return VoiceSynthesizerResult(
        message=request.message,
        query=query,
        mora_queue=build_streaming_mora_queue(query),
        speaking_time=len(pcm) / 96_000,
        voice=output.getvalue(),
        audio_format="audio/wav",
    )


class VoiceCacheWriter:
    """有限キューと専用接続を所有し、終了時に受理済み書込みを回収してから接続を閉じる。"""

    def __init__(
        self,
        redis_host: str,
        redis_port: int,
        s3_host: str,
        s3_port: int,
        s3_access_key: str,
        s3_secret_key: str,
    ) -> None:
        """読取側と共有しないクライアントを作り、サービス所有の保存スレッドを開始する。"""
        self.logger = logging.getLogger("sincro.VoiceCacheWriter")
        self._condition = Condition()
        self._close_lock = Lock()
        self._accepting = True
        self._closed = False
        self._jobs: deque[_WriteJob] = deque()
        self._count = 0
        self._bytes = 0
        with ExitStack() as resources:
            self.redis: Redis = Redis(
                host=redis_host,
                port=redis_port,
                socket_connect_timeout=5,
                socket_timeout=30,
                retry=Retry(NoBackoff(), 0),
            )
            resources.callback(self.redis.close)
            self.s3_client: BaseClient = boto3.client(
                "s3",
                endpoint_url=f"http://{s3_host}:{s3_port}",
                aws_access_key_id=s3_access_key,
                aws_secret_access_key=s3_secret_key,
                region_name="us-east-1",
                config=S3_CONFIG,
            )
            resources.callback(self.s3_client.close)
            self._thread = Thread(target=self._run, name="voice-cache-writer")
            self._thread.start()
            self._resources = resources.pop_all()

    def submit(
        self,
        request: VoiceSynthesizerRequest,
        result: VoiceSynthesizerResult,
        context: StreamContext,
        *,
        redis_only: bool = False,
    ) -> bool:
        """コピー前に枠を予約する。満杯・受付停止・受理前取消では書込みだけを省略する。"""
        size = 2 * (
            _retained_bytes(request)
            + _retained_bytes(result)
            + _retained_bytes(context.ids)
        )
        return self._submit(
            request,
            context,
            size,
            lambda: result.model_copy(deep=True),
            redis_only=redis_only,
        )

    def submit_generated(
        self,
        request: VoiceSynthesizerRequest,
        query: VoiceVoxQuery,
        pcm: bytearray,
        context: StreamContext,
    ) -> bool:
        """完成WAVとDTOを作る前に枠を予約し、満杯なら追加の音声コピーを作らない。"""
        # query由来のモーラ列とDTOの固定領域も見込み、WAVとMessagePackの両方を数える。
        size = 2 * (
            _retained_bytes(request)
            + 2 * _retained_bytes(query)
            + _retained_bytes(pcm)
            + _retained_bytes(context.ids)
            + GENERATED_METADATA_BYTES
        )

        def build_result() -> VoiceSynthesizerResult:
            """予約内でPCMをWAV化し、診断用結果と独立した保存DTOを得る。"""
            complete = _complete_result(request, query, pcm)
            context.result = complete
            return complete.model_copy(deep=True)

        return self._submit(request, context, size, build_result)

    def _submit(
        self,
        request: VoiceSynthesizerRequest,
        context: StreamContext,
        size: int,
        build_result: Callable[[], VoiceSynthesizerResult],
        *,
        redis_only: bool = False,
    ) -> bool:
        """予約からDTO作成・受理までを所有し、失敗・取消でも枠を一度だけ解放する。"""
        # DTOの保持に加え、書込中のMessagePack生成分も同じ予約に含める。
        with self._condition:
            reason = self._rejection_reason(size, context)
            if reason is not None:
                self._event(context.ids, "submit", "skipped", reason=reason)
                return False
            self._count += 1
            self._bytes += size
        queued = False
        try:
            # 深いコピーに失敗しても予約枠を返す。bytesの共有は不変なので安全である。
            job = _WriteJob(
                request.model_copy(deep=True),
                build_result(),
                deepcopy(context.ids),
                redis_only,
                size,
                perf_counter(),
            )
            with self._condition:
                if context.cancelled.is_set():
                    self._event(context.ids, "submit", "skipped", reason="cancelled")
                    return False
                self._jobs.append(job)
                queued = True
                self._condition.notify_all()
            return True
        except Exception as error:  # noqa: BLE001  # reason: 補助キャッシュの受渡し失敗を会話の成功から分離する。
            self._event(context.ids, "submit", "failed", error=error)
            return False
        finally:
            if not queued:
                self._release(size)

    def _rejection_reason(self, size: int, context: StreamContext) -> str | None:
        """予約と終了・取消の境界を同じロック内で判定する。"""
        if context.cancelled.is_set():
            return "cancelled"
        if not self._accepting:
            return "shutdown"
        if self._count >= MAX_WRITE_JOBS or self._bytes + size > MAX_WRITE_BYTES:
            return "queue_full"
        return None

    def _release(self, size: int) -> None:
        """コピー予約から書込み終了まで保持した枠を一度だけ返す。"""
        with self._condition:
            self._count -= 1
            self._bytes -= size
            self._condition.notify_all()

    def _run(self) -> None:
        """受付停止後も予約中のコピーを待ち、全受理済み保存が終わるまで処理を続ける。"""
        while True:
            with self._condition:
                self._condition.wait_for(
                    lambda: (
                        bool(self._jobs) or (not self._accepting and self._count == 0)
                    )
                )
                if not self._jobs:
                    return
                job = self._jobs.popleft()
            try:
                self._write(job)
            except Exception as error:  # noqa: BLE001  # reason: 一保存の失敗で他の受理済み保存や終了回収を止めない。
                self._event(job.ids, "encode", "failed", error=error)
            finally:
                self._release(job.retained_bytes)

    def _write(self, job: _WriteJob) -> None:
        """受理済みDTOを一度だけ直列化し、片方の失敗でも他の保存先へ進む。"""
        self._event(
            job.ids,
            "queue",
            "success",
            duration_ms=(perf_counter() - job.accepted_at) * 1000,
        )
        payload = job.result.to_msgpack()
        for peer in ("redis",) if job.redis_only else ("redis", "s3"):
            started = perf_counter()
            try:
                if peer == "redis":
                    self.redis.set(
                        job.request.redis_key(), payload, ex=60 * 60 * 24 * 7
                    )
                else:
                    self.s3_client.put_object(
                        Bucket="voice-synthesizer",
                        Key=job.request.s3_key(),
                        Body=io.BytesIO(payload),
                        ContentType="application/octet-stream",
                    )
            except Exception as error:  # noqa: BLE001  # reason: 再生成可能なキャッシュの失敗は保存診断に限定する。
                self._event(
                    job.ids,
                    "write",
                    "failed",
                    peer=peer,
                    error=error,
                    duration_ms=(perf_counter() - started) * 1000,
                )
            else:
                self._event(
                    job.ids,
                    "write",
                    "success",
                    peer=peer,
                    duration_ms=(perf_counter() - started) * 1000,
                )

    def _event(
        self, ids: dict[str, object], stage: str, outcome: str, **fields: object
    ) -> None:
        """本文・キー・例外文字列を除き、待機・実行・省略の理由を分けて記録する。"""
        error = fields.pop("error", None)
        if isinstance(error, Exception):
            fields.update(failure_fields(error))
        self.logger.log(
            logging.WARNING if outcome == "failed" else logging.INFO,
            {
                "event": "voice_cache_operation",
                **ids,
                "stage": stage,
                "outcome": outcome,
                **fields,
            },
        )

    def close(self) -> None:
        """新規予約を止め、予約中・実行中も含めて回収後、専用クライアントを一度閉じる。"""
        with self._close_lock:
            if self._closed:
                return
            with self._condition:
                self._accepting = False
                self._condition.notify_all()
            self._thread.join()
            self._resources.close()
            self._closed = True
