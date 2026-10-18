"""完成音声の保存モデルから独立した、会話用48kHz mono PCM区間契約。"""

from typing import Self

import msgpack
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .VoiceSynthesizerResult import VoiceSynthesizerMora


class VoiceSynthesizerChunk(BaseModel):
    """要求内の連番とサンプル位置を持つ区間。空のfinalだけが正常終了を表す。"""

    model_config = ConfigDict(extra="forbid", strict=True)
    request_id: int = Field(ge=1)
    speech_id: int = Field(ge=0)
    sequence: int = Field(ge=0)
    sample_offset: int = Field(ge=0, le=48_000 * 120)
    final: bool
    pcm: bytes
    message: str
    mora_queue: list[VoiceSynthesizerMora]

    @model_validator(mode="after")
    def validate_interval(self) -> Self:
        """独立区間の形式を検証する。要求をまたぐ順序は受信側が検証する。"""
        if self.final:
            if self.sequence == 0 or self.pcm or self.message or self.mora_queue:
                raise ValueError("Invalid synthesis completion chunk")
        elif not self.pcm or len(self.pcm) % 2 or len(self.pcm) > 48_000:
            raise ValueError("Invalid synthesis PCM chunk")
        if self.sample_offset + len(self.pcm) // 2 > 48_000 * 120:
            raise ValueError("Synthesis exceeds duration limit")
        if self.sequence == 0:
            if self.sample_offset != 0 or not self.message:
                raise ValueError("Invalid synthesis first chunk")
        elif self.message or self.mora_queue:
            raise ValueError("Repeated synthesis metadata")
        return self

    def to_msgpack(self) -> bytes:
        """PCMをバイナリのまま区間専用のMessagePackへ変換する。"""
        packed = msgpack.packb(self.model_dump())
        if not isinstance(packed, bytes):
            raise TypeError("MessagePack encoder returned non-bytes")
        return packed

    @classmethod
    def from_msgpack(cls, packed: bytes) -> Self:
        """全必須キーと型を境界で検証し、省略や暗黙変換を拒否する。"""
        return cls.model_validate(msgpack.unpackb(packed))
