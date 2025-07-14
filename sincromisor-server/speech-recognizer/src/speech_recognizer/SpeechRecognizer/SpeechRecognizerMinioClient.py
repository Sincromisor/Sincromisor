import io
import logging
import shutil
from datetime import datetime
from logging import Logger

from minio import Minio
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult


class SpeechRecognizerMinioClient:
    def __init__(
        self, minio_host: str, minio_port: int, access_key: str, secret_key: str
    ) -> None:
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.minio_client: Minio = Minio(
            endpoint=f"{minio_host}:{minio_port}",
            access_key=access_key,
            secret_key=secret_key,
            secure=False,
        )
        self.bucket_name: str = "speech-recognizer"
        self.__setup_minio_bucket()

    def __setup_minio_bucket(self) -> None:
        if not self.minio_client.bucket_exists(self.bucket_name):
            self.minio_client.make_bucket(self.bucket_name)
            self.logger.info(f"Created MinIO bucket: {self.bucket_name}")

    def __put_minio(self, minio_client: Minio, object_name: str, data: bytes) -> None:
        minio_client.put_object(
            bucket_name="speech-recognizer",
            object_name=object_name,
            data=io.BytesIO(data),
            length=len(data),
        )

    def export_result_to_minio(self, result: SpeechRecognizerResult) -> None:
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f",
        )
        object_name: str = (
            f"{result.session_id}/{result.speech_id:06d}_{time_text}.json"
        )
        json: str = result.to_json(dumps_opt={"indent": 4})
        self.__put_minio(self.minio_client, object_name, json.encode("utf-8"))
        self.logger.info(f"Wrote to MinIO: {object_name}")

    def export_voice_to_minio(self, result: SpeechExtractorResult) -> None:
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f",
        )
        object_name: str
        if shutil.which("opusenc"):
            object_name = f"{result.session_id}/{result.speech_id:06d}_{time_text}.opus"
            opus: bytes = result.to_opus()
            self.__put_minio(self.minio_client, object_name, opus)
            self.logger.info(f"Wrote to MinIO: {object_name}")
