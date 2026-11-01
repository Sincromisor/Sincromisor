"""合成条件と完全音声用の既存キャッシュキーを定義する。"""

import hashlib

from pydantic import BaseModel, field_validator


class VoiceSynthesizerRequest(BaseModel):
    """前後無音は要求単位の秒数。逐次経路のキー分離はvoice_streamが担当する。"""

    # 発話ごとに割り振られるID。TextProcessorから引き継ぐ。
    # 音声を検知する度に割り当てられる。
    speech_id: int
    message: str
    style_id: int
    audio_format: str | None = "audio/wav"
    pre_phoneme_length: float = 0.1
    post_phoneme_length: float = 0.1

    @field_validator("audio_format")
    def validate_format(cls, audio_format: str) -> str:
        """既存の対応形式以外はWAVへ正規化する。"""
        if audio_format == "audio/aac":
            return "audio/aac"
        if audio_format == "audio/ogg":
            return "audio/ogg"
        if audio_format == "audio/ogg;codecs=opus":
            return "audio/ogg;codecs=opus"
        return "audio/wav"

    def redis_key(self) -> str:
        """完全音声経路の既存キーを維持する。無音条件の区別は逐次用派生型で行う。"""
        msg_hash = hashlib.sha256(self.message.encode("UTF-8")).hexdigest()
        return f"{self.audio_format}/{self.style_id}/{msg_hash}"

    def s3_key(self) -> str:
        """MessagePackの完成結果を本文ハッシュによる階層へ保存する既存キーを返す。"""
        msg_hash = hashlib.sha256(self.message.encode("UTF-8")).hexdigest()
        return f"{self.audio_format}/{self.style_id}/{self.__msg_dir()}/{msg_hash}.mpk"

    def __msg_dir(self) -> str:
        """既存のS3配置と同じくハッシュの先頭9桁を3階層へ分ける。"""
        msg_hash = hashlib.sha256(self.message.encode("UTF-8")).hexdigest()
        return f"{msg_hash[:3]}/{msg_hash[3:6]}/{msg_hash[6:9]}"
