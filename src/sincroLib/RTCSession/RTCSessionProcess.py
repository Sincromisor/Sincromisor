import logging
from logging import Logger
import asyncio
import json
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaRelay
from multiprocessing import Process
from multiprocessing.connection import Connection
from multiprocessing.sharedctypes import Synchronized
from setproctitle import setproctitle
from ..models import RTCVoiceChatSession
from .AudioTransformTrack import AudioTransformTrack
from ..AudioBroker import VoiceTransformTrack


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
        sdp_pipe: Connection,
        rtc_session_status: Synchronized,
        speech_extractor_status: Synchronized,
        voice_synthesizer_status: Synchronized,
    ):
        Process.__init__(self)
        self.logger: Logger = logging.getLogger(__name__ + f"[{session_id[0:8]}]")
        self.session_id: str = session_id
        self.request_sdp: str = request_sdp
        self.request_type: str = request_type
        self.server_sdp_pipe: Connection = sdp_pipe
        self.rtc_session_status: Synchronized = rtc_session_status
        self.speech_extractor_status: Synchronized = speech_extractor_status
        self.voice_synthesizer_status: Synchronized = voice_synthesizer_status
        self.session_id: str = session_id

    async def offer(self) -> dict:
        self.vcs = RTCVoiceChatSession(
            peer=RTCPeerConnection(),
            desc=RTCSessionDescription(sdp=self.request_sdp, type=self.request_type),
            session_id=self.session_id,
        )
        setproctitle(f"RTCSes[{self.session_id[0:5]}]")
        self.relay = MediaRelay()

        # self.logger.info(f"Created for {request.client}")

        @self.vcs.peer.on("datachannel")
        def on_datachannel(channel):
            self.logger.info(f"on_datachannel - {channel.label}")
            match channel.label:
                case "telop_ch":
                    self.vcs.telop_ch = channel
                case "text_ch":
                    self.vcs.text_ch = channel
                case _:
                    # 想定していないDataChannelが存在した場合
                    raise UnknownRTCDataChannel(channel.label)

            @channel.on("message")
            def on_message(message):
                self.logger.info(f"on_message - {channel.label} {message}")
                channel.send(json.dumps({"status": "pong", "label": channel.label}))

            channel.send(json.dumps({"status": "hello", "label": channel.label}))

        @self.vcs.peer.on("connectionstatechange")
        async def on_connectionstatechange():
            self.logger.info(
                f"on_connectionstatechange - {self.vcs.peer.connectionState}"
            )
            if self.vcs.peer.connectionState == "failed":
                await self.vcs.close()
            elif self.vcs.peer.connectionState == "closed":
                await self.vcs.delete()
                self.rtc_session_status.value = -1

        @self.vcs.peer.on("track")
        def on_track(track):
            self.logger.info(f"Track {track.kind} received.")
            if track.kind == "audio":
                """
                self.vcs.audio_transform_track = AudioTransformTrack(
                    self.relay.subscribe(track),
                    vcs=self.vcs,
                    speech_extractor_status=self.speech_extractor_status,
                    voice_synthesizer_status=self.voice_synthesizer_status,
                )
                """
                self.vcs.audio_transform_track = VoiceTransformTrack(
                    self.relay.subscribe(track),
                    vcs=self.vcs,
                )
                self.vcs.peer.addTrack(self.vcs.audio_transform_track)
            else:
                # 想定していないトラックが来た時はMediaBlackholeに投げないと、
                # メモリリークしまくる模様。
                self.logger.error(f"Unknown Track: {track.kind} {track}")
                raise UnknownRTCTrack(f"Unknown Track: {track.kind} {track}")

            @track.on("ended")
            async def on_ended():
                self.logger.info(f"Track {track.kind} ended.")
                # await vcs.close_track() # ここでclose()すると、connectionstatechangeでのcloseと重複する

        # handle offer
        await self.vcs.peer.setRemoteDescription(self.vcs.desc)

        # send answer
        answer = await self.vcs.peer.createAnswer()
        await self.vcs.peer.setLocalDescription(answer)

        return {
            "sdp": self.vcs.peer.localDescription.sdp,
            "type": self.vcs.peer.localDescription.type,
            "session_id": self.session_id,
        }

    async def serve(self) -> None:
        self.server_sdp_pipe.send(await self.offer())
        while self.rtc_session_status.value >= 0:
            await asyncio.sleep(1)
        self.logger.info(f"RTC session loop terminated.")
        self.server_sdp_pipe.close()
        if self.vcs:
            await self.vcs.close()
        self.logger.info(f"RTC connection closed.")

    def run(self) -> None:
        asyncio.run(self.serve())
        self.logger.info(f"RTC session terminated.")
