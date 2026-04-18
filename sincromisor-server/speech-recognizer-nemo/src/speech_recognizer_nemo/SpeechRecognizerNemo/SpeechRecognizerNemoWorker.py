import json
import logging
import shutil
from datetime import datetime
from logging import Logger
from pathlib import Path
from time import perf_counter
from typing import Any

import numpy as np
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult

from .ProperNounDictionary import ProperNounDictionary
from .RecognizerPostProcessor import RecognizerPostProcessor
from .SpeechRecognizerNemo import SpeechRecognizerNemo
from .SpeechRecognizerS3Client import SpeechRecognizerS3Client


class SpeechRecognizerNemoWorker:
    def __init__(
        self,
        voice_log_dir: str | None,
        proper_noun_enable: bool = False,
        proper_noun_dict_path: str | None = None,
    ):
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.s2t: SpeechRecognizerNemo = SpeechRecognizerNemo()
        self.voice_log_dir: str | None = voice_log_dir
        self.proper_noun_dictionary: ProperNounDictionary = (
            self.__load_proper_noun_dictionary(
                proper_noun_enable=proper_noun_enable,
                proper_noun_dict_path=proper_noun_dict_path,
            )
        )
        self.post_processor = RecognizerPostProcessor(self.proper_noun_dictionary)
        if proper_noun_enable and not self.post_processor.enabled:
            self.logger.warning(
                "Proper noun post processor is disabled because tokenizer is unavailable.",
            )
        self.logger.info("SpeechRecognizerWorker is initialized.")

    def recognize(
        self,
        spe_result: SpeechExtractorResult,
        s3_client: SpeechRecognizerS3Client | None,
    ) -> SpeechRecognizerResult:
        start_t = perf_counter()
        raw_result = self.__transcribe_with_score(spe_result.voice)
        sr_result = SpeechRecognizerResult(
            session_id=spe_result.session_id,
            speech_id=spe_result.speech_id,
            sequence_id=spe_result.sequence_id,
            start_at=spe_result.start_at,
            confirmed=spe_result.confirmed,
            result=raw_result,
        )
        correction_trace = self.__apply_proper_noun_postprocess(
            sr_result=sr_result,
            confirmed=spe_result.confirmed,
        )
        self.logger.info(
            {
                "query_time": perf_counter() - start_t,
                "voice_size": spe_result.voice.size,
                "result": sr_result,
            }
        )
        if spe_result.confirmed and self.voice_log_dir:
            self.__export_result(sr_result, correction_trace=correction_trace)
            self.__export_voice(spe_result)
        if spe_result.confirmed and s3_client is not None:
            s3_client.export_result_to_s3(sr_result)
            s3_client.export_voice_to_s3(spe_result)
        return sr_result

    def __transcribe_with_score(self, voice: np.ndarray) -> list[tuple[str, float]]:
        return self.s2t.transcribe_with_score(voice)

    def __load_proper_noun_dictionary(
        self,
        *,
        proper_noun_enable: bool,
        proper_noun_dict_path: str | None,
    ) -> ProperNounDictionary:
        if not proper_noun_enable:
            self.logger.info("Proper noun dictionary is disabled.")
            return ProperNounDictionary.empty()
        if not proper_noun_dict_path:
            self.logger.warning(
                "Proper noun dictionary is enabled but dict path is not set.",
            )
            return ProperNounDictionary.empty()

        try:
            return ProperNounDictionary.load_from_csv_with_logger(
                csv_path=proper_noun_dict_path,
                logger=self.logger,
            )
        except Exception as exc:
            self.logger.warning(
                "Failed to load proper noun dictionary from %s: %r",
                proper_noun_dict_path,
                exc,
            )
            return ProperNounDictionary.empty()

    def __apply_proper_noun_postprocess(
        self,
        *,
        sr_result: SpeechRecognizerResult,
        confirmed: bool,
    ) -> dict[str, Any] | None:
        if not confirmed or not self.post_processor.enabled:
            return None

        try:
            post_process_result = self.post_processor.apply(sr_result.result)
        except Exception as exc:
            self.logger.warning(
                "Proper noun post process failed: %r",
                exc,
            )
            return None

        correction_trace = {
            "raw_text": post_process_result.raw_text,
            "corrected_text": post_process_result.corrected_text,
            "raw_result": list(post_process_result.raw_result),
            "corrected_result": list(post_process_result.corrected_result),
            "match_count": len(post_process_result.matches),
            "matched_entries": [
                {
                    "surface_before": match.surface_before,
                    "surface_after": match.surface_after,
                    "normalized_yomi": match.normalized_yomi,
                    "start_index": match.start_index,
                    "end_index": match.end_index,
                    "source_line": match.source_line,
                }
                for match in post_process_result.matches
            ],
            "deferred_yomi": list(post_process_result.deferred_yomi),
            "decode_path": "baseline_with_unique_yomi_postprocess",
        }
        self.logger.info({"proper_noun_postprocess": correction_trace})
        if post_process_result.changed:
            sr_result.result = list(post_process_result.corrected_result)
        return correction_trace

    def __export_result(
        self,
        result: SpeechRecognizerResult,
        correction_trace: dict[str, Any] | None = None,
    ) -> Path | None:
        if self.voice_log_dir is None:
            return None
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f"
        )
        write_dir: Path = Path(self.voice_log_dir, result.session_id)
        write_dir.mkdir(parents=True, exist_ok=True)
        write_path: Path = Path(write_dir, f"{result.speech_id:06d}_{time_text}.json")
        with open(write_path, "w", encoding="utf-8") as text:
            result_json = result.to_json(dumps_opt={"indent": 4})
            text.write(result_json)
        self.logger.info(f"Wrote: {write_path}")
        if correction_trace is not None:
            trace_path = write_path.with_suffix(".trace.json")
            with open(trace_path, "w", encoding="utf-8") as text:
                text.write(json.dumps(correction_trace, ensure_ascii=False, indent=4))
            self.logger.info(f"Wrote: {trace_path}")
        return write_path

    def __export_voice(self, result: SpeechExtractorResult) -> Path | None:
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
