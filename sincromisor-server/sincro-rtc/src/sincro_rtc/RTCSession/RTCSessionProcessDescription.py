from multiprocessing.connection import Connection
from multiprocessing.synchronize import Event

from pydantic import BaseModel, ConfigDict

from .RTCSessionProcessManagementThread import RTCSessionProcessManagementThread


class RTCSessionProcessDescription(BaseModel):
    session_id: str
    mgmt_t: RTCSessionProcessManagementThread
    rtc_finalize_event: Event
    sv_pipe: Connection

    model_config = ConfigDict(arbitrary_types_allowed=True)

    def is_active(self) -> bool:
        return not self.rtc_finalize_event.is_set()

    def close(self, timeout: int) -> None:
        self.rtc_finalize_event.set()
        self.mgmt_t.join(timeout=timeout)
        self.sv_pipe.close()
