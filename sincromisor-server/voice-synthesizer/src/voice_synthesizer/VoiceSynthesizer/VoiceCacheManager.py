import io
import logging
from logging import Logger
from time import perf_counter

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from botocore.response import StreamingBody
from redis import Redis
from redis.exceptions import RedisError
from sincro_config import SincromisorLoggerConfig
from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult

from .VoiceSynthesizer import VoiceSynthesizer


class VoiceCacheManager:
    """Redis、S3、実生成の順に音声を得て、本文の記録を一つの境界で制御する。"""

    class VoiceSynthesizerServerException(Exception):
        """生成失敗を呼出元へ通知する。原因の値はログへ文字列化しない。"""

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
    ) -> None:
        """接続ごとのキャッシュクライアントと独立した生成ログ設定を準備する。"""
        self.log_synthesis = SincromisorLoggerConfig.synthesis_enabled()
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

        self.vsynth: VoiceSynthesizer = VoiceSynthesizer(
            host=voicevox_host,
            port=voicevox_port,
        )

    def get_voice(
        self,
        vs_request: VoiceSynthesizerRequest,
        *,
        session_id: str | None = None,
        sequence_id: int | None = None,
    ) -> VoiceSynthesizerResult:
        """キャッシュ内容・保存順序を変えず、取得元と実際の生成条件を記録する。

        会話IDは運用ログだけに使い、キャッシュキー・MessagePackへ追加しない。
        """
        ids = {
            "session_id": session_id,
            "speech_id": vs_request.speech_id,
            "sequence_id": sequence_id,
        }
        start = perf_counter()
        if self.log_synthesis:
            self.logger.info(
                {
                    "event": "synthesis_request",
                    **ids,
                    "text": vs_request.message,
                    "parameters": vs_request.model_dump(
                        exclude={"message", "speech_id"}
                    ),
                }
            )
        try:
            source = "redis"
            result = self.__get_voice_redis(vs_request)
            if result is None:
                source = "s3"
                result = self.__get_voice_s3(vs_request)
                if result is not None:
                    self.__put_voice_redis(vs_request, result)
            if result is None:
                source = "generated"
                try:
                    result = self.vsynth.generate(vs_request=vs_request)
                except Exception as error:
                    raise self.VoiceSynthesizerServerException from error
                self.__put_voice_redis(vs_request, result)
                self.__put_voice_s3(vs_request, result)
        except Exception as error:
            cause = error.__cause__ or error
            failure = {
                "event": "synthesis_processing",
                **ids,
                "outcome": "failed",
                "error_type": type(cause).__name__,
            }
            if isinstance(cause, self.vsynth.ProtocolError):
                failure["http_status"] = cause.status_code
            self.logger.exception(failure)
            raise
        if self.log_synthesis:
            self.logger.info(
                {
                    "event": "synthesis_result",
                    **ids,
                    "text": result.message,
                    "style_id": vs_request.style_id,
                    "audio_format": result.audio_format,
                    "parameters": result.query.model_dump(
                        exclude={"accent_phrases", "kana"}
                    ),
                    "cache": source,
                    "outcome": "success",
                    "query_time": perf_counter() - start,
                    "speaking_time": result.speaking_time,
                }
            )
        else:
            self.logger.info(
                {"event": "synthesis_processing", **ids, "outcome": "success"}
            )
        return result

    def __get_voice_redis(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult | None:
        """Redisの既存キーから音声を取得し、未命中だけをNoneにする。"""
        key: str = vs_request.redis_key()
        if vs_pack := self.redis.get(key):
            if isinstance(vs_pack, bytes):
                return VoiceSynthesizerResult.from_msgpack(vs_pack)
        return None

    def __get_voice_s3(
        self, vs_request: VoiceSynthesizerRequest
    ) -> VoiceSynthesizerResult | None:
        """S3の音声キャッシュを読み、取得失敗は未命中として扱う。内容の復号失敗は呼び出し元へ伝える。"""
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name, Key=vs_request.s3_key()
            )
            body: StreamingBody = response["Body"]
            vpack: bytes = body.read()
            body.close()
            return VoiceSynthesizerResult.from_msgpack(vpack)
        except ClientError, BotoCoreError:
            return None

    def __put_voice_redis(
        self, vs_request: VoiceSynthesizerRequest, vs_result: VoiceSynthesizerResult
    ) -> None:
        """Redis保存失敗でも生成結果は返し、例外本文なしの失敗記録を残す。"""
        try:
            self.redis.set(
                vs_request.redis_key(), vs_result.to_msgpack(), ex=60 * 60 * 24 * 7
            )
        except RedisError:
            self.logger.exception(
                "Failed to upload voice to Redis.",
                extra={
                    "event": "voice_cache_write_failed",
                    "speech_id": vs_request.speech_id,
                },
            )

    def __put_voice_s3(
        self, vs_request: VoiceSynthesizerRequest, vs_result: VoiceSynthesizerResult
    ) -> None:
        """S3保存失敗でも生成結果は返し、要求や認証を運用ログへ含めない。"""
        try:
            payload = vs_result.to_msgpack()
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=vs_request.s3_key(),
                Body=io.BytesIO(payload),
                ContentType="application/octet-stream",
            )
        except ClientError, BotoCoreError:
            self.logger.exception(
                "Failed to upload voice to S3.",
                extra={
                    "event": "voice_cache_write_failed",
                    "speech_id": vs_request.speech_id,
                },
            )
