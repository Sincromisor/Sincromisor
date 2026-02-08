from enum import Enum

from pydantic import BaseModel


class TalkMode(str, Enum):
    # chat: 対話
    # sincro: 音声認識 + 読み上げ

    chat = "chat"
    sincro = "sincro"

class RTCSessionOffer(BaseModel):
    sdp: str
    type: str
    talk_mode: TalkMode
