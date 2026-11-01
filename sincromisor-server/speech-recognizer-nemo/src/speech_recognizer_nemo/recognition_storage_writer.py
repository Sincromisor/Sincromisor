"""専用保存スレッドでローカル記録とS3接続を所有する。"""

import json
import logging
import shutil
from collections.abc import Callable
from datetime import datetime
from pathlib import Path

from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult

from .SpeechRecognizerNemo.SpeechRecognizerS3Client import SpeechRecognizerS3Client


class RecognitionStorageWriter:
    """接続から独立した保存先を保持し、同じ音声の圧縮結果を両保存先で使う。"""

    def __init__(
        self,
        voice_log_dir: str | None,
        create_s3: Callable[[], SpeechRecognizerS3Client | None],
    ) -> None:
        self.voice_log_dir = voice_log_dir
        self.create_s3 = create_s3
        self.s3_client: SpeechRecognizerS3Client | None = None
        self.logger = logging.getLogger("sincro.RecognitionStorageWriter")

    def write(
        self,
        request: SpeechExtractorResult,
        result: SpeechRecognizerResult,
        trace: dict[str, object] | None,
    ) -> None:
        """確定結果を保存し、一方の失敗でも他方の保存を試みる。本文は診断へ含めない。"""
        if self.s3_client is None:
            self.s3_client = self.create_s3()
        if self.voice_log_dir is None and self.s3_client is None:
            return
        opus: bytes | None = None
        if shutil.which("opusenc"):
            # 生成物を共有し、ローカルとS3で同じ音声を二度圧縮しない。
            opus = request.to_opus()
        if self.voice_log_dir is not None:
            try:
                self.__write_local(request, result, trace, opus)
            except OSError as error:
                # 記録失敗は認識成功から分離する。後続のS3保存は続行する。
                self.logger.warning(
                    {
                        "event": "recognition_storage",
                        "peer": "local",
                        "stage": "write",
                        "session_id": result.session_id,
                        "speech_id": result.speech_id,
                        "sequence_id": result.sequence_id,
                        "outcome": "failed",
                        **failure_fields(error),
                    }
                )
        if self.s3_client is not None:
            self.s3_client.export_result_to_s3(result)
            if opus is not None:
                self.s3_client.export_voice_to_s3(request, opus)
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

    def __write_local(
        self,
        request: SpeechExtractorResult,
        result: SpeechRecognizerResult,
        trace: dict[str, object] | None,
        opus: bytes | None,
    ) -> None:
        """既存のJSON・補正追跡・Opus優先の音声形式とファイル名を維持する。"""
        assert self.voice_log_dir is not None
        time_text = datetime.fromtimestamp(result.start_at).strftime("%Y%m%d_%H%M%S.%f")
        directory = Path(self.voice_log_dir, result.session_id)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{result.speech_id:06d}_{time_text}.json"
        path.write_text(result.to_json(dumps_opt={"indent": 4}), encoding="utf-8")
        if trace is not None:
            path.with_suffix(".trace.json").write_text(
                json.dumps(trace, ensure_ascii=False, indent=4), encoding="utf-8"
            )
        if opus is not None:
            path.with_suffix(".opus").write_bytes(opus)
        else:
            request.to_wavfile(str(path.with_suffix(".wav")))
        self.logger.info(
            {
                "event": "recognition_storage",
                "peer": "local",
                "stage": "write",
                "session_id": result.session_id,
                "speech_id": result.speech_id,
                "sequence_id": result.sequence_id,
                "outcome": "success",
            }
        )

    def close(self) -> None:
        """すべての保存終了後、同じ保存スレッドでクライアントを閉じる。"""
        if self.s3_client is not None:
            self.s3_client.close()
            self.s3_client = None
