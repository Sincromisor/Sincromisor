import json

import msgpack
import numpy as np
from pydantic import BaseModel


# TypeError: Object of type float16 is not JSON serializable
class Int16Encoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, np.float16):
            return float(obj)
        return json.JSONEncoder.default(self, obj)


class SpeechRecognizerResult(BaseModel):
    # セッションのID。接続している間は同じ値となる。
    session_id: str
    # 発話ごとに割り振られるID。
    # 最初の音声検知時に割り当てられ、
    # 発話が完了する(confirmedがTrueとなる)まで維持される。
    speech_id: int
    # SpeechExtractorResultを送信するごとに割り振られるID。
    sequence_id: int
    # 発話開始時の時刻(秒)。
    start_at: float
    # 発話が完了しているか否か。途中の場合はFalse。
    confirmed: bool = False
    # [('こんにちは', 0.387), ('。', 0.998), ('</s>', 1.0)]
    result: list

    def word_filter(self, text: str) -> bool:
        if text == "</s>":
            return False
        return True

    def result_text(self) -> str:
        result_text = ""
        for text, score in self.result:
            if self.word_filter(text):
                result_text += text
        return result_text

    def to_json(self, dumps_opt: dict = {}) -> str:
        return json.dumps(
            {
                "session_id": self.session_id,
                "speech_id": self.speech_id,
                "sequence_id": self.sequence_id,
                "start_at": self.start_at,
                "confirmed": self.confirmed,
                "recognizedResult": self.result,
                "resultText": self.result_text(),
            },
            # cls=Int16Encoder,
            ensure_ascii=False,
            **dumps_opt,
        )

    def to_msgpack(self) -> bytes:
        return msgpack.packb(
            {
                "session_id": self.session_id,
                "speech_id": self.speech_id,
                "sequence_id": self.sequence_id,
                "start_at": self.start_at,
                "confirmed": self.confirmed,
                "result": self.result,
            },
        )

    @classmethod
    def from_msgpack(cls, pack: bytes) -> "SpeechRecognizerResult":
        return SpeechRecognizerResult(**msgpack.unpackb(pack))
