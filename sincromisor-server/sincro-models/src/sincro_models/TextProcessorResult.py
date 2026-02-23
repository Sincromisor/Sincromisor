from typing import Any

import msgpack
from pydantic import BaseModel, PrivateAttr

from .ChatHistory import ChatHistory, ChatMessage
from .TextProcessorRequest import TextProcessorRequest


class TextProcessorResult(BaseModel):
    # セッションのID。接続している間は同じ値となる。
    session_id: str
    # SpeechExtractorResultを送信するごとに割り振られるID。    sequence_id: int = 0
    sequence_id: int = 0
    # 発話が(request_messageの生成が)完了していたらTrue、
    # 未完了ならFalse。
    confirmed: bool = False
    # 会話履歴
    # request, resposeがそれぞれ確定した時点で更新される
    history: ChatHistory
    request_message: ChatMessage
    response_message: ChatMessage
    end_of_response: bool = False
    # VoiceSynthesizerで読み上げるテキスト。
    # 「こんにちは。今日もいい天気ですね。」なら
    # 「こんにちは」と「今日もいい天気ですね」がそれぞれtextに入る。
    # 一度VoiceSynthesizerに送ったら、同じテキストは再送しない。
    voice_text: str | None = None
    # ストリーミング応答先頭の ^N をチャンク跨ぎで安全に剥がすための内部状態。
    _response_prefix_checked: bool = PrivateAttr(default=False)
    _response_prefix_buffer: str = PrivateAttr(default="")

    def append_response_message(self, text: str) -> bool:
        visible_text = self.__consume_expression_prefix(text)
        if not visible_text:
            self.voice_text = None
            return False
        self.response_message.message += visible_text
        self.voice_text = visible_text
        return True

    def finalize(self):
        # ^ のみで終了する等の異常系でも、本文文字を欠落させない。
        if not self._response_prefix_checked and self._response_prefix_buffer:
            self.response_message.message += self._response_prefix_buffer
            self._response_prefix_buffer = ""
            self._response_prefix_checked = True
        self.voice_text = None
        self.end_of_response = True
        self.history.messages.append(self.response_message)

    def __consume_expression_prefix(self, text: str) -> str:
        if self._response_prefix_checked:
            return text

        self._response_prefix_buffer += text
        if self._response_prefix_buffer == "":
            return ""

        if not self._response_prefix_buffer.startswith("^"):
            visible_text = self._response_prefix_buffer
            self._response_prefix_buffer = ""
            self._response_prefix_checked = True
            return visible_text

        # 先頭1文字しか来ていない場合は次チャンクを待つ。
        if len(self._response_prefix_buffer) < 2:
            return ""

        code_char = self._response_prefix_buffer[1]
        if code_char in "012345":
            self.response_message.expression_code = int(code_char)
            visible_text = self._response_prefix_buffer[2:]
            self._response_prefix_buffer = ""
            self._response_prefix_checked = True
            return visible_text

        # ^N 形式でない場合は本文としてそのまま扱う。
        visible_text = self._response_prefix_buffer
        self._response_prefix_buffer = ""
        self._response_prefix_checked = True
        return visible_text

    @classmethod
    def from_request(
        cls,
        request: TextProcessorRequest,
        message_type: str,
        speaker_id: str,
        speaker_name: str,
    ) -> "TextProcessorResult":
        return TextProcessorResult(
            session_id=request.session_id,
            sequence_id=request.sequence_id,
            confirmed=request.confirmed,
            history=request.history,
            request_message=request.request_message,
            response_message=ChatMessage(
                speech_id=request.request_message.speech_id,
                message_type=message_type,
                speaker_id=speaker_id,
                speaker_name=speaker_name,
            ),
            end_of_response=False,
            voice_text=None,
        )

    @classmethod
    def from_msgpack(cls, pack: bytes) -> "TextProcessorResult":
        contents = msgpack.unpackb(pack)
        return TextProcessorResult(**contents)

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
                "response_message": self.response_message,
                "end_of_response": self.end_of_response,
                "voice_text": self.voice_text,
            },
            default=self.__msgpack_pack,
        )
        assert isinstance(pack, bytes), "msgpack.packb returned non-bytes"
        return pack

    """
    def to_json(self) -> str:
        return json.dumps(
            {
                "session_id": self.session_id,
                "speech_id": self.speech_id,
                "sequence_id": self.sequence_id,
                "confirmed": self.confirmed,
                "history": self.history,
                "request_message": self.request_message,
                "response_message": self.response_message,
                "end_of_response": self.end_of_response,
                "voice_text": self.voice_text,
            },
            ensure_ascii=False,
        )
    """
