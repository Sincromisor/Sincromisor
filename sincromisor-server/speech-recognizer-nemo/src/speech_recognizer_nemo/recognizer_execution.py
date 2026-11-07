"""共有認識モデルを単一スレッドで所有し、接続側は認識完了を非同期に待つ。"""

import asyncio
import logging
from collections import deque
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from threading import BoundedSemaphore
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
        max_pending: int = 32,
    ) -> None:
        """実行中と待機中を合計32件まで受け入れ、共有モデルと待機音声の増加を抑える。"""
        if max_pending <= 0:
            raise ValueError("Recognizer capacity must be positive.")
        self.capacity = BoundedSemaphore(max_pending)
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
        if not self.capacity.acquire(blocking=False):
            raise RuntimeError("Recognizer capacity exceeded.")
        # deque.popはスレッド間でも原子的。実行側と取消側の一方だけが入力を取得する。
        inputs = deque([spe_result])
        try:
            pending = self.executor.submit(self.__recognize, inputs, perf_counter())
        except BaseException:
            self.capacity.release()
            raise
        # Future.cancelでは内部キューの項目が残るため、取消も実際の取出し後に枠を返す。
        # 保存受渡し待ちでは推論枠を占有しない。
        pending.add_done_callback(lambda _future: self.capacity.release())
        result = asyncio.wrap_future(pending)
        try:
            completed = await asyncio.shield(result)
            assert completed is not None
            recognized, trace = completed
        except asyncio.CancelledError:
            try:
                # 未開始なら音声参照を直ちに外し、キュー項目は空のまま回収させる。
                inputs.pop()
            except IndexError:
                # 開始済みスレッドは取消で止まらない。入力を再利用する前に推論を回収する。
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
        inputs: deque[SpeechExtractorResult],
        queued_at: float,
    ) -> tuple[SpeechRecognizerResult, dict[str, object] | None] | None:
        """推論と補正だけを測り、保存待機を共有モデルの実行時間へ混ぜない。"""
        try:
            request = inputs.pop()
        except IndexError:
            return None
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
