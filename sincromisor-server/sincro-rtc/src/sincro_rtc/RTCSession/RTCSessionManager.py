import logging
import traceback
from logging import Logger
from multiprocessing import Event as MPEvent
from multiprocessing import Pipe
from multiprocessing.connection import Connection
from multiprocessing.synchronize import Event

from ulid import ULID

from ..models import RTCSessionOffer
from .RTCSessionProcess import RTCSessionProcess
from .RTCSessionProcessDescription import RTCSessionProcessDescription
from .RTCSessionProcessManagementThread import RTCSessionProcessManagementThread


class RTCSessionManager:
    def __init__(self, consul_agent_host: str, consul_agent_port: int):
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__processes: dict[str, RTCSessionProcessDescription] = {}
        self.__join_timeout: int = 10
        self.__consul_agent_host: str = consul_agent_host
        self.__consul_agent_port: int = consul_agent_port

    # WebRTCのセッションを持つプロセスを新たに生成し、
    # そのプロセスが持つセッションのSDPをdictとして返す。
    def create_session(self, offer: RTCSessionOffer) -> dict:
        # session_idはここで生成し、
        # RTCVoiceChatSessionを持つRTCSessionProcessと共有する。
        session_id: str = str(ULID())
        sv_pipe: Connection
        cl_pipe: Connection
        sv_pipe, cl_pipe = Pipe()
        rtc_finalize_event: Event = MPEvent()
        ps: RTCSessionProcess = RTCSessionProcess(
            session_id=session_id,
            request_sdp=offer.sdp,
            request_type=offer.type,
            request_talk_mode=offer.talk_mode,
            rtc_finalize_event=rtc_finalize_event,
            sdp_pipe=cl_pipe,
            consul_agent_host=self.__consul_agent_host,
            consul_agent_port=self.__consul_agent_port,
        )
        ps.start()

        mgmt_t: RTCSessionProcessManagementThread = RTCSessionProcessManagementThread(
            session_id=session_id,
            process=ps,
            rtc_finalize_event=rtc_finalize_event,
            timeout=self.__join_timeout,
        )
        mgmt_t.start()

        self.__processes[session_id] = RTCSessionProcessDescription(
            session_id=session_id,
            mgmt_t=mgmt_t,
            rtc_finalize_event=rtc_finalize_event,
            sv_pipe=sv_pipe,
        )
        return sv_pipe.recv()

    def session_count(self) -> int:
        return len(self.__processes)

    # 終了済みのセッションを閉じる。
    # 残ったセッションのセッションIDの一覧を返す。
    def cleanup_sessions(self) -> list[str]:
        session_id: str
        session_desc: RTCSessionProcessDescription
        for session_id, session_desc in list(self.__processes.items()):
            if not session_desc.is_active():
                session_desc.close(timeout=self.__join_timeout)
                del self.__processes[session_id]
        return list(self.__processes.keys())

    def shutdown(self) -> None:
        session_id: str
        session_desc: RTCSessionProcessDescription
        for session_id, session_desc in self.__processes.items():
            try:
                session_desc.close(timeout=self.__join_timeout)
            except Exception:
                self.__logger.error(
                    f"[{session_id}] Change session status: UnknownError - {traceback.format_exc()}",
                )
                traceback.print_exc()
        self.__processes.clear()
        self.__logger.info("RTCSessionManager is shutdown.")
