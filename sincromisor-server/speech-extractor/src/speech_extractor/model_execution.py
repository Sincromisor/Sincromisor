"""VADと終端推論を別スレッドへ分離し、モデル要求の待ち行列を有限に保つ。"""

import asyncio
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from threading import Lock


class ModelExecution:
    """サービス所有の単一実行器。開始済みを回収してから終了する。"""

    def __init__(self, name: str, capacity: int = 32) -> None:
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix=name)
        self.capacity = capacity
        self.pending = 0
        self.lock = Lock()

    async def run[T](self, function: Callable[[], T]) -> T:
        """枠が満杯なら失敗させる。取消は未開始要求を止め、実行中は所有者が回収する。"""
        with self.lock:
            if self.pending >= self.capacity:
                raise RuntimeError("Model execution capacity exceeded")
            self.pending += 1
        try:
            future = self.executor.submit(function)
        except BaseException:
            self._release(None)
            raise
        future.add_done_callback(self._release)
        try:
            return await asyncio.wrap_future(future)
        except asyncio.CancelledError:
            future.cancel()
            raise

    def _release(self, _future: Future | None) -> None:
        """取消・成功・失敗のどれでも、実際の実行終了時に予約枠を返す。"""
        with self.lock:
            self.pending -= 1

    def close(self) -> None:
        """全接続停止後に呼ぶ。モデル参照の解放より先に開始済み処理を回収する。"""
        self.executor.shutdown(wait=True, cancel_futures=True)
