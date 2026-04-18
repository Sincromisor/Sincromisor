import json
import logging
import shutil
from dataclasses import dataclass
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


@dataclass(frozen=True)
class ProperNounContextBiasingConfig:
    enabled: bool
    beam_size: int
    strategy: str = "malsd_batch"
    boosting_tree_alpha: float = 1.0


class SpeechRecognizerNemoWorker:
    def __init__(
        self,
        voice_log_dir: str | None,
        proper_noun_enable: bool = False,
        proper_noun_dict_path: str | None = None,
        proper_noun_context_biasing_enable: bool = False,
        proper_noun_context_biasing_beam_size: int = 4,
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
        self.context_biasing_config = ProperNounContextBiasingConfig(
            enabled=proper_noun_context_biasing_enable,
            beam_size=max(1, int(proper_noun_context_biasing_beam_size)),
        )
        if proper_noun_enable and not self.post_processor.enabled:
            self.logger.warning(
                "Proper noun post processor is disabled because tokenizer is unavailable.",
            )
        if (
            self.context_biasing_config.enabled
            and not self.proper_noun_dictionary.entries
        ):
            self.logger.warning(
                "Proper noun context biasing is enabled but dictionary is unavailable.",
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
            voice=spe_result.voice,
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
        voice: np.ndarray,
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

        correction_trace = self.__build_postprocess_trace(post_process_result)
        if post_process_result.changed:
            sr_result.result = list(post_process_result.corrected_result)

        biasing_trace = self.__apply_confirmed_context_biasing(
            voice=voice,
            post_process_result=post_process_result,
        )
        if biasing_trace is not None:
            correction_trace["context_biasing"] = biasing_trace
            if biasing_trace["adopted"]:
                sr_result.result = list(biasing_trace["selected_result"])
                correction_trace["decode_path"] = "context_biasing"
                correction_trace["decision_reason"] = biasing_trace["decision_reason"]
            else:
                correction_trace["decision_reason"] = biasing_trace["decision_reason"]

        self.logger.info({"proper_noun_postprocess": correction_trace})
        return correction_trace

    def __build_postprocess_trace(self, post_process_result: Any) -> dict[str, Any]:
        return {
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
            "deferred_entries": [
                {
                    "normalized_yomi": deferred_match.normalized_yomi,
                    "start_index": deferred_match.start_index,
                    "end_index": deferred_match.end_index,
                    "reason": deferred_match.reason,
                    "context_hint": {
                        "left_surfaces": list(
                            deferred_match.context_hint.left_surfaces
                        ),
                        "right_surfaces": list(
                            deferred_match.context_hint.right_surfaces
                        ),
                    },
                    "candidates": [
                        {
                            "surface": candidate.surface,
                            "normalized_yomi": candidate.normalized_yomi,
                            "priority": candidate.priority,
                            "category": candidate.category,
                            "source_line": candidate.source_line,
                            "ambiguous": candidate.ambiguous,
                        }
                        for candidate in deferred_match.candidates
                    ],
                }
                for deferred_match in post_process_result.deferred_matches
            ],
            "decode_path": "baseline_with_unique_yomi_postprocess",
        }

    def __apply_confirmed_context_biasing(
        self,
        *,
        voice: np.ndarray,
        post_process_result: Any,
    ) -> dict[str, Any] | None:
        if not self.context_biasing_config.enabled:
            return None
        if not self.proper_noun_dictionary.entries:
            return {
                "enabled": True,
                "adopted": False,
                "decision_reason": "dictionary_unavailable",
            }

        key_phrases = self.proper_noun_dictionary.surfaces_for_biasing()
        if not key_phrases:
            return {
                "enabled": True,
                "adopted": False,
                "decision_reason": "empty_key_phrases",
            }

        start_t = perf_counter()
        try:
            biasing_result = self.s2t.transcribe_candidates(
                voice,
                strategy=self.context_biasing_config.strategy,
                beam_size=self.context_biasing_config.beam_size,
                boosting_phrases=list(key_phrases),
                boosting_tree_alpha=self.context_biasing_config.boosting_tree_alpha,
            )
        except Exception as exc:
            self.logger.warning("Proper noun context biasing failed: %r", exc)
            return {
                "enabled": True,
                "adopted": False,
                "decision_reason": "biasing_decode_failed",
                "error": repr(exc),
            }

        baseline_text = post_process_result.corrected_text
        biasing_text = self.__result_text(tuple(biasing_result))
        resolved_candidates = self.__resolve_deferred_candidates(
            biasing_text=biasing_text,
            post_process_result=post_process_result,
        )

        adopted = bool(resolved_candidates) and biasing_text != baseline_text
        selected_result = list(biasing_result) if adopted else list(
            post_process_result.corrected_result
        )
        selected_text = biasing_text if adopted else baseline_text
        decision_reason = (
            "resolved_deferred_candidates_from_context_biasing"
            if adopted
            else "kept_baseline_after_context_biasing_compare"
        )
        if not post_process_result.deferred_matches:
            decision_reason = "no_deferred_candidates_for_context_biasing"
        elif not resolved_candidates:
            decision_reason = "context_biasing_did_not_resolve_deferred_candidates"
        elif biasing_text == baseline_text:
            decision_reason = "context_biasing_matched_baseline_text"

        return {
            "enabled": True,
            "strategy": self.context_biasing_config.strategy,
            "beam_size": self.context_biasing_config.beam_size,
            "boosting_tree_alpha": self.context_biasing_config.boosting_tree_alpha,
            "key_phrases": list(key_phrases),
            "elapsed_seconds": perf_counter() - start_t,
            "biasing_result": list(biasing_result),
            "biasing_text": biasing_text,
            "baseline_text": baseline_text,
            "resolved_candidates": resolved_candidates,
            "adopted": adopted,
            "selected_text": selected_text,
            "selected_result": selected_result,
            "decision_reason": decision_reason,
        }

    def __resolve_deferred_candidates(
        self,
        *,
        biasing_text: str,
        post_process_result: Any,
    ) -> list[dict[str, Any]]:
        resolved_candidates: list[dict[str, Any]] = []
        for deferred_match in post_process_result.deferred_matches:
            matched_candidates = [
                candidate
                for candidate in deferred_match.candidates
                if candidate.surface in biasing_text
            ]
            if len(matched_candidates) != 1:
                continue
            candidate = matched_candidates[0]
            resolved_candidates.append(
                {
                    "normalized_yomi": deferred_match.normalized_yomi,
                    "surface": candidate.surface,
                    "reason": deferred_match.reason,
                    "start_index": deferred_match.start_index,
                    "end_index": deferred_match.end_index,
                }
            )
        return resolved_candidates

    @staticmethod
    def __result_text(result: tuple[tuple[str, float], ...]) -> str:
        return "".join(text for text, _score in result if text != "</s>")

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
