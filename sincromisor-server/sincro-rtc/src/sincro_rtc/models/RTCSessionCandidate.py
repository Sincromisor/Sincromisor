from pydantic import BaseModel


class RTCIceCandidatePayload(BaseModel):
    # Web標準のRTCIceCandidateInit相当。
    # ブラウザ->サーバー間で候補をそのまま運ぶためフィールド名を合わせる。
    candidate: str
    sdpMid: str | None = None
    sdpMLineIndex: int | None = None


class RTCSessionCandidate(BaseModel):
    # candidate適用対象を一意に特定するため、offer応答のsession_idを必須とする。
    session_id: str
    # null は end-of-candidates を表す
    candidate: RTCIceCandidatePayload | None = None
