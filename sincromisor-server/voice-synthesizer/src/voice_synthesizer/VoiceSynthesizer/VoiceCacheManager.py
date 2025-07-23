import io
import logging
from logging import Logger

from minio import Minio
from minio.error import S3Error
from redis import Redis
from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult
from urllib3.response import BaseHTTPResponse

from .VoiceSynthesizer import VoiceSynthesizer


class VoiceCacheManager:
    class VoiceSynthesizerServerException(Exception):
        pass

    def __init__(
        self,
        voicevox_host: str,
        voicevox_port: int,
        redis_host: str,
        redis_port: int,
        minio_host: str,
        minio_port: int,
        minio_access_key: str,
        minio_secret_key: str,
    ):
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.redis: Redis = Redis(
            host=redis_host,
            port=redis_port,
        )  # , decode_responses=True

        self.minio_client: Minio = Minio(
            endpoint=f"{minio_host}:{minio_port}",
            access_key=minio_access_key,
            secret_key=minio_secret_key,
            secure=False,
        )
        self.bucket_name: str = "voice-synthesizer"
        self.__setup_minio_bucket()

        self.vsynth: VoiceSynthesizer = VoiceSynthesizer(
            host=voicevox_host,
            port=voicevox_port,
        )

    def __setup_minio_bucket(self) -> None:
        if not self.minio_client.bucket_exists(self.bucket_name):
            self.minio_client.make_bucket(self.bucket_name)
            self.logger.info(f"Created MinIO bucket: {self.bucket_name}")

    def get_voice(self, vs_request: VoiceSynthesizerRequest) -> VoiceSynthesizerResult:
        self.logger.info(f"SynthRequest: {vs_request.message}")
        vs_result: VoiceSynthesizerResult | None
        vs_result = self.__get_voice_redis(vs_request)
        if vs_result:
            self.logger.info(f"SynthRequest(Redis-HIT): {vs_request.message}")
            return vs_result
        vs_result = self.__get_voice_minio(vs_request)
        if vs_result:
            self.logger.info(f"SynthRequest(MinIO-HIT): {vs_request.message}")
            self.__put_voice_redis(vs_request, vs_result)
            return vs_result
        try:
            vs_result = self.vsynth.generate(
                vs_request=vs_request,
            )
            self.logger.info(f"SynthRequest(Cache-Miss): {vs_request.message}")
        except Exception:
            raise self.VoiceSynthesizerServerException
        self.__put_voice_redis(vs_request, vs_result)
        self.__put_voice_minio(vs_request, vs_result)
        return vs_result

    def __get_voice_redis(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult | None:
        key: str = vs_request.redis_key()
        if vs_pack := self.redis.get(key):
            if isinstance(vs_pack, bytes):
                return VoiceSynthesizerResult.from_msgpack(vs_pack)
        return None

    def __get_voice_minio(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult | None:
        try:
            minio_res: BaseHTTPResponse = self.minio_client.get_object(
                bucket_name=self.bucket_name, object_name=vs_request.minio_key()
            )
            vpack: bytes = minio_res.read()
            minio_res.close()
            minio_res.release_conn()
            return VoiceSynthesizerResult.from_msgpack(vpack)
        except S3Error:
            return None

    def __put_voice_redis(
        self, vs_request: VoiceSynthesizerRequest, vs_result: VoiceSynthesizerResult
    ) -> None:
        try:
            self.redis.set(
                vs_request.redis_key(), vs_result.to_msgpack(), ex=60 * 60 * 24 * 7
            )
        except S3Error as e:
            self.logger.error(f"Failed to upload voice to Redis: {e}")

    def __put_voice_minio(
        self, vs_request: VoiceSynthesizerRequest, vs_result: VoiceSynthesizerResult
    ) -> None:
        try:
            self.minio_client.put_object(
                bucket_name=self.bucket_name,
                object_name=vs_request.minio_key(),
                data=io.BytesIO(vs_result.to_msgpack()),
                length=len(vs_result.to_msgpack()),
                content_type="application/octet-stream",
            )
        except S3Error as e:
            self.logger.error(f"Failed to upload voice to MinIO: {e}")
