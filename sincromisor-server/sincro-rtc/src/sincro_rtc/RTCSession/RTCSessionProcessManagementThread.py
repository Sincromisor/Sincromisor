import logging
import time
from logging import Logger
from multiprocessing.synchronize import Event
from threading import Thread

from .RTCSessionProcess import RTCSessionProcess


class RTCSessionProcessManagementThread(Thread):
    def __init__(
        self,
        session_id: str,
        process: RTCSessionProcess,
        rtc_finalize_event: Event,
        timeout: int,
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger("sincro." + __name__)
        self.__session_id = session_id
        self.__process: RTCSessionProcess = process
        self.__rtc_finalize_event: Event = rtc_finalize_event
        self.__timeout: int = timeout

    # プロセスの終了を待ち、終了したら終了処理をおこなう。
    # プロセスの終了についての責任はここで持つ。
    def run(self) -> None:
        while self.__rtc_finalize_event.is_set() is None and self.__process.is_alive():
            time.sleep(1)
        if self.__process.join(timeout=self.__timeout) is None:
            self.__logger.warning(
                f"{self.__session_id} process is not terminated. killing..."
            )
            self.__process.kill()
            self.__process.join()
        self.__process.close()
        self.__logger.info(f"{self.__session_id}: process terminated.")
