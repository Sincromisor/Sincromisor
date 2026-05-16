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
    """confirmed 音声に対する context biasing 再デコード設定。"""

    enabled: bool
    beam_size: int
    strategy: str = "malsd_batch"
    boosting_tree_alpha: float = 1.0


@dataclass(frozen=True)
class ProperNounNbestRerankingConfig:
    """曖昧語を解くための N-best 再ランキング設定。"""

    enabled: bool
    beam_size: int
    strategy: str = "alsd"


@dataclass(frozen=True)
class ProperNounDictionaryAvailability:
    """辞書の利用可否と、その理由をログ用に保持する。"""

    available: bool
    reason_code: str
    detail: str


class SpeechRecognizerNemoWorker:
    """音声認識、固有名詞補正、結果保存をまとめて扱うワーカー。"""

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
        # 認識本体と辞書系機能を初期化し、機能ごとの有効/無効をここで確定する。
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.s2t: SpeechRecognizerNemo = SpeechRecognizerNemo()
        self.voice_log_dir: str | None = voice_log_dir
        (
            self.proper_noun_dictionary,
            self.proper_noun_dictionary_availability,
        ) = self.__load_proper_noun_dictionary(
            proper_noun_enable=proper_noun_enable,
            proper_noun_dict_path=proper_noun_dict_path,
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
        self.__log_proper_noun_feature_guards()
        self.logger.info("SpeechRecognizerWorker is initialized.")

    def recognize(
        self,
        spe_result: SpeechExtractorResult,
        s3_client: SpeechRecognizerS3Client | None,
    ) -> SpeechRecognizerResult:
        """抽出済み音声を認識し、必要なら固有名詞補正とログ出力まで行う。"""
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
            # confirmed 音声のみを証跡として残し、途中結果のログ爆発を避ける。
            self.__export_result(sr_result, correction_trace=correction_trace)
            self.__export_voice(spe_result)
        if spe_result.confirmed and s3_client is not None:
            s3_client.export_result_to_s3(sr_result)
            s3_client.export_voice_to_s3(spe_result)
        return sr_result

    def __transcribe_with_score(self, voice: np.ndarray) -> list[tuple[str, float]]:
        """baseline の認識結果を `(text, score)` 形式で取得する。"""
        return self.s2t.transcribe_with_score(voice)

    def __load_proper_noun_dictionary(
        self,
        *,
        proper_noun_enable: bool,
        proper_noun_dict_path: str | None,
    ) -> tuple[ProperNounDictionary, ProperNounDictionaryAvailability]:
        """辞書設定を安全に読み込み、失敗時は空辞書へフォールバックする。"""
        if not proper_noun_enable:
            detail = "disabled by config: SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=false"
            self.logger.info("Proper noun dictionary is unavailable (%s).", detail)
            return (
                ProperNounDictionary.empty(),
                ProperNounDictionaryAvailability(
                    available=False,
                    reason_code="disabled_by_config",
                    detail=detail,
                ),
            )
        if not proper_noun_dict_path:
            detail = (
                "dictionary path is not set: "
                "SINCRO_RECOGNIZER_PROPER_NOUN_DICT_PATH is empty"
            )
            self.logger.warning(
                "Proper noun dictionary is unavailable (%s).",
                detail,
            )
            return (
                ProperNounDictionary.empty(),
                ProperNounDictionaryAvailability(
                    available=False,
                    reason_code="dict_path_not_set",
                    detail=detail,
                ),
            )

        csv_path = Path(proper_noun_dict_path)
        if not csv_path.exists():
            detail = f"dictionary file does not exist: path={csv_path}"
            self.logger.warning(
                "Proper noun dictionary is unavailable (%s).",
                detail,
            )
            return (
                ProperNounDictionary.empty(),
                ProperNounDictionaryAvailability(
                    available=False,
                    reason_code="dict_file_not_found",
                    detail=detail,
                ),
            )
        if not csv_path.is_file():
            detail = f"dictionary path is not a file: path={csv_path}"
            self.logger.warning(
                "Proper noun dictionary is unavailable (%s).",
                detail,
            )
            return (
                ProperNounDictionary.empty(),
                ProperNounDictionaryAvailability(
                    available=False,
                    reason_code="dict_path_not_file",
                    detail=detail,
                ),
            )

        try:
            dictionary = ProperNounDictionary.load_from_csv_with_logger(
                csv_path=proper_noun_dict_path,
                logger=self.logger,
            )
            if not dictionary.entries:
                detail = f"dictionary loaded but contains no enabled entries: path={csv_path}"
                self.logger.warning(
                    "Proper noun dictionary is unavailable (%s).",
                    detail,
                )
                return (
                    dictionary,
                    ProperNounDictionaryAvailability(
                        available=False,
                        reason_code="dict_has_no_enabled_entries",
                        detail=detail,
                    ),
                )
            return (
                dictionary,
                ProperNounDictionaryAvailability(
                    available=True,
                    reason_code="loaded",
                    detail=f"dictionary loaded successfully: path={csv_path}",
                ),
            )
        except Exception as exc:
            self.logger.warning(
                "Proper noun dictionary load failed: path=%s reason=%s: %r",
                csv_path,
                self.__classify_dictionary_load_exception(exc),
                exc,
            )
            return (
                ProperNounDictionary.empty(),
                ProperNounDictionaryAvailability(
                    available=False,
                    reason_code="dict_load_failed",
                    detail=(
                        f"{self.__classify_dictionary_load_exception(exc)}: "
                        f"path={csv_path}"
                    ),
                ),
            )

    def __log_proper_noun_feature_guards(self) -> None:
        """辞書依存機能の設定矛盾を初期化時に明示する。"""
        if not self.proper_noun_dictionary_availability.available:
            detail = self.proper_noun_dictionary_availability.detail
            if self.context_biasing_config.enabled:
                self.logger.warning(
                    "Proper noun context biasing is enabled but dictionary is unavailable (%s).",
                    detail,
                )
            if self.nbest_reranking_config.enabled:
                self.logger.warning(
                    "Proper noun N-best reranking is enabled but dictionary is unavailable (%s).",
                    detail,
                )

    def __classify_dictionary_load_exception(self, exc: Exception) -> str:
        """ロード失敗をログで読みやすい理由へ畳み込む。"""
        if isinstance(exc, PermissionError):
            return "dictionary file is not readable (check directory/file permissions)"
        if isinstance(exc, FileNotFoundError):
            return "dictionary file not found"
        if isinstance(exc, ValueError):
            return f"invalid dictionary format ({exc})"
        return "unexpected dictionary load error"

    def __apply_proper_noun_postprocess(
        self,
        *,
        sr_result: SpeechRecognizerResult,
        voice: np.ndarray,
        confirmed: bool,
    ) -> dict[str, Any] | None:
        """固有名詞補正と、必要に応じた再デコード系の救済処理を適用する。"""
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
            # 一意に確定できた辞書補正は、まず baseline 結果へ直接反映する。
            sr_result.result = list(post_process_result.corrected_result)

        # 曖昧語が残っている場合だけ、重い再デコード系で解決可能かを順に試す。
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
        """補正内容と判断理由を JSON へ出しやすい trace 形式へ整形する。"""
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
        """辞書語を key phrase に使って再デコードし、曖昧語が解けるか確認する。"""
        if not self.context_biasing_config.enabled:
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
                "adopted": False,
                "decision_reason": "no_deferred_candidates_for_context_biasing",
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
                # confirmed 後の救済 decode は機能優先だが、malsd_batch の既定 CUDA graph
                # と競合すると後続の通常推論まで巻き込んで壊れるため安全側へ倒す。
                allow_cuda_graphs=False,
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

        # 曖昧候補を実際に解決でき、かつ baseline と異なる場合だけ結果を採用する。
        adopted = bool(resolved_candidates) and biasing_text != baseline_text
        selected_result = (
            list(biasing_result)
            if adopted
            else list(post_process_result.corrected_result)
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
        """N-best 候補群を辞書観点で再採点し、baseline より良い候補があれば採用する。"""
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

        # 曖昧語解決を最優先条件にし、単に model score が高いだけでは置き換えない。
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
        """N-best 各候補を、辞書解決数と文脈一致度で再スコアリングする。"""
        candidate_traces: list[dict[str, Any]] = []
        for rank, (candidate_text, model_score) in enumerate(nbest_result, start=1):
            if candidate_text == "</s>":
                continue

            # 候補ごとに一度 post process を通し、曖昧語以外の補正条件は baseline と揃える。
            candidate_post_process = self.post_processor.apply(
                [(candidate_text, model_score)]
            )
            resolved_candidates = self.__resolve_deferred_candidates(
                biasing_text=candidate_post_process.corrected_text,
                post_process_result=post_process_result,
            )
            priority_score = sum(
                resolved_candidate["priority"]
                for resolved_candidate in resolved_candidates
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

        candidate_traces.sort(
            key=lambda candidate: candidate["total_score"], reverse=True
        )
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
        """baseline 候補も N-best 候補と同じ尺度で比較できるよう trace 化する。"""
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
                resolved_candidate["priority"]
                for resolved_candidate in resolved_candidates
            ),
            "context_score": sum(
                resolved_candidate["context_score"]
                for resolved_candidate in resolved_candidates
            ),
            "total_score": float(len(resolved_candidates) * 1000)
            + float(
                sum(
                    resolved_candidate["priority"]
                    for resolved_candidate in resolved_candidates
                )
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
        """再デコード結果の文面から、どの曖昧候補が一意に現れたかを抽出する。"""
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
            # 前後文脈語も同じ文面に現れていれば、より自然な解決として加点する。
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
        """候補列から終端記号を除いたテキストを得る。"""
        return "".join(text for text, _score in result if text != "</s>")

    @staticmethod
    def __primary_score(result: tuple[tuple[str, float], ...]) -> float:
        """候補列の先頭実テキストの score を代表値として取り出す。"""
        for text, score in result:
            if text != "</s>":
                return float(score)
        return 0.0

    def __export_result(
        self,
        result: SpeechRecognizerResult,
        correction_trace: dict[str, Any] | None = None,
    ) -> Path | None:
        """認識結果と補正 trace をローカルログへ保存する。"""
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
        """入力音声を opus 優先で保存し、後追い検証できるようにする。"""
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
