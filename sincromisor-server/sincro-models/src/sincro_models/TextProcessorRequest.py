from typing import Any

import msgpack
from pydantic import BaseModel

from .ChatHistory import ChatHistory, ChatMessage


# Go pipeline coordinatorで生成され、
# TextProcessorProcessに送られる。
# 発話と音声認識が未完了であっても処理が行われることを前提とする。
class TextProcessorRequest(BaseModel):
    # セッションのID。接続している間は同じ値となる。
    session_id: str
    # SpeechExtractorResultを送信するごとに割り振られるID。
    sequence_id: int = 0
    # 発話が(request_messageの生成が)完了していたらTrue、
    # 未完了ならFalse。
    confirmed: bool = False
    # 会話履歴
    history: ChatHistory
    request_message: ChatMessage

    @classmethod
    def from_msgpack(cls, pack: bytes) -> "TextProcessorRequest":
        contents = msgpack.unpackb(pack)
        return TextProcessorRequest(**contents)

    def __msgpack_pack(self, obj):
        if isinstance(obj, ChatHistory):
            return obj.model_dump()
        if isinstance(obj, ChatMessage):
            return obj.model_dump()
        return obj

    def to_msgpack(self) -> bytes:
        pack: Any | None = msgpack.packb(
            {
                "session_id": self.session_id,
                "sequence_id": self.sequence_id,
                "confirmed": self.confirmed,
                "history": self.history,
                "request_message": self.request_message,
            },
            default=self.__msgpack_pack,
        )
        assert isinstance(pack, bytes), "msgpack.packb returned non-bytes"
        return pack
