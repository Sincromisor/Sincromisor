import asyncio
import logging
import socket
import traceback
from logging import Logger
from multiprocessing import Process
from multiprocessing.connection import Connection
from multiprocessing.synchronize import Event

from aiortc import (
    RTCConfiguration,
    RTCDataChannel,
    RTCIceServer,
    RTCPeerConnection,
    RTCSessionDescription,
)
from aiortc.contrib.media import MediaRelay
from aiortc.sdp import candidate_from_sdp
from setproctitle import setproctitle
from sincro_config import SincromisorConfig

from ..models import RTCVoiceChatSession
from .VoiceTransformTrack import VoiceTransformTrack


class UnknownRTCTrack(Exception):
    pass


class UnknownRTCDataChannel(Exception):
    pass


class RTCSessionProcess(Process):
    def __init__(
        self,
        session_id: str,
        request_sdp: str,
        request_type: str,
        request_talk_mode: str,
        sdp_pipe: Connection,
        rtc_finalize_event: Event,
        consul_agent_host: str | None,
        consul_agent_port: int | None,
        fallback_host: str | None = None,
        fallback_port: int | None = None,
    ):
        Process.__init__(self)
        self.__logger: Logger = logging.getLogger(
            "sincro." + self.__class__.__name__ + f"[{session_id[21:26]}]"
        )
        self.__session_id: str = session_id
        self.__request_sdp: str = request_sdp
        self.__request_type: str = request_type
        self.__request_talk_mode: str = request_talk_mode
        self.__server_sdp_pipe: Connection = sdp_pipe
        self.__rtc_finalize_event: Event = rtc_finalize_event
        self.__consul_agent_host: str | None = consul_agent_host
        self.__consul_agent_port: int | None = consul_agent_port
        self.__fallback_host: str | None = fallback_host
        self.__fallback_port: int | None = fallback_port
        # 運用監視用カウンタ:
        # candidate異常が断続的に出る環境で、件数を追えるようにする。
        self.__empty_candidate_count: int = 0
        self.__invalid_candidate_count: int = 0
        self.__vcs: RTCVoiceChatSession | None = None

    async def __add_ice_candidate(self, candidate: dict | None) -> None:
        if self.__vcs is None:
            self.__logger.warning(
                "ICE candidate ignored: session is not initialized yet."
            )
            return
        if candidate is None:
            # nullはend-of-candidates。aiortcにもNoneで明示的に渡す。
            await self.__vcs.peer.addIceCandidate(None)
            return

        candidate_sdp = candidate.get("candidate")
        if not candidate_sdp or not str(candidate_sdp).strip():
            # Firefox等で空candidateが来ることがあるため、終端扱いに寄せる。
            self.__empty_candidate_count += 1
            self.__logger.info(
                (
                    "ICE candidate normalized to end-of-candidates "
                    f"(empty payload count={self.__empty_candidate_count}, "
                    f"sdpMid={candidate.get('sdpMid')}, "
                    f"sdpMLineIndex={candidate.get('sdpMLineIndex')})"
                ),
            )
            await self.__vcs.peer.addIceCandidate(None)
            return

        try:
            if candidate_sdp.startswith("candidate:"):
                # ブラウザ実装差で接頭辞有無が揺れるため正規化する。
                candidate_sdp = candidate_sdp[len("candidate:") :]
            rtc_candidate = candidate_from_sdp(candidate_sdp)
            rtc_candidate.sdpMid = candidate.get("sdpMid")
            rtc_candidate.sdpMLineIndex = candidate.get("sdpMLineIndex")
            await self.__vcs.peer.addIceCandidate(rtc_candidate)
        except AssertionError:
            # aiortc.sdp.candidate_from_sdp() が期待フォーマット外で失敗したケース。
            # 想定内の入力不整合としてwarningで記録し、処理は継続する。
            self.__invalid_candidate_count += 1
            head = str(candidate_sdp).replace("\n", "\\n")[:160]
            self.__logger.warning(
                (
                    "Invalid ICE candidate ignored "
                    f"(count={self.__invalid_candidate_count}, "
                    f"sdpMid={candidate.get('sdpMid')}, "
                    f"sdpMLineIndex={candidate.get('sdpMLineIndex')}, "
                    f"candidate_head={head})"
                ),
            )
        except Exception:
            self.__logger.error(
                f"Failed to add ICE candidate.\n{traceback.format_exc()}",
            )
            traceback.print_exc()

    async def __handle_signal_message(self, message: dict) -> None:
        message_type = message.get("type")
        if message_type == "add_ice_candidate":
            await self.__add_ice_candidate(message.get("candidate"))
            return
        if message_type == "update_offer":
            await self.__update_offer(message)
            return

        self.__logger.warning(f"Unknown signal message type: {message_type}")

    async def __update_offer(self, message: dict) -> None:
        self.__logger.info(
            (
                "Received update_offer message "
                f"(session_id={self.__session_id}, has_vcs={self.__vcs is not None})"
            ),
        )
        try:
            answer = await self.__apply_offer(
                offer_sdp=message["sdp"],
                offer_type=message.get("offer_type", "offer"),
                offer_talk_mode=message.get("talk_mode"),
                offer_source="update_offer",
            )
            answer["message_type"] = "update_offer_result"
            self.__server_sdp_pipe.send(answer)
        except Exception:
            error_message = traceback.format_exc()
            self.__logger.error(
                (f"Failed to update offer in existing session.\n{error_message}"),
            )
            self.__server_sdp_pipe.send(
                {
                    "message_type": "update_offer_error",
                    "session_id": self.__session_id,
                    "error": "failed_to_update_offer",
                },
            )

    def __get_ice_servers(self):
        config = SincromisorConfig.from_yaml()
        ice_servers = []
        for stun_conf in config.get_ice_servers_conf(server_type="stun"):
            ice_servers.append(RTCIceServer(urls=stun_conf.Urls))
        for turn_conf in config.get_ice_servers_conf(server_type="turn"):
            ice_servers.append(
                RTCIceServer(
                    urls=turn_conf.Urls,
                    username=turn_conf.UserName,
                    credential=turn_conf.Credential,
                ),
            )
        self.__logger.debug(f"IceServers: {ice_servers}")
        return ice_servers

    def __init_peer(self) -> None:
        vcs = RTCVoiceChatSession(
            peer=RTCPeerConnection(
                configuration=RTCConfiguration(iceServers=self.__get_ice_servers()),
            ),
            desc=RTCSessionDescription(
                sdp=self.__request_sdp,
                type=self.__request_type,
            ),
            session_id=self.__session_id,
            talk_mode=self.__request_talk_mode,
        )
        self.__vcs = vcs
        setproctitle(f"RTCSes[{self.__session_id[21:26]}]")
        self.relay = MediaRelay()

        @vcs.peer.on("datachannel")
        def on_datachannel(channel: RTCDataChannel):
            self.__logger.info(f"on_datachannel - {channel.label}")
            match channel.label:
                case "telop_ch":
                    vcs.telop_ch = channel
                case "text_ch":
                    vcs.text_ch = channel
                case _:
                    # 想定していないDataChannelが存在した場合
                    self.__rtc_finalize_event.set()
                    raise UnknownRTCDataChannel(channel.label)

            @channel.on("message")
            def on_message(message):
                self.__logger.info(f"on_message - {channel.label} {message}")

        @vcs.peer.on("connectionstatechange")
        async def on_connectionstatechange():
            await self.__handle_connection_state_change(vcs)

        @vcs.peer.on("track")
        def on_track(track):
            self.__logger.info(f"Track {track.kind} received.")
            if track.kind == "audio":
                # 既存トランシーバ利用で再Offerが来るため、音声変換トラックは初回のみ追加する。
                if vcs.audio_transform_track is None:
                    vcs.audio_transform_track = VoiceTransformTrack(
                        track=self.relay.subscribe(track),
                        vcs=vcs,
                        rtc_finalize_event=self.__rtc_finalize_event,
                        consul_agent_host=self.__consul_agent_host,
                        consul_agent_port=self.__consul_agent_port,
                        fallback_host=self.__fallback_host,
                        fallback_port=self.__fallback_port,
                    )
                    vcs.peer.addTrack(vcs.audio_transform_track)
                else:
                    self.__logger.info(
                        "audio track already initialized. keep existing transform track."
                    )
            else:
                # 想定していないトラックが来た時はMediaBlackholeに投げないと、
                # メモリリークしまくる模様。
                self.__logger.error(f"Unknown Track: {track.kind} {track}")
                self.__rtc_finalize_event.set()
                raise UnknownRTCTrack(f"Unknown Track: {track.kind} {track}")

            @track.on("ended")
            async def on_ended():
                self.__logger.info(f"Track {track.kind} ended.")

    async def __handle_connection_state_change(self, vcs: RTCVoiceChatSession) -> None:
        """failed peer の所有資源を即時解放し、process loop の終了を通知する。"""

        self.__logger.info(
            f"on_connectionstatechange - {vcs.peer.connectionState}",
        )
        if vcs.peer.connectionState == "failed":
            self.__rtc_finalize_event.set()
            await vcs.close()
        elif vcs.peer.connectionState == "closed":
            self.__rtc_finalize_event.set()

    async def __apply_offer(
        self,
        offer_sdp: str,
        offer_type: str,
        offer_talk_mode: str | None,
        offer_source: str,
    ) -> dict:
        if self.__vcs is None:
            self.__logger.info(
                f"Initialize peer for offer handling (source={offer_source}, session_id={self.__session_id})",
            )
            self.__init_peer()
        assert self.__vcs is not None, "RTC session must be initialized."

        if offer_talk_mode and offer_talk_mode != self.__vcs.talk_mode:
            self.__logger.warning(
                (
                    "Requested talk_mode update is ignored. "
                    f"current={self.__vcs.talk_mode}, requested={offer_talk_mode}"
                ),
            )

        self.__vcs.desc = RTCSessionDescription(
            sdp=offer_sdp,
            type=offer_type,
        )

        self.__logger.info(
            (
                "Apply remote offer "
                f"(source={offer_source}, session_id={self.__session_id}, "
                f"offer_type={offer_type}, signaling_state={self.__vcs.peer.signalingState})"
            ),
        )
        await self.__vcs.peer.setRemoteDescription(self.__vcs.desc)

        try:
            answer: RTCSessionDescription | None = await self.__vcs.peer.createAnswer()
            assert isinstance(answer, RTCSessionDescription), (
                "Failed to create RTCSessionDescription."
            )
            # 設定されているstun/turnサーバが利用できない時にエラーとなる
            # [Sincromisor]E: socket.gaierror: [Errno -2] Name or service not known
            await self.__vcs.peer.setLocalDescription(answer)
            self.__logger.info(
                (
                    "Generated local answer "
                    f"(source={offer_source}, session_id={self.__session_id}, "
                    f"signaling_state={self.__vcs.peer.signalingState})"
                ),
            )
        except socket.gaierror as e:
            self.__logger.error(f"ConnectionError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
            self.__rtc_finalize_event.set()
            raise
        except Exception as e:
            self.__logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
            self.__rtc_finalize_event.set()
            raise

        return {
            "sdp": self.__vcs.peer.localDescription.sdp,
            "type": self.__vcs.peer.localDescription.type,
            "session_id": self.__session_id,
        }

    async def __offer(self) -> dict:
        return await self.__apply_offer(
            offer_sdp=self.__request_sdp,
            offer_type=self.__request_type,
            offer_talk_mode=self.__request_talk_mode,
            offer_source="initial_offer",
        )

    async def __serve(self) -> None:
        try:
            self.__server_sdp_pipe.send(await self.__offer())
        except Exception:
            self.__logger.error(
                f"Failed to create initial offer/answer.\n{traceback.format_exc()}",
            )
            self.__server_sdp_pipe.send(
                {
                    "message_type": "offer_error",
                    "session_id": self.__session_id,
                    "error": "failed_to_create_initial_answer",
                },
            )
            self.__rtc_finalize_event.set()
        while self.__rtc_finalize_event.is_set() is False:
            try:
                # Trickle ICE後送用メッセージを親プロセスから受信し、
                # 同一イベントループ上でRTCPeerConnectionへ反映する。
                while self.__server_sdp_pipe.poll():
                    message = self.__server_sdp_pipe.recv()
                    if isinstance(message, dict):
                        await self.__handle_signal_message(message)
            except EOFError:
                self.__rtc_finalize_event.set()
            # busy loop回避。candidate適用遅延を抑えるため短いsleepにする。
            await asyncio.sleep(0.01)
        self.__logger.info("RTC session loop terminated.")
        self.__server_sdp_pipe.close()
        if self.__vcs:
            await self.__vcs.close()
        self.__logger.info("RTC connection closed.")

    def run(self) -> None:
        asyncio.run(self.__serve())
        self.__logger.info("RTC session process terminated.")
