import time

import msgpack
from pydantic import BaseModel, Field


class SpeechExtractorInitializeRequest(BaseModel):
    session_id: str
    start_at: float = Field(default_factory=time.time)
    voice_sampling_rate: int = 16000
    voice_sample_bytes: int = 2
    voice_channels: int = 1

    @classmethod
    def from_msgpack(cls, pack) -> "SpeechExtractorInitializeRequest":
        return SpeechExtractorInitializeRequest(**msgpack.unpackb(pack))

    def to_msgpack(self) -> bytes:
        return msgpack.packb(
            {
                "session_id": self.session_id,
                "start_at": self.start_at,
                "voice_sampling_rate": self.voice_sampling_rate,
                "voice_sample_bytes": self.voice_sample_bytes,
                "voice_channels": self.voice_channels,
            },
        )
