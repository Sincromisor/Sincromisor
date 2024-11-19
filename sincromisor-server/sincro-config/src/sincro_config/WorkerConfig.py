from pydantic import BaseModel, Field


class WorkerConfig(BaseModel):
    Host: str
    Port: int
    Url: str
    ForwardedAllowIps: str | None = Field(None, alias="forwarded-allow-ips")
    Launch: bool | None = False
