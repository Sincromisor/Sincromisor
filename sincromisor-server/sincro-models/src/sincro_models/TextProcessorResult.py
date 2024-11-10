from pydantic import BaseModel
import msgpack
import json
from .ChatHistory import ChatHistory, ChatMessage
from .TextProcessorRequest import TextProcessorRequest


class TextProcessorResult(BaseModel):
    # セッションのID。接続している間は同じ値となる。
    session_id: str
    # 発話ごとに割り振られるID。
    # 最初の音声検知時に割り当てられ、
    # 発話が完了する(confirmedがTrueとなる)まで維持される。
    speech_id: int = 0
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

    def append_response_message(self, text: str):
        self.response_message.message += text
        self.voice_text = text

    def finalize(self):
        self.voice_text = None
        self.end_of_response = True
        self.history.messages.append(self.response_message)

    @classmethod
    def from_request(
        self,
        request: TextProcessorRequest,
        message_type: str,
        speaker_id: str,
        speaker_name: str,
    ) -> "TextProcessorResult":
        return TextProcessorResult(
            session_id=request.session_id,
            speech_id=request.speech_id,
            sequence_id=request.sequence_id,
            confirmed=request.confirmed,
            history=request.history,
            request_message=request.request_message,
            response_message=ChatMessage(
                message_type=message_type,
                speaker_id=speaker_id,
                speaker_name=speaker_name,
            ),
            end_of_response=False,
            voice_text=None,
        )

    @classmethod
    def from_msgpack(self, pack: bytes) -> "TextProcessorResult":
        contents = msgpack.unpackb(pack)
        return TextProcessorResult(**contents)

    def __msgpack_pack(self, obj):
        if isinstance(obj, ChatHistory):
            return obj.model_dump()
        if isinstance(obj, ChatMessage):
            return obj.model_dump()
        return obj

    def to_msgpack(self) -> bytes:
        return msgpack.packb(
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
            default=self.__msgpack_pack,
        )

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
