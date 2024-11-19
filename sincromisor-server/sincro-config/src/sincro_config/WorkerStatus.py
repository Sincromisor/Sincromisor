from pydantic import BaseModel


class WorkerStatus(BaseModel):
    host: str
    port: int
    last: float
    count: int
