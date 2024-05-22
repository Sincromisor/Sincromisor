import numpy as np
from pathlib import Path
from datetime import datetime
import logging
from logging import Logger
import shutil
from ..models import SpeechExtractorResult
from ..models import SpeechRecognizerResult
from . import SpeechRecognizer


class SpeechRecognizerWorker:
    def __init__(self):
        self.logger: Logger = logging.getLogger(__name__)
        self.s2t: SpeechRecognizer = SpeechRecognizer(
            decode_options={"max_new_tokens": 255}
        )

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
        if spe_result.confirmed:
            self.export_result(sr_result)
            self.export_voice(spe_result)
        return sr_result

    def export_result(self, result: SpeechRecognizerResult) -> str:
        time_text = datetime.fromtimestamp(result.start_at).strftime("%Y%m%d_%H%M%S.%f")
        write_dir = f"log/voice/{result.session_id}"
        write_path = f"{write_dir}/{result.speech_id:06d}_{time_text}.json"
        Path(write_dir).mkdir(parents=True, exist_ok=True)
        with open(write_path, "w", encoding="utf-8") as text:
            json = result.to_json(dumps_opt={"indent": 4})
            text.write(json)
        self.logger.info(f"Wrote: {write_path}")
        return write_path

    def export_voice(self, result: SpeechExtractorResult) -> str:
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f"
        )
        write_dir: str = f"log/voice/{result.session_id}"
        Path(write_dir).mkdir(parents=True, exist_ok=True)
        if not shutil.which("opusenc"):
            write_path: str = f"{write_dir}/{result.speech_id:06d}_{time_text}.opus"
            result.to_opusfile(path=write_path)
        else:
            write_path: str = f"{write_dir}/{result.speech_id:06d}_{time_text}.wav"
            result.to_wavfile(path=write_path)
        self.logger.info(f"Wrote: {write_path}")
        return write_path
