import json
from typing import Any

import msgpack
from pydantic import BaseModel, ConfigDict

from .VoiceVoxQuery import VoiceVoxAccentPhrase, VoiceVoxMora, VoiceVoxQuery


class VoiceSynthesizerMora(BaseModel):
    # a,i,u,e,o,N
    vowel: str | None = None
    length: float = 0.0
    text: str | None = None


class VoiceSynthesizerResult(BaseModel):
    # np.ndarrayがメンバにいるとコケる問題対策
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # 元となったメッセージテキスト
    message: str
    # メッセージテキストから生成された音声クエリ
    query: VoiceVoxQuery
    # クエリをモーラごとに時系列で並べたもの
    mora_queue: list[VoiceSynthesizerMora]
    # 音声データの再生時間(s)
    speaking_time: float
    # 音声データ(エンコード済み)
    voice: bytes
    # 音声データフォーマット(audio/aac, audio/ogg;codecs=opus, audio/wavのいずれか)
    audio_format: str

    def to_msgpack(self) -> bytes:
        pack: Any | None = msgpack.packb(
            {
                "message": self.message,
                "query": self.query,
                "mora_queue": self.mora_queue,
                "speaking_time": self.speaking_time,
                "voice": self.voice,
                "audio_format": self.audio_format,
            },
            default=self.__object_pack,
        )
        assert isinstance(pack, bytes), "msgpack.packb returned non-bytes"
        return pack

    def to_json(self) -> str:
        return json.dumps(
            {
                "message": self.message,
                "query": self.query,
                "mora_queue": self.mora_queue,
                "speaking_time": self.speaking_time,
                "audio_format": self.audio_format,
            },
            ensure_ascii=False,
            default=self.__object_pack,
        )

    def __object_pack(self, obj):
        if isinstance(obj, VoiceSynthesizerMora):
            return obj.model_dump()
        if isinstance(obj, VoiceVoxQuery):
            return obj.model_dump()
        if isinstance(obj, VoiceVoxAccentPhrase):
            return obj.model_dump()
        if isinstance(obj, VoiceVoxMora):
            return obj.model_dump()
        return obj

    @classmethod
    def from_msgpack(cls, vpackage: bytes) -> "VoiceSynthesizerResult":
        content = msgpack.unpackb(vpackage)
        mora_queue = [
            VoiceSynthesizerMora.model_validate(m) for m in content["mora_queue"]
        ]
        return VoiceSynthesizerResult(
            message=content["message"],
            query=VoiceVoxQuery.model_validate(content["query"]),
            mora_queue=mora_queue,
            speaking_time=content["speaking_time"],
            voice=content["voice"],
            audio_format=content["audio_format"],
        )
