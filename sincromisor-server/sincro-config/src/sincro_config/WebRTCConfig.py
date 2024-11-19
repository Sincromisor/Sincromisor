from pydantic import BaseModel

from .RTCIceServerConfig import RTCIceServerConfig


class WebRTCConfig(BaseModel):
    MaxSessions: int
    RTCIceServers: list[RTCIceServerConfig]
