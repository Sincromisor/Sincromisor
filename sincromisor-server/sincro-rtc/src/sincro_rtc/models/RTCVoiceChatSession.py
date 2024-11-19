from datetime import datetime

from aiortc import MediaStreamTrack, RTCPeerConnection, RTCSessionDescription
from aiortc.rtcdatachannel import RTCDataChannel
from pydantic import BaseModel, ConfigDict
from ulid import ULID

# class AudioTransformTrack(MediaStreamTrack):
#    pass


class RTCVoiceChatSession(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    # session_idはRTCSessionManagerで採番される。
    session_id: str
    # session_id: ULID = Field(default_factory=ULID)
    peer: RTCPeerConnection
    desc: RTCSessionDescription
    audio_transform_track: MediaStreamTrack | None = None
    telop_ch: RTCDataChannel | None = None
    text_ch: RTCDataChannel | None = None
    # TextProcessorに渡される
    # chat or poke
    talk_mode: str = "chat"
    closed: bool = False

    def __hash__(self) -> int:
        return int(self.session_id)

    def __eq__(self, other: "RTCVoiceChatSession") -> bool:
        return self.session_id == other.session_id

    async def close(self) -> None:
        if self.closed:
            return
        if self.audio_transform_track:
            self.audio_transform_track.close()
        if self.telop_ch:
            self.telop_ch.close()
        if self.text_ch:
            self.text_ch.close()
        await self.peer.close()
        self.closed = True

    async def delete(self) -> None:
        del self.audio_transform_track
        del self.desc
        del self.peer
        del self.telop_ch
        del self.text_ch

    def start_at(self) -> datetime:
        return ULID.from_str(self.session_id).datetime
