"""保存枠を先に予約し、音声の所有コピーを有限の専用実行器へ引き渡す。"""

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from threading import Lock
from time import perf_counter

from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult

from .recognition_storage_writer import RecognitionStorageWriter


class RecognitionStorage:
    """予約・実行中を含む件数とPCMバイト数を制限し、受理済み保存を接続取消から守る。"""

    def __init__(
        self,
        writer: RecognitionStorageWriter,
        max_jobs: int = 32,
        max_bytes: int = 64 * 1024 * 1024,
    ) -> None:
        if max_jobs <= 0 or max_bytes <= 0:
            raise ValueError("Storage limits must be positive.")
        # 32件/64MiBは保存負荷を有限にする内部上限。満杯時に音声は破棄しない。
        self.writer = writer
        self.max_jobs, self.max_bytes = max_jobs, max_bytes
        self.executor = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="asr-storage"
        )
        self.lock = Lock()
        self.jobs = self.bytes = 0
        self.closed = False
        self.waiters: dict[asyncio.Event, asyncio.AbstractEventLoop] = {}
        self.logger = logging.getLogger("sincro.RecognitionStorage")

    async def submit(
        self,
        request: SpeechExtractorResult,
        result: SpeechRecognizerResult,
        trace: dict[str, object] | None,
    ) -> None:
        """モデル解放後に枠を待ち、取消可能な受理前と取消で捨てない受理後を分ける。"""
        started = perf_counter()
        size = request.voice.nbytes
        if size > self.max_bytes:
            self.logger.warning(
                {
                    "event": "recognition_storage",
                    "stage": "handoff",
                    "outcome": "failed",
                    "reason": "audio_exceeds_capacity",
                    "session_id": result.session_id,
                    "speech_id": result.speech_id,
                    "sequence_id": result.sequence_id,
                }
            )
            return
        try:
            await self.__reserve(size)
        except asyncio.CancelledError:
            self.__diagnostic(result, "handoff", "cancelled", started)
            raise
        try:
            # 予約後から投入までawaitしない。ここが受理境界で、以後は接続に依存しない。
            audio = request.model_copy(deep=True)
            output = result.model_copy(deep=True)
            correction = deepcopy(trace)
            with self.lock:
                if self.closed:
                    raise RuntimeError("Recognition storage is closed.")
                self.executor.submit(
                    self.__write, audio, output, correction, perf_counter()
                )
        except BaseException:
            self.__release(size)
            raise
        self.__diagnostic(result, "handoff", "accepted", started)

    async def __reserve(self, size: int) -> None:
        """待機はイベントループへ返し、空き枠待ちで共有モデルや保存スレッドを塞がない。"""
        event = asyncio.Event()
        loop = asyncio.get_running_loop()
        try:
            while True:
                with self.lock:
                    if self.closed:
                        raise RuntimeError("Recognition storage is closed.")
                    if (
                        self.jobs < self.max_jobs
                        and self.bytes + size <= self.max_bytes
                    ):
                        self.jobs += 1
                        self.bytes += size
                        return
                    event.clear()
                    self.waiters[event] = loop
                await event.wait()
        finally:
            with self.lock:
                self.waiters.pop(event, None)

    def __release(self, size: int) -> None:
        with self.lock:
            self.jobs -= 1
            self.bytes -= size
            self.__wake_waiters()

    def __wake_waiters(self) -> None:
        """ロック中に登録済み待機者へ通知する。終了済み接続のループは保持しない。"""
        for event, loop in list(self.waiters.items()):
            try:
                loop.call_soon_threadsafe(event.set)
            except RuntimeError:
                # Uvicorn終了後は待機接続も終了済み。保存自体はcloseが回収する。
                self.waiters.pop(event, None)

    def __write(
        self,
        request: SpeechExtractorResult,
        result: SpeechRecognizerResult,
        trace: dict[str, object] | None,
        queued_at: float,
    ) -> None:
        started = perf_counter()
        outcome = "success"
        try:
            self.writer.write(request, result, trace)
        except Exception as error:  # noqa: BLE001  # reason: 保存失敗は接続へ逆伝播せず、診断を残して後続の保存を継続する。
            outcome = "failed"
            self.logger.warning(
                {
                    "event": "recognition_storage",
                    "stage": "write",
                    "outcome": outcome,
                    "session_id": result.session_id,
                    "speech_id": result.speech_id,
                    "sequence_id": result.sequence_id,
                    **failure_fields(error),
                }
            )
        finally:
            self.__diagnostic(
                result,
                "execution",
                outcome,
                started,
                queue_wait_ms=(started - queued_at) * 1000,
            )
            self.__release(request.voice.nbytes)

    def __diagnostic(
        self,
        result: SpeechRecognizerResult,
        stage: str,
        outcome: str,
        started: float,
        **fields: float,
    ) -> None:
        self.logger.info(
            {
                "event": "recognition_storage",
                "stage": stage,
                "outcome": outcome,
                "session_id": result.session_id,
                "speech_id": result.speech_id,
                "sequence_id": result.sequence_id,
                "elapsed_ms": (perf_counter() - started) * 1000,
                **fields,
            }
        )

    def cancelled(self, request: SpeechExtractorResult) -> None:
        """推論中に取消され、保存を受理しなかった確定要求を本文なしで記録する。"""
        self.logger.info(
            {
                "event": "recognition_storage",
                "stage": "handoff",
                "outcome": "cancelled",
                "session_id": request.session_id,
                "speech_id": request.speech_id,
                "sequence_id": request.sequence_id,
            }
        )

    def close(self) -> None:
        """新規受付を止め、受理済み処理の後に保存クライアントと実行器を閉じる。"""
        with self.lock:
            if self.closed:
                return
            self.closed = True
            self.__wake_waiters()
            closing = self.executor.submit(self.writer.close)
        try:
            closing.result()
        finally:
            self.executor.shutdown(wait=True)
