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
from sincro_config.runtime_diagnostics import failure_fields
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
        ids: dict[str, object] = {
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
            result = self.__get_voice_redis(vs_request, ids)
            if result is None:
                source = "s3"
                result = self.__get_voice_s3(vs_request, ids)
                if result is not None:
                    self.__put_voice_redis(vs_request, result, ids)
            if result is None:
                source = "generated"
                try:
                    result = self.vsynth.generate(vs_request=vs_request)
                except Exception as error:
                    raise self.VoiceSynthesizerServerException from error
                self.__put_voice_redis(vs_request, result, ids)
                self.__put_voice_s3(vs_request, result, ids)
        except Exception as error:
            cause = error.__cause__ or error
            failure = {
                "event": "synthesis_processing",
                **ids,
                "outcome": "failed",
                "error_type": type(cause).__name__,
                "stage": "synthesis",
                "peer": "voicevox" if source == "generated" else source,
                **failure_fields(cause),
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

    def __cache_event(
        self,
        peer: str,
        stage: str,
        ids: dict[str, object],
        error: Exception | None = None,
        outcome: str = "success",
    ) -> None:
        """キーや保存内容を使わず、操作・相手・会話と原因を対応付ける。"""
        fields = failure_fields(error) if error else {}
        if stage == "read" and fields.get("reason") == "not_found":
            outcome = "miss"
        elif error:
            outcome = "failed"
        self.logger.log(
            logging.WARNING if outcome == "failed" else logging.INFO,
            {
                "event": "voice_cache_operation",
                "peer": peer,
                "stage": stage,
                **ids,
                **fields,
                "outcome": outcome,
            },
        )

    def __get_voice_redis(
        self, vs_request: VoiceSynthesizerRequest, ids: dict[str, object]
    ) -> VoiceSynthesizerResult | None:
        """Redis未命中と読取・復号失敗を区別する。従来どおり例外は呼出元へ返す。"""
        stage = "read"
        try:
            vs_pack = self.redis.get(vs_request.redis_key())
            if isinstance(vs_pack, bytes) and vs_pack:
                stage = "decode"
                result = VoiceSynthesizerResult.from_msgpack(vs_pack)
                self.__cache_event("redis", stage, ids)
                return result
        except Exception as error:
            self.__cache_event("redis", stage, ids, error)
            raise
        self.__cache_event("redis", stage, ids, outcome="miss")
        return None

    def __get_voice_s3(
        self, vs_request: VoiceSynthesizerRequest, ids: dict[str, object]
    ) -> VoiceSynthesizerResult | None:
        """不存在とアクセス失敗を区別して生成へ進む。破損データは従来どおり伝播する。"""
        stage = "read"
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name, Key=vs_request.s3_key()
            )
            body: StreamingBody = response["Body"]
            try:
                vpack: bytes = body.read()
            finally:
                body.close()
            stage = "decode"
            result = VoiceSynthesizerResult.from_msgpack(vpack)
            self.__cache_event("s3", stage, ids)
            return result
        except (ClientError, BotoCoreError) as error:
            self.__cache_event("s3", stage, ids, error)
            return None
        except Exception as error:
            self.__cache_event("s3", stage, ids, error)
            raise

    def __put_voice_redis(
        self,
        vs_request: VoiceSynthesizerRequest,
        vs_result: VoiceSynthesizerResult,
        ids: dict[str, object],
    ) -> None:
        """保存不能でも生成結果を返す既存動作を維持し、操作とIDを残す。"""
        try:
            self.redis.set(
                vs_request.redis_key(), vs_result.to_msgpack(), ex=60 * 60 * 24 * 7
            )
            self.__cache_event("redis", "write", ids)
        except RedisError as error:
            self.__cache_event("redis", "write", ids, error)

    def __put_voice_s3(
        self,
        vs_request: VoiceSynthesizerRequest,
        vs_result: VoiceSynthesizerResult,
        ids: dict[str, object],
    ) -> None:
        """S3保存不能でも生成結果を返す。キー・本文・認証は診断へ出さない。"""
        try:
            payload = vs_result.to_msgpack()
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=vs_request.s3_key(),
                Body=io.BytesIO(payload),
                ContentType="application/octet-stream",
            )
            self.__cache_event("s3", "write", ids)
        except (ClientError, BotoCoreError) as error:
            self.__cache_event("s3", "write", ids, error)
