import io
import logging
import shutil
from datetime import datetime
from logging import Logger

import boto3
from botocore.client import BaseClient
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult


class SpeechRecognizerS3Client:
    def __init__(
        self, s3_host: str, s3_port: int, access_key: str, secret_key: str
    ) -> None:
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
        self.__setup_s3_bucket()

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

    def __put_s3(self, object_name: str, data: bytes, content_type: str) -> None:
        self.s3_client.put_object(
            Bucket=self.bucket_name,
            Key=object_name,
            Body=io.BytesIO(data),
            ContentType=content_type,
        )

    def export_result_to_s3(self, result: SpeechRecognizerResult) -> None:
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f",
        )
        object_name: str = (
            f"{result.session_id}/{result.speech_id:06d}_{time_text}.json"
        )
        json: str = result.to_json(dumps_opt={"indent": 4})
        try:
            self.__put_s3(object_name, json.encode("utf-8"), "application/json")
            self.logger.info(f"Wrote to S3: {object_name}")
        except (ClientError, BotoCoreError) as exc:
            self.logger.error(f"Failed to write JSON to S3: {object_name} ({exc})")

    def export_voice_to_s3(self, result: SpeechExtractorResult) -> None:
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f",
        )
        object_name: str
        if shutil.which("opusenc"):
            object_name = f"{result.session_id}/{result.speech_id:06d}_{time_text}.opus"
            opus: bytes = result.to_opus()
            try:
                self.__put_s3(object_name, opus, "audio/opus")
                self.logger.info(f"Wrote to S3: {object_name}")
            except (ClientError, BotoCoreError) as exc:
                self.logger.error(f"Failed to write opus to S3: {object_name} ({exc})")
