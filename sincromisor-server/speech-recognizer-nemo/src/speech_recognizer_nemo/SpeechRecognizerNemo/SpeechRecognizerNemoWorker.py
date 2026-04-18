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


@dataclass(frozen=True)
class ProperNounNbestRerankingConfig:
    enabled: bool
    beam_size: int
    strategy: str = "alsd"


class SpeechRecognizerNemoWorker:
    def __init__(
        self,
        voice_log_dir: str | None,
        proper_noun_enable: bool = False,
        proper_noun_dict_path: str | None = None,
        proper_noun_context_biasing_enable: bool = False,
        proper_noun_context_biasing_beam_size: int = 4,
        proper_noun_nbest_enable: bool = False,
        proper_noun_nbest_beam_size: int = 4,
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
        self.nbest_reranking_config = ProperNounNbestRerankingConfig(
            enabled=proper_noun_nbest_enable,
            beam_size=max(1, int(proper_noun_nbest_beam_size)),
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
        if self.nbest_reranking_config.enabled and not self.proper_noun_dictionary.entries:
            self.logger.warning(
                "Proper noun N-best reranking is enabled but dictionary is unavailable.",
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

        nbest_trace = self.__apply_confirmed_nbest_reranking(
            voice=voice,
            post_process_result=post_process_result,
            current_result=tuple(sr_result.result),
            current_decode_path=correction_trace["decode_path"],
        )
        if nbest_trace is not None:
            correction_trace["nbest_reranking"] = nbest_trace
            if nbest_trace["adopted"]:
                sr_result.result = list(nbest_trace["selected_result"])
                correction_trace["decode_path"] = "nbest_rerank"
                correction_trace["decision_reason"] = nbest_trace["decision_reason"]
            else:
                correction_trace["decision_reason"] = nbest_trace["decision_reason"]

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
            "decision_reason": (
                "unique_yomi_postprocess_applied"
                if post_process_result.changed
                else "kept_baseline_after_unique_yomi_postprocess"
            ),
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

    def __apply_confirmed_nbest_reranking(
        self,
        *,
        voice: np.ndarray,
        post_process_result: Any,
        current_result: tuple[tuple[str, float], ...],
        current_decode_path: str,
    ) -> dict[str, Any] | None:
        if not self.nbest_reranking_config.enabled:
            return None
        if not self.proper_noun_dictionary.entries:
            return {
                "enabled": True,
                "adopted": False,
                "decision_reason": "dictionary_unavailable",
            }
        if not post_process_result.deferred_matches:
            return {
                "enabled": True,
                "strategy": self.nbest_reranking_config.strategy,
                "beam_size": self.nbest_reranking_config.beam_size,
                "adopted": False,
                "decision_reason": "no_deferred_candidates_for_nbest_reranking",
            }
        if current_decode_path == "context_biasing":
            return {
                "enabled": True,
                "strategy": self.nbest_reranking_config.strategy,
                "beam_size": self.nbest_reranking_config.beam_size,
                "adopted": False,
                "decision_reason": "context_biasing_already_adopted",
            }

        start_t = perf_counter()
        try:
            nbest_result = self.s2t.transcribe_candidates(
                voice,
                strategy=self.nbest_reranking_config.strategy,
                beam_size=self.nbest_reranking_config.beam_size,
            )
        except Exception as exc:
            self.logger.warning("Proper noun N-best reranking failed: %r", exc)
            return {
                "enabled": True,
                "strategy": self.nbest_reranking_config.strategy,
                "beam_size": self.nbest_reranking_config.beam_size,
                "adopted": False,
                "decision_reason": "nbest_decode_failed",
                "error": repr(exc),
            }

        candidate_traces = self.__score_nbest_candidates(
            nbest_result=tuple(nbest_result),
            post_process_result=post_process_result,
        )
        raw_baseline_candidate = self.__build_candidate_trace(
            candidate_result=post_process_result.raw_result,
            raw_text=post_process_result.raw_text,
            post_process_result=post_process_result,
        )
        current_baseline_candidate = self.__build_candidate_trace(
            candidate_result=current_result,
            raw_text=self.__result_text(current_result),
            post_process_result=post_process_result,
        )
        selected_candidate = (
            max(candidate_traces, key=lambda candidate: candidate["total_score"])
            if candidate_traces
            else None
        )

        adopted = (
            selected_candidate is not None
            and selected_candidate["deferred_resolved_count"] > 0
            and selected_candidate["corrected_text"]
            != current_baseline_candidate["corrected_text"]
            and selected_candidate["total_score"]
            > current_baseline_candidate["total_score"]
        )
        selected_result = (
            selected_candidate["selected_result"]
            if adopted and selected_candidate is not None
            else list(current_result)
        )
        decision_reason = (
            "resolved_deferred_candidates_from_nbest_reranking"
            if adopted
            else "kept_baseline_after_nbest_reranking"
        )
        if not candidate_traces:
            decision_reason = "nbest_candidates_empty"
        elif (
            selected_candidate is not None
            and selected_candidate["deferred_resolved_count"] <= 0
        ):
            decision_reason = "nbest_reranking_did_not_resolve_deferred_candidates"
        elif (
            selected_candidate is not None
            and selected_candidate["corrected_text"]
            == current_baseline_candidate["corrected_text"]
        ):
            decision_reason = "nbest_reranking_matched_baseline_text"

        return {
            "enabled": True,
            "strategy": self.nbest_reranking_config.strategy,
            "beam_size": self.nbest_reranking_config.beam_size,
            "score_note": (
                "model_score is NeMo beam search score; larger is better, but it is not a probability"
            ),
            "elapsed_seconds": perf_counter() - start_t,
            "raw_baseline_candidate": raw_baseline_candidate,
            "current_baseline_candidate": current_baseline_candidate,
            "ranked_candidates": candidate_traces,
            "selected_candidate": selected_candidate,
            "adopted": adopted,
            "selected_text": self.__result_text(tuple(selected_result)),
            "selected_result": selected_result,
            "decision_reason": decision_reason,
        }

    def __score_nbest_candidates(
        self,
        *,
        nbest_result: tuple[tuple[str, float], ...],
        post_process_result: Any,
    ) -> list[dict[str, Any]]:
        candidate_traces: list[dict[str, Any]] = []
        for rank, (candidate_text, model_score) in enumerate(nbest_result, start=1):
            if candidate_text == "</s>":
                continue

            # 候補ごとに一度 post process を通し、曖昧語以外の補正条件は baseline と揃える。
            candidate_post_process = self.post_processor.apply([(candidate_text, model_score)])
            resolved_candidates = self.__resolve_deferred_candidates(
                biasing_text=candidate_post_process.corrected_text,
                post_process_result=post_process_result,
            )
            priority_score = sum(
                resolved_candidate["priority"] for resolved_candidate in resolved_candidates
            )
            context_score = sum(
                resolved_candidate["context_score"]
                for resolved_candidate in resolved_candidates
            )
            dictionary_match_count = len(candidate_post_process.matches)

            # 固有名詞解決を最優先にしつつ、僅差のときだけ model score と rank で整列する。
            total_score = (
                float(len(resolved_candidates) * 1000)
                + float(priority_score * 10)
                + float(context_score * 2)
                + float(dictionary_match_count)
                + float((self.nbest_reranking_config.beam_size - rank + 1) * 0.1)
                + float(model_score * 0.01)
            )
            candidate_traces.append(
                {
                    "rank": rank,
                    "raw_text": candidate_text,
                    "corrected_text": candidate_post_process.corrected_text,
                    "model_score": model_score,
                    "dictionary_match_count": dictionary_match_count,
                    "deferred_resolved_count": len(resolved_candidates),
                    "priority_score": priority_score,
                    "context_score": context_score,
                    "total_score": total_score,
                    "resolved_candidates": resolved_candidates,
                    "selected_result": list(candidate_post_process.corrected_result),
                }
            )

        candidate_traces.sort(key=lambda candidate: candidate["total_score"], reverse=True)
        for rank, candidate_trace in enumerate(candidate_traces, start=1):
            candidate_trace["rerank_position"] = rank
        return candidate_traces

    def __build_candidate_trace(
        self,
        *,
        candidate_result: tuple[tuple[str, float], ...],
        raw_text: str,
        post_process_result: Any,
    ) -> dict[str, Any]:
        baseline_text = self.__result_text(candidate_result)
        baseline_score = self.__primary_score(candidate_result)
        resolved_candidates = self.__resolve_deferred_candidates(
            biasing_text=baseline_text,
            post_process_result=post_process_result,
        )
        return {
            "raw_text": raw_text,
            "corrected_text": baseline_text,
            "model_score": baseline_score,
            "dictionary_match_count": len(post_process_result.matches),
            "deferred_resolved_count": len(resolved_candidates),
            "priority_score": sum(
                resolved_candidate["priority"] for resolved_candidate in resolved_candidates
            ),
            "context_score": sum(
                resolved_candidate["context_score"] for resolved_candidate in resolved_candidates
            ),
            "total_score": float(len(resolved_candidates) * 1000)
            + float(
                sum(resolved_candidate["priority"] for resolved_candidate in resolved_candidates)
                * 10
            )
            + float(
                sum(
                    resolved_candidate["context_score"]
                    for resolved_candidate in resolved_candidates
                )
                * 2
            )
            + float(len(post_process_result.matches))
            + float(baseline_score * 0.01),
            "resolved_candidates": resolved_candidates,
            "selected_result": list(candidate_result),
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
            context_score = sum(
                1
                for surface in (
                    *deferred_match.context_hint.left_surfaces,
                    *deferred_match.context_hint.right_surfaces,
                )
                if surface and surface in biasing_text
            )
            resolved_candidates.append(
                {
                    "normalized_yomi": deferred_match.normalized_yomi,
                    "surface": candidate.surface,
                    "priority": candidate.priority,
                    "reason": deferred_match.reason,
                    "start_index": deferred_match.start_index,
                    "end_index": deferred_match.end_index,
                    "context_score": context_score,
                }
            )
        return resolved_candidates

    @staticmethod
    def __result_text(result: tuple[tuple[str, float], ...]) -> str:
        return "".join(text for text, _score in result if text != "</s>")

    @staticmethod
    def __primary_score(result: tuple[tuple[str, float], ...]) -> float:
        for text, score in result:
            if text != "</s>":
                return float(score)
        return 0.0

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
