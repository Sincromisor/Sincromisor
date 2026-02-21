import logging
import traceback
from logging import Logger
from multiprocessing import Event as MPEvent
from multiprocessing import Pipe
from multiprocessing.connection import Connection
from multiprocessing.synchronize import Event
from threading import Lock

from ulid import ULID

from ..models import RTCSessionCandidate, RTCSessionOffer
from .RTCSessionProcess import RTCSessionProcess
from .RTCSessionProcessDescription import RTCSessionProcessDescription
from .RTCSessionProcessManagementThread import RTCSessionProcessManagementThread


class RTCSessionManager:
    def __init__(
        self,
        consul_agent_host: str | None,
        consul_agent_port: int | None,
        fallback_host: str | None,
        fallback_port: int | None,
    ):
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__processes: dict[str, RTCSessionProcessDescription] = {}
        self.__join_timeout: int = 10
        self.__consul_agent_host: str | None = consul_agent_host
        self.__consul_agent_port: int | None = consul_agent_port
        self.__fallback_host: str | None = fallback_host
        self.__fallback_port: int | None = fallback_port
        # FastAPIハンドラの並行実行時に、session辞書操作とPipe送受信を直列化する。
        self.__lock = Lock()

    # WebRTCのセッションを持つプロセスを新たに生成し、
    # そのプロセスが持つセッションのSDPをdictとして返す。
    def create_session(self, offer: RTCSessionOffer) -> dict:
        with self.__lock:
            return self.__create_session_locked(offer)

    def create_or_update_session(self, offer: RTCSessionOffer) -> dict:
        with self.__lock:
            requested_session_id = offer.session_id
            if requested_session_id:
                self.__logger.info(
                    f"Try session update via /offer (session_id={requested_session_id})",
                )
                session_desc: RTCSessionProcessDescription | None = self.__processes.get(
                    requested_session_id
                )
                if session_desc is not None and session_desc.is_active():
                    updated = self.__update_session_locked(
                        session_desc=session_desc,
                        offer=offer,
                    )
                    if updated is not None:
                        self.__logger.info(
                            f"Session update accepted (session_id={requested_session_id})",
                        )
                        return updated
                    self.__logger.warning(
                        (
                            "Failed to update existing session. "
                            f"Fallback to create new session (session_id={requested_session_id})."
                        ),
                    )
                else:
                    self.__logger.info(
                        (
                            "Requested session for update is unavailable. "
                            f"Fallback to create new session (session_id={requested_session_id})."
                        ),
                    )
            return self.__create_session_locked(offer)

    def __create_session_locked(self, offer: RTCSessionOffer) -> dict:
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
            fallback_host=self.__fallback_host,
            fallback_port=self.__fallback_port,
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
        self.__logger.info(
            (
                "Create new RTC session process "
                f"(session_id={session_id}, talk_mode={offer.talk_mode})"
            ),
        )
        response = sv_pipe.recv()
        if isinstance(response, dict) and response.get("message_type") == "offer_error":
            raise RuntimeError(response.get("error", "failed_to_create_initial_answer"))
        return response

    def __update_session_locked(
        self,
        session_desc: RTCSessionProcessDescription,
        offer: RTCSessionOffer,
    ) -> dict | None:
        try:
            self.__logger.info(
                f"Forward update_offer to session process (session_id={session_desc.session_id})",
            )
            session_desc.sv_pipe.send(
                {
                    "type": "update_offer",
                    "sdp": offer.sdp,
                    "offer_type": offer.type,
                    "talk_mode": offer.talk_mode,
                }
            )
            response = session_desc.sv_pipe.recv()
        except Exception:
            self.__logger.error(
                (
                    f"[{session_desc.session_id}] Failed to update session offer."
                    f"\n{traceback.format_exc()}"
                ),
            )
            return None

        if not isinstance(response, dict):
            self.__logger.error(
                f"[{session_desc.session_id}] Invalid update response type: {type(response)}"
            )
            return None

        message_type = response.get("message_type")
        if message_type == "update_offer_result":
            response.pop("message_type", None)
            return response
        if message_type == "update_offer_error":
            self.__logger.warning(
                (
                    f"[{session_desc.session_id}] Update offer rejected by session process: "
                    f"{response.get('error', 'unknown error')}"
                ),
            )
            return None
        self.__logger.warning(
            (
                f"[{session_desc.session_id}] Unexpected update response payload. "
                f"message_type={message_type}"
            ),
        )
        return None

    def session_count(self) -> int:
        with self.__lock:
            return len(self.__processes)

    def add_ice_candidate(self, session_candidate: RTCSessionCandidate) -> bool:
        with self.__lock:
            return self.__add_ice_candidate_locked(session_candidate)

    def __add_ice_candidate_locked(self, session_candidate: RTCSessionCandidate) -> bool:
        # セッション単位で独立プロセスを持つ設計のため、
        # candidate適用は「親プロセス -> 対象子プロセス」へPipeで中継する。
        session_desc: RTCSessionProcessDescription | None = self.__processes.get(
            session_candidate.session_id
        )
        if session_desc is None:
            return False
        if not session_desc.is_active():
            return False

        try:
            session_desc.sv_pipe.send(
                {
                    "type": "add_ice_candidate",
                    "candidate": (
                        session_candidate.candidate.model_dump()
                        if session_candidate.candidate is not None
                        else None
                    ),
                }
            )
            return True
        except Exception:
            self.__logger.error(
                (
                    f"[{session_candidate.session_id}] Failed to add ICE candidate."
                    f"\n{traceback.format_exc()}"
                ),
            )
            traceback.print_exc()
            return False

    # 終了済みのセッションを閉じる。
    # 残ったセッションのセッションIDの一覧を返す。
    def cleanup_sessions(self) -> list[str]:
        with self.__lock:
            return self.__cleanup_sessions_locked()

    def __cleanup_sessions_locked(self) -> list[str]:
        session_id: str
        session_desc: RTCSessionProcessDescription
        for session_id, session_desc in list(self.__processes.items()):
            if not session_desc.is_active():
                session_desc.close(timeout=self.__join_timeout)
                del self.__processes[session_id]
        return list(self.__processes.keys())

    def shutdown(self) -> None:
        with self.__lock:
            self.__shutdown_locked()
        self.__logger.info("RTCSessionManager is shutdown.")

    def __shutdown_locked(self) -> None:
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
