import json

import msgpack
from pydantic import BaseModel, ConfigDict


class VoiceSynthesizerResult(BaseModel):
    # np.ndarrayがメンバにいるとコケる問題対策
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # 元となったメッセージテキスト
    message: str
    # メッセージテキストから生成された音声クエリ
    query: dict
    # クエリをモーラごとに時系列で並べたもの
    mora_queue: list
    # 音声データの再生時間(s)
    speaking_time: float
    # 音声データ(エンコード済み)
    voice: bytes
    # 音声データフォーマット(audio/aac, audio/ogg;codecs=opus, audio/wavのいずれか)
    audio_format: str

    def to_msgpack(self) -> bytes:
        return msgpack.packb(
            {
                "message": self.message,
                "query": self.query,
                "mora_queue": self.mora_queue,
                "speaking_time": self.speaking_time,
                "voice": self.voice,
                "audio_format": self.audio_format,
            }
        )

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
        )

    @classmethod
    def from_msgpack(cls, vpackage: bytes) -> "VoiceSynthesizerResult":
        content = msgpack.unpackb(vpackage)
        return VoiceSynthesizerResult(
            message=content["message"],
            query=content["query"],
            mora_queue=content["mora_queue"],
            speaking_time=content["speaking_time"],
            voice=content["voice"],
            audio_format=content["audio_format"],
        )
