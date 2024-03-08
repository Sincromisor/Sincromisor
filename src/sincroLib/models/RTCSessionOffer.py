from pydantic import BaseModel


class RTCSessionOffer(BaseModel):
    sdp: str
    type: str
