import io
import logging
from logging import Logger

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from botocore.response import StreamingBody
from redis import Redis
from redis.exceptions import RedisError
from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult

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
        s3_host: str,
        s3_port: int,
        s3_access_key: str,
        s3_secret_key: str,
    ):
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.redis: Redis = Redis(
            host=redis_host,
            port=redis_port,
        )  # , decode_responses=True
        self.s3_client: BaseClient = boto3.client(
            "s3",
            endpoint_url=f"http://{s3_host}:{s3_port}",
            aws_access_key_id=s3_access_key,
            aws_secret_access_key=s3_secret_key,
            region_name="us-east-1",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self.bucket_name: str = "voice-synthesizer"
        self.__setup_s3_bucket()

        self.vsynth: VoiceSynthesizer = VoiceSynthesizer(
            host=voicevox_host,
            port=voicevox_port,
        )

    def __setup_s3_bucket(self) -> None:
        try:
            self.s3_client.head_bucket(Bucket=self.bucket_name)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code")
            if error_code not in ("404", "NoSuchBucket", "NotFound"):
                raise
            self.s3_client.create_bucket(Bucket=self.bucket_name)
            self.logger.info(f"Created S3 bucket: {self.bucket_name}")
        except BotoCoreError:
            raise

    def get_voice(self, vs_request: VoiceSynthesizerRequest) -> VoiceSynthesizerResult:
        self.logger.info(f"SynthRequest: {vs_request.message}")
        vs_result: VoiceSynthesizerResult | None
        vs_result = self.__get_voice_redis(vs_request)
        if vs_result:
            self.logger.info(f"SynthRequest(Redis-HIT): {vs_request.message}")
            return vs_result
        vs_result = self.__get_voice_s3(vs_request)
        if vs_result:
            self.logger.info(f"SynthRequest(S3-HIT): {vs_request.message}")
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
        self.__put_voice_s3(vs_request, vs_result)
        return vs_result

    def __get_voice_redis(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult | None:
        key: str = vs_request.redis_key()
        if vs_pack := self.redis.get(key):
            if isinstance(vs_pack, bytes):
                return VoiceSynthesizerResult.from_msgpack(vs_pack)
        return None

    def __get_voice_s3(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult | None:
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name, Key=vs_request.s3_key()
            )
            body: StreamingBody = response["Body"]
            vpack: bytes = body.read()
            body.close()
            return VoiceSynthesizerResult.from_msgpack(vpack)
        except (ClientError, BotoCoreError):
            return None

    def __put_voice_redis(
        self, vs_request: VoiceSynthesizerRequest, vs_result: VoiceSynthesizerResult
    ) -> None:
        try:
            self.redis.set(
                vs_request.redis_key(), vs_result.to_msgpack(), ex=60 * 60 * 24 * 7
            )
        except RedisError as e:
            self.logger.error(f"Failed to upload voice to Redis: {e}")

    def __put_voice_s3(
        self, vs_request: VoiceSynthesizerRequest, vs_result: VoiceSynthesizerResult
    ) -> None:
        try:
            payload = vs_result.to_msgpack()
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=vs_request.s3_key(),
                Body=io.BytesIO(payload),
                ContentType="application/octet-stream",
            )
        except (ClientError, BotoCoreError) as e:
            self.logger.error(f"Failed to upload voice to S3: {e}")
