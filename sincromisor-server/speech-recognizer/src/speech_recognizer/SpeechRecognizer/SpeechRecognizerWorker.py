import logging
import shutil
from datetime import datetime
from logging import Logger
from pathlib import Path

import numpy as np
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult

from .SpeechRecognizer import SpeechRecognizer


class SpeechRecognizerWorker:
    def __init__(self, voice_log_dir: str | None):
        self.logger: Logger = logging.getLogger(__name__)
        self.s2t: SpeechRecognizer = SpeechRecognizer(
            decode_options={"max_new_tokens": 255},
        )
        self.voice_log_dir: str | None = voice_log_dir
        self.logger.info("SpeechRecognizerWorker is initialized.")

    def transcribe(self, voice: np.ndarray) -> list:
        inputs, outputs = self.s2t.transcribe(
            voice,
            decode_options={
                "output_scores": True,
                "return_dict_in_generate": True,
                "max_new_tokens": 500,
            },
        )
        return self.s2t.transcribe_with_score(inputs, outputs)

    def recognize(self, spe_result: SpeechExtractorResult) -> SpeechRecognizerResult:
        result = self.transcribe(spe_result.voice)
        sr_result = SpeechRecognizerResult(
            session_id=spe_result.session_id,
            speech_id=spe_result.speech_id,
            sequence_id=spe_result.sequence_id,
            start_at=spe_result.start_at,
            confirmed=spe_result.confirmed,
            result=result,
        )
        self.logger.info(sr_result)
        if spe_result.confirmed and self.voice_log_dir:
            self.export_result(sr_result)
            self.export_voice(spe_result)
        return sr_result

    def export_result(self, result: SpeechRecognizerResult) -> Path | None:
        if self.voice_log_dir is None:
            return None
        time_text = datetime.fromtimestamp(result.start_at).strftime("%Y%m%d_%H%M%S.%f")
        write_dir: Path = Path(self.voice_log_dir, result.session_id)
        write_dir.mkdir(parents=True, exist_ok=True)
        write_path: Path = Path(write_dir, f"{result.speech_id:06d}_{time_text}.json")
        with open(write_path, "w", encoding="utf-8") as text:
            json = result.to_json(dumps_opt={"indent": 4})
            text.write(json)
        self.logger.info(f"Wrote: {write_path}")
        return write_path

    def export_voice(self, result: SpeechExtractorResult) -> Path | None:
        if self.voice_log_dir is None:
            return None
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f",
        )
        write_dir: Path = Path(self.voice_log_dir, result.session_id)
        write_dir.mkdir(parents=True, exist_ok=True)
        write_path: Path
        if shutil.which("opusenc"):
            write_path = Path(
                write_dir,
                f"{result.speech_id:06d}_{time_text}.opus",
            )
            result.to_opusfile(path=str(write_path))
        else:
            write_path = Path(
                write_dir,
                f"{result.speech_id:06d}_{time_text}.wav",
            )
            result.to_wavfile(path=str(write_path))
        self.logger.info(f"Wrote: {write_path}")
        return write_path
