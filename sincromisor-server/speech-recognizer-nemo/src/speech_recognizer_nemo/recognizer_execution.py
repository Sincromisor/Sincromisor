"""共有認識モデルを単一スレッドで所有し、接続側は認識完了を非同期に待つ。"""

import asyncio
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter

from sincro_models import SpeechExtractorResult, SpeechRecognizerResult

from .recognition_storage import RecognitionStorage
from .SpeechRecognizerNemo import SpeechRecognizerNemoWorker


class RecognizerExecution:
    """モデルの初期化・認識・解放を直列化し、取消でも使用中の資源を保持する。"""

    def __init__(
        self,
        create_worker: Callable[[], SpeechRecognizerNemoWorker],
        storage: RecognitionStorage | None = None,
    ) -> None:
        self.storage = storage
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="asr")
        try:
            self.worker: SpeechRecognizerNemoWorker | None = self.executor.submit(
                create_worker
            ).result()
        except BaseException:
            self.executor.shutdown(wait=True, cancel_futures=True)
            raise

    async def recognize(
        self,
        spe_result: SpeechExtractorResult,
    ) -> SpeechRecognizerResult:
        """未開始なら取り消し、開始済みならモデル復元後に取消を伝える。保存受理後は待たない。"""
        if self.worker is None:
            raise RuntimeError("Recognizer is closed.")
        pending = self.executor.submit(self.__recognize, spe_result, perf_counter())
        result = asyncio.wrap_future(pending)
        try:
            recognized, trace = await asyncio.shield(result)
        except asyncio.CancelledError:
            pending.cancel()
            # スレッドは取消で止まらない。入力バッファを再利用する前に推論を回収する。
            cleanup = asyncio.gather(result, return_exceptions=True)
            while not cleanup.done():
                try:
                    await asyncio.shield(cleanup)
                except asyncio.CancelledError:
                    # 終了要求が重なっても使用中の入力音声を先に解放しない。
                    continue
            if self.storage is not None and spe_result.confirmed:
                self.storage.cancelled(spe_result)
            raise
        if self.storage is not None and spe_result.confirmed:
            await self.storage.submit(spe_result, recognized, trace)
        return recognized

    def __recognize(
        self,
        request: SpeechExtractorResult,
        queued_at: float,
    ) -> tuple[SpeechRecognizerResult, dict[str, object] | None]:
        """推論と補正だけを測り、保存待機を共有モデルの実行時間へ混ぜない。"""
        started = perf_counter()
        outcome = "failed"
        try:
            assert self.worker is not None
            result = self.worker.recognize(request)
            outcome = "success"
            return result
        finally:
            # 保存分離前のexecution_msとは意味が異なる。保存は専用イベントで測る。
            logging.getLogger("sincro.RecognizerExecution").info(
                {
                    "event": "recognition_execution",
                    "session_id": request.session_id,
                    "speech_id": request.speech_id,
                    "sequence_id": request.sequence_id,
                    "confirmed": request.confirmed,
                    "queue_wait_ms": (started - queued_at) * 1000,
                    "execution_ms": (perf_counter() - started) * 1000,
                    "outcome": outcome,
                }
            )

    def close(self) -> None:
        """全接続の終了後に呼び、実行終了とモデル参照の解放を同じスレッドで行う。"""
        try:
            self.executor.submit(self.__release_worker).result()
        finally:
            self.executor.shutdown(wait=True, cancel_futures=True)

    def __release_worker(self) -> None:
        self.worker = None
