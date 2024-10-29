import logging
from logging import Logger
from redis import Redis
from sincro_models import VoiceSynthesizerRequest
from sincro_models import VoiceSynthesizerResult
from .VoiceSynthesizer import VoiceSynthesizer


class VoiceCacheManager:
    class VoiceSynthesizerServerException(Exception):
        pass

    def __init__(
        self,
        vvox_host: str = "localhost",
        vvox_port: int = 50021,
        redis_host: str = "localhost",
        redis_port: int = 6379,
    ):
        self.redis: Redis = Redis(
            host=redis_host, port=redis_port
        )  # , decode_responses=True
        self.vsynth: VoiceSynthesizer = VoiceSynthesizer(host=vvox_host, port=vvox_port)
        self.logger: Logger = logging.getLogger(__name__)

    def get_speaker_ids(self) -> dict:
        try:
            speakers = self.vsynth.speakers()
        except:
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
            speaker_ids = self.get_speaker_ids()
        except:
            raise self.VoiceSynthesizerServerException
        return speaker_ids[speaker_id]

    def get_voice(self, vs_request: VoiceSynthesizerRequest) -> VoiceSynthesizerResult:
        self.logger.info(f"SynthRequest: {vs_request.message}")
        key = vs_request.redis_key()
        if vs_pack := self.redis.get(key):
            self.logger.info(f"SynthRequest(CacheHIT): {vs_request.message}")
            return VoiceSynthesizerResult.from_msgpack(vs_pack)
        try:
            vs_result = self.vsynth.generate(vs_request=vs_request)
        except:
            raise self.VoiceSynthesizerServerException
        self.redis.set(key, vs_result.to_msgpack())
        return vs_result

    def get_voice_nocache(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult:
        self.logger.info(f"SynthRequest(NOCACHE): {vs_request.message}")
        try:
            return self.vsynth.generate(vs_request=vs_request)
        except:
            raise self.VoiceSynthesizerServerException
