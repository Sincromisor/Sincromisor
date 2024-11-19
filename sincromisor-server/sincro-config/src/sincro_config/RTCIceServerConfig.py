from pydantic import BaseModel


class RTCIceServerConfig(BaseModel):
    Urls: str
    UserName: str | None = None
    Credential: str | None = None

    def to_lowerkeys(self) -> dict:
        return {
            "urls": self.Urls,
            "UserName": self.UserName,
            "Credential": self.Credential,
        }
