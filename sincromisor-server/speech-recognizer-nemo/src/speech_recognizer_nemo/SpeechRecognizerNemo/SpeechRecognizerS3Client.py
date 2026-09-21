import io
import logging
import shutil
from datetime import datetime
from logging import Logger

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult


class SpeechRecognizerS3Client:
    """認識結果と音声の既存S3保存を所有し、保存内容とは別に操作結果を診断する。"""

    def __init__(
        self, s3_host: str, s3_port: int, access_key: str, secret_key: str
    ) -> None:
        """設定済み資格情報からS3接続を作る。診断には接続情報を渡さない。"""
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.s3_client: BaseClient = boto3.client(
            "s3",
            endpoint_url=f"http://{s3_host}:{s3_port}",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="us-east-1",
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self.bucket_name: str = "speech-recognizer"

    def __put_s3(
        self,
        object_name: str,
        data: bytes,
        content_type: str,
        result: SpeechExtractorResult | SpeechRecognizerResult,
    ) -> None:
        """保存結果を取得可能な会話IDへ結ぶ。既存のS3失敗時の継続動作を維持する。"""
        diagnostic = {
            "event": "recognition_storage",
            "peer": "s3",
            "stage": "write",
            "session_id": result.session_id,
            "speech_id": result.speech_id,
            "sequence_id": result.sequence_id,
        }
        try:
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=object_name,
                Body=io.BytesIO(data),
                ContentType=content_type,
            )
        except (ClientError, BotoCoreError) as error:
            self.logger.warning(
                {**diagnostic, **failure_fields(error), "outcome": "failed"}
            )
        else:
            self.logger.info({**diagnostic, "outcome": "success"})

    def export_result_to_s3(self, result: SpeechRecognizerResult) -> None:
        """認識JSONを従来のキーへ保存し、キーと本文はログへ複製しない。"""
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f",
        )
        object_name: str = (
            f"{result.session_id}/{result.speech_id:06d}_{time_text}.json"
        )
        json: str = result.to_json(dumps_opt={"indent": 4})
        self.__put_s3(object_name, json.encode("utf-8"), "application/json", result)

    def export_voice_to_s3(self, result: SpeechExtractorResult) -> None:
        """Opus変換可能なときだけ音声を保存する。未配置は明示して従来どおりスキップする。"""
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f",
        )
        object_name: str
        if shutil.which("opusenc"):
            object_name = f"{result.session_id}/{result.speech_id:06d}_{time_text}.opus"
            opus: bytes = result.to_opus()
            self.__put_s3(object_name, opus, "audio/opus", result)
        else:
            self.logger.info(
                {
                    "event": "recognition_storage",
                    "peer": "s3",
                    "stage": "encode",
                    "outcome": "skipped",
                    "reason": "encoder_unavailable",
                    "session_id": result.session_id,
                    "speech_id": result.speech_id,
                }
            )
