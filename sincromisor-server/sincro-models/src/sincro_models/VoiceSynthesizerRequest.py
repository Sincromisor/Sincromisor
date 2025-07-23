import hashlib

from pydantic import BaseModel, field_validator


class VoiceSynthesizerRequest(BaseModel):
    message: str
    style_id: int
    audio_format: str | None = "audio/wav"
    pre_phoneme_length: float = 0.1
    post_phoneme_length: float = 0.1

    @field_validator("audio_format")
    def validate_format(cls, audio_format: str) -> str:
        if audio_format == "audio/aac":
            return "audio/aac"
        if audio_format == "audio/ogg":
            return "audio/ogg"
        if audio_format == "audio/ogg;codecs=opus":
            return "audio/ogg;codecs=opus"
        return "audio/wav"

    def redis_key(self) -> str:
        msg_hash = hashlib.sha256(self.message.encode("UTF-8")).hexdigest()
        return f"{self.audio_format}/{self.style_id}/{msg_hash}"

    def minio_key(self) -> str:
        msg_hash = hashlib.sha256(self.message.encode("UTF-8")).hexdigest()
        return f"{self.audio_format}/{self.style_id}/{self.__msg_dir()}/{msg_hash}"

    def __msg_dir(self) -> str:
        msg_hash = hashlib.sha256(self.message.encode("UTF-8")).hexdigest()
        return f"{msg_hash[:3]}/{msg_hash[3:6]}/{msg_hash[6:9]}"
