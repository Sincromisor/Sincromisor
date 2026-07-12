import logging
import time
from logging import Logger
from multiprocessing.synchronize import Event
from threading import Thread

from .RTCSessionProcess import RTCSessionProcess


class RTCSessionProcessManagementThread(Thread):
    """RTC session 子プロセスの終了待機と最終回収を所有する。"""

    def __init__(
        self,
        session_id: str,
        process: RTCSessionProcess,
        rtc_finalize_event: Event,
        timeout: int,
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__session_id = session_id
        self.__process: RTCSessionProcess = process
        self.__rtc_finalize_event: Event = rtc_finalize_event
        self.__timeout: int = timeout

    # プロセスの終了を待ち、終了したら終了処理をおこなう。
    # プロセスの終了についての責任はここで持つ。
    def run(self) -> None:
        """終了通知後も残る process だけを強制終了し、handle を閉じる。"""

        while not self.__rtc_finalize_event.is_set() and self.__process.is_alive():
            time.sleep(1)
        self.__process.join(timeout=self.__timeout)
        if self.__process.is_alive():
            self.__logger.warning(
                f"{self.__session_id} process is not terminated. killing..."
            )
            self.__process.kill()
            self.__process.join()
        self.__process.close()
        self.__logger.info(f"{self.__session_id}: process terminated.")
