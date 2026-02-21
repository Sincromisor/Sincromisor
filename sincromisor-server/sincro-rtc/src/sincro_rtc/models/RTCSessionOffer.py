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
    # 既存セッション更新を試みる場合のみ指定する（未指定時は新規セッション）。
    session_id: str | None = None
