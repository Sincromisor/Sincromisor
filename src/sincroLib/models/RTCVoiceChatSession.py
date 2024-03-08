from pydantic import BaseModel, ConfigDict, Field
from aiortc import RTCPeerConnection, RTCSessionDescription, MediaStreamTrack
from aiortc.rtcdatachannel import RTCDataChannel

# from uuid import uuid4, UUID


# class AudioTransformTrack(MediaStreamTrack):
#    pass


class RTCVoiceChatSession(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    session_id: str
    # session_id: UUID = Field(default_factory=uuid4)
    peer: RTCPeerConnection
    desc: RTCSessionDescription
    audio_transform_track: MediaStreamTrack | None = None
    telop_ch: RTCDataChannel | None = None
    text_ch: RTCDataChannel | None = None
    closed: bool = False

    def __hash__(self) -> int:
        return int(self.session_id)

    def __eq__(self, other) -> bool:
        return self.session_id == other.session_id

    # def track_id(self):
    #    return str(self.session_id)[0:6]

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
        del self.desc
        del self.peer
        del self.telop_ch
        del self.text_ch
