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
            try:
                self.s3_client = self.create_s3()
            # reason: S3の準備失敗で独立したローカル保存を妨げない。
            except Exception as error:  # noqa: BLE001
                self.__failed(result, "s3", "prepare", error)
        if self.voice_log_dir is None and self.s3_client is None:
            return
        opus: bytes | None = None
        encode_reason = "encoder_unavailable"
        if shutil.which("opusenc"):
            # 生成物を共有し、ローカルとS3で同じ音声を二度圧縮しない。
            try:
                opus = request.to_opus()
            # reason: 音声圧縮失敗でもJSONとWAVは保存可能なため継続する。
            except Exception as error:  # noqa: BLE001
                encode_reason = "encoder_failed"
                self.__failed(result, "encoder", "encode", error)
        if self.voice_log_dir is not None:
            try:
                self.__write_local(request, result, trace, opus)
            # reason: 保存内容・パスの検証失敗も他の保存先へ波及させない。
            except Exception as error:  # noqa: BLE001
                # 記録失敗は認識成功から分離する。後続のS3保存は続行する。
                self.__failed(result, "local", "write", error)
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
                        "reason": encode_reason,
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
        # 会話IDはファイル名の一要素であり、絶対パスや相対パスとして解釈しない。
        if (
            not result.session_id
            or result.session_id in {".", ".."}
            or any(char in result.session_id for char in ("/", "\\", "\x00"))
        ):
            raise ValueError("Session ID must be a single directory name.")
        root = Path(self.voice_log_dir).resolve()
        directory = root / result.session_id
        path = directory / f"{result.speech_id:06d}_{time_text}.json"
        # 既存リンクの追跡で別の保存先へ書き込まない。全対象を最初の書込み前に検査する。
        targets = [
            directory,
            path,
            *(path.with_suffix(s) for s in (".trace.json", ".opus", ".wav")),
        ]
        if any(
            target.is_symlink() or not target.resolve().is_relative_to(root)
            for target in targets
        ):
            raise ValueError("Recognition storage path must remain within its root.")
        directory.mkdir(parents=True, exist_ok=True)
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

    def __failed(
        self,
        result: SpeechRecognizerResult,
        peer: str,
        stage: str,
        error: Exception,
    ) -> None:
        """保存先と失敗段階を残し、例外の自由文やパスを運用ログへ含めない。"""
        self.logger.warning(
            {
                "event": "recognition_storage",
                "peer": peer,
                "stage": stage,
                "session_id": result.session_id,
                "speech_id": result.speech_id,
                "sequence_id": result.sequence_id,
                "outcome": "failed",
                **failure_fields(error),
            }
        )

    def close(self) -> None:
        """すべての保存終了後、同じ保存スレッドでクライアントを閉じる。"""
        if self.s3_client is not None:
            self.s3_client.close()
            self.s3_client = None
