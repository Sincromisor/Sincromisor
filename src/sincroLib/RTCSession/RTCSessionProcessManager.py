import uuid
import traceback
import logging
from logging import Logger
from multiprocessing import Pipe, Value
from multiprocessing.connection import Connection
from multiprocessing.sharedctypes import Synchronized
from ..RTCSession import RTCSessionProcess
from ..models import RTCSessionOffer


class RTCSessionProcessManager:
    def __init__(self):
        self.logger: Logger = logging.getLogger(__name__)
        self.processes: dict = {}
        self.join_timeout: int = 10

    # WebRTCのセッションを持つプロセスを新たに生成し、
    # そのプロセスが持つセッションのSDPをdictとして返す。
    def create_session(self, offer: RTCSessionOffer) -> dict:
        session_id: str = str(uuid.uuid4())
        sv_pipe: Connection
        cl_pipe: Connection
        sv_pipe, cl_pipe = Pipe()
        rtc_session_status: Synchronized = Value("b", 1)
        ps: RTCSessionProcess = RTCSessionProcess(
            session_id=session_id,
            request_sdp=offer.sdp,
            request_type=offer.type,
            sdp_pipe=cl_pipe,
            rtc_session_status=rtc_session_status,
        )
        ps.start()
        self.processes[session_id] = {
            "process": ps,
            "pipe": sv_pipe,
            "rtcSessionStatus": rtc_session_status,
        }
        return sv_pipe.recv()

    def cleanup_sessions(self) -> list[str]:
        for session_id, psInfo in list(self.processes.items()):
            if psInfo["rtcSessionStatus"].value <= -1:
                psInfo["pipe"].close()
                psInfo["process"].join(self.join_timeout)
                psInfo["process"].close()
                del self.processes[session_id]
        return list(self.processes.keys())

    def shutdown(self) -> None:
        for session_id, ps_info in self.processes.items():
            try:
                ps_info["rtcSessionStatus"].value = -1
            except:
                self.logger.error(
                    f"[{session_id}] Change session status: UnknownError - {traceback.format_exc()}"
                )
                traceback.print_exc()

        for session_id, ps_info in self.processes.items():
            try:
                ps_info["pipe"].close()
                ps_info["process"].join(self.join_timeout)
                ps_info["process"].close()
            except:
                self.logger.error(
                    f"[{session_id}] RTC session close: UnknownError - {traceback.format_exc()}"
                )
                traceback.print_exc()
