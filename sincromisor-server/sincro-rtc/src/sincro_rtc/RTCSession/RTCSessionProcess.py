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
        consul_agent_host: str,
        consul_agent_port: int,
    ):
        Process.__init__(self)
        self.__logger: Logger = logging.getLogger(__name__ + f"[{session_id[21:26]}]")
        self.__session_id: str = session_id
        self.__request_sdp: str = request_sdp
        self.__request_type: str = request_type
        self.__request_talk_mode: str = request_talk_mode
        self.__server_sdp_pipe: Connection = sdp_pipe
        self.__rtc_finalize_event: Event = rtc_finalize_event
        self.__consul_agent_host = consul_agent_host
        self.__consul_agent_port = consul_agent_port

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

    async def __offer(self) -> dict:
        self.__vcs = RTCVoiceChatSession(
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
        setproctitle(f"RTCSes[{self.__session_id[21:26]}]")
        self.relay = MediaRelay()

        # self.logger.info(f"Created for {request.client}")

        @self.__vcs.peer.on("datachannel")
        def on_datachannel(channel: RTCDataChannel):
            self.__logger.info(f"on_datachannel - {channel.label}")
            match channel.label:
                case "telop_ch":
                    self.__vcs.telop_ch = channel
                case "text_ch":
                    self.__vcs.text_ch = channel
                case _:
                    # 想定していないDataChannelが存在した場合
                    self.__rtc_finalize_event.set()
                    raise UnknownRTCDataChannel(channel.label)

            @channel.on("message")
            def on_message(message):
                self.__logger.info(f"on_message - {channel.label} {message}")
                # channel.send(json.dumps({"response": f"pong - {message}"}))

        @self.__vcs.peer.on("connectionstatechange")
        async def on_connectionstatechange():
            self.__logger.info(
                f"on_connectionstatechange - {self.__vcs.peer.connectionState}",
            )
            if self.__vcs.peer.connectionState == "failed":
                self.__rtc_finalize_event.set()
                await self.__vcs.close()
            elif self.__vcs.peer.connectionState == "closed":
                self.__rtc_finalize_event.set()

        @self.__vcs.peer.on("track")
        def on_track(track):
            self.__logger.info(f"Track {track.kind} received.")
            if track.kind == "audio":
                self.__vcs.audio_transform_track = VoiceTransformTrack(
                    track=self.relay.subscribe(track),
                    vcs=self.__vcs,
                    rtc_finalize_event=self.__rtc_finalize_event,
                    consul_agent_host=self.__consul_agent_host,
                    consul_agent_port=self.__consul_agent_port,
                )
                self.__vcs.peer.addTrack(self.__vcs.audio_transform_track)
            else:
                # 想定していないトラックが来た時はMediaBlackholeに投げないと、
                # メモリリークしまくる模様。
                self.__logger.error(f"Unknown Track: {track.kind} {track}")
                self.__rtc_finalize_event.set()
                raise UnknownRTCTrack(f"Unknown Track: {track.kind} {track}")

            @track.on("ended")
            async def on_ended():
                self.__logger.info(f"Track {track.kind} ended.")

        # handle offer
        await self.__vcs.peer.setRemoteDescription(self.__vcs.desc)

        try:
            # send answer
            answer: RTCSessionDescription = await self.__vcs.peer.createAnswer()
            # 設定されているstun/turnサーバが利用できない時にエラーとなる
            # [Sincromisor]E: socket.gaierror: [Errno -2] Name or service not known
            await self.__vcs.peer.setLocalDescription(answer)
        except socket.gaierror as e:
            self.__logger.error(f"ConnectionError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
            self.__rtc_finalize_event.set()
        except Exception as e:
            self.__logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
            traceback.print_exc()
            self.__rtc_finalize_event.set()

        return {
            "sdp": self.__vcs.peer.localDescription.sdp,
            "type": self.__vcs.peer.localDescription.type,
            "session_id": self.__session_id,
        }

    async def __serve(self) -> None:
        self.__server_sdp_pipe.send(await self.__offer())
        while self.__rtc_finalize_event.is_set() is False:
            await asyncio.sleep(1)
        self.__logger.info("RTC session loop terminated.")
        self.__server_sdp_pipe.close()
        if self.__vcs:
            await self.__vcs.close()
        self.__logger.info("RTC connection closed.")

    def run(self) -> None:
        asyncio.run(self.__serve())
        self.__logger.info("RTC session process terminated.")
