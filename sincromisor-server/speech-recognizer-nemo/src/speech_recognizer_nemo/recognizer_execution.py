"""共有認識モデルを単一スレッドで所有し、接続側は認識完了を非同期に待つ。"""

import asyncio
import logging
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter

from sincro_models import SpeechExtractorResult, SpeechRecognizerResult

from .SpeechRecognizerNemo import SpeechRecognizerNemoWorker
from .SpeechRecognizerNemo.SpeechRecognizerS3Client import SpeechRecognizerS3Client


class RecognizerExecution:
    """モデルの初期化・認識・解放を直列化し、取消でも使用中の資源を保持する。"""

    def __init__(self, create_worker: Callable[[], SpeechRecognizerNemoWorker]) -> None:
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
        s3_client: SpeechRecognizerS3Client | None,
    ) -> SpeechRecognizerResult:
        """未開始なら取り消し、開始済みなら復元・保存完了まで待って取消を伝える。"""
        if self.worker is None:
            raise RuntimeError("Recognizer is closed.")
        pending = self.executor.submit(
            self.__recognize, spe_result, s3_client, perf_counter()
        )
        result = asyncio.wrap_future(pending)
        try:
            return await asyncio.shield(result)
        except asyncio.CancelledError:
            pending.cancel()
            # スレッドは取消で止まらない。接続のS3クライアントを解放する前に回収する。
            cleanup = asyncio.gather(result, return_exceptions=True)
            while not cleanup.done():
                try:
                    await asyncio.shield(cleanup)
                except asyncio.CancelledError:
                    # 終了要求が重なっても使用中の接続資源を先に解放しない。
                    continue
            raise

    def __recognize(
        self,
        request: SpeechExtractorResult,
        s3_client: SpeechRecognizerS3Client | None,
        queued_at: float,
    ) -> SpeechRecognizerResult:
        """実行開始後だけ待機と保存込み所要時間を記録する。未開始取消は記録しない。"""
        started = perf_counter()
        outcome = "failed"
        try:
            assert self.worker is not None
            result = self.worker.recognize(request, s3_client)
            outcome = "success"
            return result
        finally:
            # 既存のrecognition_processingは保存前まで。ここでは保存を含めて測り、
            # 他接続の実行待ちや保存I/Oを推論時間と取り違えないようにする。
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
