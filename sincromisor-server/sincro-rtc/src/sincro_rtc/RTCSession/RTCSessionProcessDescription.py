from multiprocessing.connection import Connection
from multiprocessing.synchronize import Event
from threading import Lock

from pydantic import BaseModel, ConfigDict, PrivateAttr

from .RTCSessionProcessManagementThread import RTCSessionProcessManagementThread


class RTCSessionProcessDescription(BaseModel):
    """親が所有する子プロセスの signaling pipe と終了処理を束ねる。"""

    session_id: str
    mgmt_t: RTCSessionProcessManagementThread
    rtc_finalize_event: Event
    sv_pipe: Connection

    model_config = ConfigDict(arbitrary_types_allowed=True)
    _close_lock: Lock = PrivateAttr(default_factory=Lock)
    _closed: bool = PrivateAttr(default=False)

    def is_active(self) -> bool:
        """終了通知前で signaling を受理できるかを返す。"""

        return not self.rtc_finalize_event.is_set()

    def close(self, timeout: int) -> None:
        """終了通知、process 管理 thread 待機、pipe 解放を一度だけ行う。"""

        with self._close_lock:
            if self._closed:
                return
            self._closed = True
            self.rtc_finalize_event.set()
            self.mgmt_t.join(timeout=timeout)
            self.sv_pipe.close()
