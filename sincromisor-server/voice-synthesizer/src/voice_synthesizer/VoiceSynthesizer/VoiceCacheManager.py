"""完成音声のRedis/S3取得と保存を所有し、通常生成と逐次生成へ同じ保存境界を渡す。"""

import io
import logging
from collections.abc import Iterator
from contextlib import ExitStack
from logging import Logger
from time import perf_counter

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from botocore.response import StreamingBody
from redis import Redis
from redis.backoff import NoBackoff
from redis.exceptions import RedisError
from redis.retry import Retry
from sincro_config import SincromisorLoggerConfig
from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import (
    VoiceSynthesizerChunk,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
)
from voice_synthesizer.stream_logging import stream_log
from voice_synthesizer.voice_stream import StreamContext, stream_voice

from .VoiceSynthesizer import VoiceSynthesizer


class VoiceCacheManager:
    """Redis、S3、実生成の順に音声を得て、本文の記録を一つの境界で制御する。"""

    class VoiceSynthesizerServerException(Exception):
        """生成失敗を呼出元へ通知する。原因の値はログへ文字列化しない。"""

    def __init__(
        self,
        voicevox_host: str,
        voicevox_port: int,
        redis_host: str,
        redis_port: int,
        s3_host: str,
        s3_port: int,
        s3_access_key: str,
        s3_secret_key: str,
    ) -> None:
        """接続ごとのキャッシュクライアントと独立した生成ログ設定を準備する。"""
        self.log_synthesis = SincromisorLoggerConfig.synthesis_enabled()
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        # 初期化途中の失敗も含め、取得した接続を逆順に必ず解放する。
        with ExitStack() as resources:
            self.redis: Redis = Redis(
                host=redis_host,
                port=redis_port,
                # VOICEVOXと同じ接続5秒・読取30秒。取消後の回収を無期限にしない。
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
                config=Config(
                    signature_version="s3v4", s3={"addressing_style": "path"}
                ),
            )
            resources.callback(self.s3_client.close)
            self.bucket_name: str = "voice-synthesizer"
            self.vsynth: VoiceSynthesizer = VoiceSynthesizer(
                host=voicevox_host,
                port=voicevox_port,
            )
            resources.callback(self.vsynth.close)
            self._resources = resources.pop_all()

    def close(self) -> None:
        """実行中のget_voiceを回収した接続所有者が、全クライアントを解放する。"""
        self._resources.close()

    def get_voice(
        self,
        vs_request: VoiceSynthesizerRequest,
        *,
        session_id: str | None = None,
        sequence_id: int | None = None,
    ) -> VoiceSynthesizerResult:
        """キャッシュ内容・保存順序を変えず、取得元と実際の生成条件を記録する。

        会話IDは運用ログだけに使い、キャッシュキー・MessagePackへ追加しない。
        """
        ids: dict[str, object] = {
            "session_id": session_id,
            "speech_id": vs_request.speech_id,
            "sequence_id": sequence_id,
        }
        start = perf_counter()
        self.logger.info({"event": "synthesis_processing", **ids, "outcome": "started"})
        if self.log_synthesis:
            self.logger.info(
                {
                    "event": "synthesis_request",
                    **ids,
                    "text": vs_request.message,
                    "parameters": vs_request.model_dump(
                        exclude={"message", "speech_id"}
                    ),
                }
            )
        try:
            source = "redis"
            result = self.__get_voice_redis(vs_request, ids)
            if result is None:
                source = "s3"
                result = self.__get_voice_s3(vs_request, ids)
                if result is not None:
                    self.__put_voice_redis(vs_request, result, ids)
            if result is None:
                source = "generated"
                try:
                    result = self.vsynth.generate(
                        vs_request=vs_request, diagnostic_ids=ids
                    )
                except Exception as error:
                    raise self.VoiceSynthesizerServerException from error
                self.__put_voice_redis(vs_request, result, ids)
                self.__put_voice_s3(vs_request, result, ids)
        except Exception as error:
            cause = error.__cause__ or error
            failure = {
                "event": "synthesis_processing",
                **ids,
                "outcome": "failed",
                "duration_ms": (perf_counter() - start) * 1000,
                "cache": source,
                "error_type": type(cause).__name__,
                "stage": "synthesis",
                "peer": "voicevox" if source == "generated" else source,
                **failure_fields(cause),
            }
            if isinstance(cause, self.vsynth.ProtocolError):
                failure["http_status"] = cause.status_code
            self.logger.exception(failure)
            raise
        if self.log_synthesis:
            self.logger.info(
                {
                    "event": "synthesis_result",
                    **ids,
                    "text": result.message,
                    "style_id": vs_request.style_id,
                    "audio_format": result.audio_format,
                    "parameters": result.query.model_dump(
                        exclude={"accent_phrases", "kana"}
                    ),
                    "cache": source,
                    "outcome": "success",
                    "query_time": perf_counter() - start,
                    "speaking_time": result.speaking_time,
                }
            )
        self.logger.info(
            {
                "event": "synthesis_processing",
                **ids,
                "outcome": "success",
                "cache": source,
                "duration_ms": (perf_counter() - start) * 1000,
            }
        )
        return result

    def stream_voice(
        self, request: VoiceSynthesizerRequest, context: StreamContext
    ) -> Iterator[VoiceSynthesizerChunk]:
        """通常会話用の逐次PCMを返す。呼出元がiteratorと進行中の読取りを回収する。"""
        with stream_log(self, request, context):
            yield from stream_voice(self, request, context)

    def load_cached_voice(
        self, request: VoiceSynthesizerRequest, context: StreamContext
    ) -> VoiceSynthesizerResult | None:
        """完成音声をRedis、S3の順で読み、失敗時も正しい取得元を診断へ残す。"""
        context.cache_source = "redis"
        result = self.__get_voice_redis(request, context.ids)
        if result is not None:
            return result
        context.cache_source = "s3"
        result = self.__get_voice_s3(request, context.ids)
        if result is None:
            context.cache_source = "generated"
        return result

    def save_cached_voice(
        self,
        request: VoiceSynthesizerRequest,
        result: VoiceSynthesizerResult,
        context: StreamContext,
    ) -> None:
        """正常EOF後の完成音声だけを保存し、取消が来たら次の書込みへ進まない。"""
        if context.cancelled.is_set():
            raise InterruptedError("Synthesis cancelled")
        self.__put_voice_redis(request, result, context.ids)
        if context.cancelled.is_set():
            raise InterruptedError("Synthesis cancelled")
        self.__put_voice_s3(request, result, context.ids)

    def __cache_event(
        self,
        peer: str,
        stage: str,
        ids: dict[str, object],
        started: float,
        error: Exception | None = None,
        outcome: str = "success",
    ) -> None:
        """内容を出さず、読取（復号込み）または書込全体の時間をミリ秒で残す。"""
        fields = failure_fields(error) if error else {}
        if stage == "read" and fields.get("reason") == "not_found":
            outcome = "miss"
        elif error:
            outcome = "failed"
        self.logger.log(
            logging.WARNING if outcome == "failed" else logging.INFO,
            {
                "event": "voice_cache_operation",
                "duration_ms": (perf_counter() - started) * 1000,
                "peer": peer,
                "stage": stage,
                **ids,
                **fields,
                "outcome": outcome,
            },
        )

    def __get_voice_redis(
        self, vs_request: VoiceSynthesizerRequest, ids: dict[str, object]
    ) -> VoiceSynthesizerResult | None:
        """Redis未命中と読取・復号失敗を区別する。従来どおり例外は呼出元へ返す。"""
        started = perf_counter()
        stage = "read"
        try:
            vs_pack = self.redis.get(vs_request.redis_key())
            if isinstance(vs_pack, bytes) and vs_pack:
                stage = "decode"
                result = VoiceSynthesizerResult.from_msgpack(vs_pack)
                self.__cache_event("redis", stage, ids, started)
                return result
        except Exception as error:
            self.__cache_event("redis", stage, ids, started, error)
            raise
        self.__cache_event("redis", stage, ids, started, outcome="miss")
        return None

    def __get_voice_s3(
        self, vs_request: VoiceSynthesizerRequest, ids: dict[str, object]
    ) -> VoiceSynthesizerResult | None:
        """不存在とアクセス失敗を区別して生成へ進む。破損データは従来どおり伝播する。"""
        started = perf_counter()
        stage = "read"
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name, Key=vs_request.s3_key()
            )
            body: StreamingBody = response["Body"]
            try:
                vpack: bytes = body.read()
            finally:
                body.close()
            stage = "decode"
            result = VoiceSynthesizerResult.from_msgpack(vpack)
            self.__cache_event("s3", stage, ids, started)
            return result
        except (ClientError, BotoCoreError) as error:
            self.__cache_event("s3", stage, ids, started, error)
            return None
        except Exception as error:
            self.__cache_event("s3", stage, ids, started, error)
            raise

    def __put_voice_redis(
        self,
        vs_request: VoiceSynthesizerRequest,
        vs_result: VoiceSynthesizerResult,
        ids: dict[str, object],
    ) -> None:
        """保存不能でも生成結果を返す既存動作を維持し、操作とIDを残す。"""
        started = perf_counter()
        try:
            self.redis.set(
                vs_request.redis_key(), vs_result.to_msgpack(), ex=60 * 60 * 24 * 7
            )
            self.__cache_event("redis", "write", ids, started)
        except RedisError as error:
            self.__cache_event("redis", "write", ids, started, error)

    def __put_voice_s3(
        self,
        vs_request: VoiceSynthesizerRequest,
        vs_result: VoiceSynthesizerResult,
        ids: dict[str, object],
    ) -> None:
        """S3保存不能でも生成結果を返す。キー・本文・認証は診断へ出さない。"""
        started = perf_counter()
        try:
            payload = vs_result.to_msgpack()
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=vs_request.s3_key(),
                Body=io.BytesIO(payload),
                ContentType="application/octet-stream",
            )
            self.__cache_event("s3", "write", ids, started)
        except (ClientError, BotoCoreError) as error:
            self.__cache_event("s3", "write", ids, started, error)
