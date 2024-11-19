import logging
from logging import Logger

from redis import Redis
from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult

from .VoiceSynthesizer import VoiceSynthesizer


class VoiceCacheManager:
    class VoiceSynthesizerServerException(Exception):
        pass

    def __init__(
        self,
        voicevox_host: str = "localhost",
        voicevox_port: int = 50021,
        redis_host: str = "localhost",
        redis_port: int = 6379,
    ):
        self.redis: Redis = Redis(
            host=redis_host, port=redis_port
        )  # , decode_responses=True
        self.vsynth: VoiceSynthesizer = VoiceSynthesizer(
            host=voicevox_host, port=voicevox_port
        )
        self.logger: Logger = logging.getLogger(__name__)

    def get_speaker_ids(self) -> dict:
        try:
            speakers: list = self.vsynth.speakers()
        except Exception:
            raise self.VoiceSynthesizerServerException

        ids: dict = {}
        for sp in speakers:
            spname = sp["name"]
            spuuid = sp["speaker_uuid"]
            for style in sp["styles"]:
                stname = style["name"]
                stid = style["id"]
                ids[stid] = {"name": spname, "style": stname, "speakers_uuid": spuuid}
        return ids

    def get_speaker_info(self, speaker_id: int) -> dict:
        try:
            speaker_ids: dict = self.get_speaker_ids()
        except Exception:
            raise self.VoiceSynthesizerServerException
        return speaker_ids[speaker_id]

    def get_voice(self, vs_request: VoiceSynthesizerRequest) -> VoiceSynthesizerResult:
        self.logger.info(f"SynthRequest: {vs_request.message}")
        key: str = vs_request.redis_key()
        if vs_pack := self.redis.get(key):
            self.logger.info(f"SynthRequest(CacheHIT): {vs_request.message}")
            return VoiceSynthesizerResult.from_msgpack(vs_pack)
        try:
            vs_result: VoiceSynthesizerResult = self.vsynth.generate(
                vs_request=vs_request
            )
        except Exception:
            raise self.VoiceSynthesizerServerException
        self.redis.set(key, vs_result.to_msgpack())
        return vs_result

    def get_voice_nocache(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult:
        self.logger.info(f"SynthRequest(NOCACHE): {vs_request.message}")
        try:
            return self.vsynth.generate(vs_request=vs_request)
        except Exception:
            raise self.VoiceSynthesizerServerException
