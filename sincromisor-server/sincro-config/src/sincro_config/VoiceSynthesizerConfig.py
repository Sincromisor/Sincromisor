from pydantic import BaseModel


class VoiceSynthesizerConfig(BaseModel):
    EnableRedis: bool
    DefaultStyleID: int
    PrePhonemeLength: float
    PostPhonemeLength: float
