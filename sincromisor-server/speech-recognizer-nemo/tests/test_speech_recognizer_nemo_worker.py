# ruff: noqa: PT009, PT027
import io
import json
import logging
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from sincro_config.SincromisorLoggerConfig import JsonLogFormatter
from sincro_models import SpeechExtractorResult
from speech_recognizer_nemo.SpeechRecognizerNemo import (
    ProperNounDictionary,
    SpeechRecognizerNemoWorker,
)


class FakeSpeechRecognizerNemo:
    def __init__(self) -> None:
        self.encoded_refs = []
        self.decode_refs = []
        self.last_candidates_kwargs: dict[str, object] | None = None
        self.last_nbest_kwargs: dict[str, object] | None = None

    def encode(self, voice):
        import weakref

        encoded = np.copy(voice)
        self.encoded_refs.append(weakref.ref(encoded))
        return encoded

    def decode_with_score(self, encoded) -> list[tuple[str, float]]:
        self.decode_refs.append(self.encoded_refs[-1])
        assert encoded is self.encoded_refs[-1]()
        return [("しんくろみそーる", 0.5), ("です", 1.0), ("</s>", 1.0)]

    def decode_candidates(
        self,
        encoded,
        *,
        strategy: str | None = None,
        beam_size: int | None = None,
        boosting_phrases: list[str] | None = None,
        boosting_tree_alpha: float = 0.0,
        allow_cuda_graphs: bool | None = None,
    ) -> list[tuple[str, float]]:
        self.decode_refs.append(self.encoded_refs[-1])
        assert encoded is self.encoded_refs[-1]()
        kwargs = {
            "strategy": strategy,
            "beam_size": beam_size,
            "boosting_phrases": boosting_phrases,
            "boosting_tree_alpha": boosting_tree_alpha,
            "allow_cuda_graphs": allow_cuda_graphs,
        }
        if boosting_phrases:
            self.last_candidates_kwargs = kwargs
            return [("タブンネです", 0.8), ("</s>", 1.0)]

        self.last_nbest_kwargs = kwargs
        return [
            ("たぶんねです", 0.95),
            ("タブンネです", 0.7),
            ("多分ねです", 0.6),
        ]


class FakePostProcessorResult:
    def __init__(self, corrected_text: str, changed: bool) -> None:
        self.raw_text = "しんくろみそーるです"
        self.corrected_text = corrected_text
        self.raw_result = (("しんくろみそーる", 0.5), ("です", 1.0), ("</s>", 1.0))
        self.corrected_result = ((corrected_text, 0.5), ("</s>", 1.0))
        self.matches = ()
        self.deferred_yomi = ()
        self.deferred_matches = ()
        self.changed = changed


class FakePostProcessor:
    def __init__(self) -> None:
        self.enabled = True

    def apply(self, _result: list[tuple[str, float]]) -> FakePostProcessorResult:
        return FakePostProcessorResult("Sincromisorです", changed=True)


class FakeCandidate:
    def __init__(self, surface: str, priority: int = 100) -> None:
        self.surface = surface
        self.normalized_yomi = "たぶんね"
        self.priority = priority
        self.category = "pokemon"
        self.source_line = 2
        self.ambiguous = True


class FakeContextHint:
    left_surfaces = ("ポケモン",)
    right_surfaces = ("です",)


class FakeDeferredMatch:
    normalized_yomi = "たぶんね"
    start_index = 3
    end_index = 5
    reason = "multiple_candidates_for_same_yomi"
    candidates = (
        FakeCandidate("タブンネ", priority=100),
        FakeCandidate("たぶんね", priority=10),
    )
    context_hint = FakeContextHint()


class FakeDeferredPostProcessorResult(FakePostProcessorResult):
    def __init__(self) -> None:
        super().__init__("たぶんねです", changed=False)
        self.deferred_yomi = ("たぶんね",)
        self.deferred_matches = (FakeDeferredMatch(),)


class FakeDeferredPostProcessor(FakePostProcessor):
    def apply(
        self, _result: list[tuple[str, float]]
    ) -> FakeDeferredPostProcessorResult:
        return FakeDeferredPostProcessorResult()


class FakeRerankAwareDeferredPostProcessor(FakePostProcessor):
    def apply(
        self, result: list[tuple[str, float]]
    ) -> FakeDeferredPostProcessorResult | FakePostProcessorResult:
        candidate_text = "".join(text for text, _score in result if text != "</s>")
        if candidate_text == "タブンネです":
            return FakePostProcessorResult("タブンネです", changed=False)
        if candidate_text == "多分ねです":
            return FakePostProcessorResult("多分ねです", changed=False)
        return FakeDeferredPostProcessorResult()


class SpeechRecognizerNemoWorkerTest(unittest.TestCase):
    def test_storage_permission_diagnostic(self) -> None:
        """認識JSONと入力音声の保存拒否を、本文や保存パスなしで会話へ対応付ける。"""
        worker = object.__new__(SpeechRecognizerNemoWorker)
        worker.voice_log_dir = "/private-test-path"
        worker.logger = logging.getLogger("sincro.storage_test")
        result = SpeechExtractorResult(session_id="session-a", speech_id=8, start_at=0)
        output = io.StringIO()
        handler = logging.StreamHandler(output)
        handler.setFormatter(JsonLogFormatter())
        worker.logger.addHandler(handler)
        try:
            for method in (
                worker._SpeechRecognizerNemoWorker__export_voice,
                worker._SpeechRecognizerNemoWorker__export_result,
            ):
                with (
                    patch.object(
                        Path, "mkdir", side_effect=PermissionError("private-token")
                    ),
                    self.assertRaises(PermissionError),
                ):
                    method(result)
            rows = [json.loads(line) for line in output.getvalue().splitlines()]
            self.assertEqual(len(rows), 2)
            self.assertTrue(
                all(
                    row["reason"] == "permission_denied"
                    and row["session_id"] == "session-a"
                    for row in rows
                )
            )
            self.assertNotIn("private-", output.getvalue())
        finally:
            worker.logger.removeHandler(handler)

    def test_conversation_log_switch(self) -> None:
        """モデルを人工結果へ置換し、本文の記録だけが切り替わることを確認する。"""
        for enabled in ("true", "false"):
            with (
                self.subTest(enabled=enabled),
                patch.dict(os.environ, {"SINCRO_LOG_CONVERSATION_ENABLED": enabled}),
                patch(
                    "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
                    FakeSpeechRecognizerNemo,
                ),
            ):
                worker = SpeechRecognizerNemoWorker(voice_log_dir=None)
                output = io.StringIO()
                handler = logging.StreamHandler(output)
                handler.setFormatter(JsonLogFormatter())
                worker.logger.addHandler(handler)
                old_level = worker.logger.level
                worker.logger.setLevel(logging.INFO)
                try:
                    result = worker.recognize(
                        SpeechExtractorResult(
                            session_id="session-a",
                            speech_id=1,
                            sequence_id=2,
                            start_at=0,
                            confirmed=True,
                            voice=np.zeros(160, dtype=np.int16),
                        ),
                        None,
                    )
                finally:
                    worker.logger.removeHandler(handler)
                    worker.logger.setLevel(old_level)
                self.assertEqual(result.result_text(), "しんくろみそーるです")
                rows = [json.loads(line) for line in output.getvalue().splitlines()]
                self.assertEqual(rows[-1]["event"], "recognition_processing")
                self.assertEqual(rows[-1]["session_id"], "session-a")
                self.assertEqual(
                    "しんくろみそーる" in output.getvalue(), enabled == "true"
                )
                self.assertEqual(len(rows), 2 if enabled == "true" else 1)

    def setUp(self) -> None:
        self.fixture_path = Path(__file__).with_name("fixtures") / "proper_nouns.csv"

    def test_init_logs_when_dependent_features_are_enabled_but_dictionary_is_disabled(
        self,
    ) -> None:
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=FakeSpeechRecognizerNemo(),
        ):
            with self.assertLogs(
                "sincro.SpeechRecognizerNemoWorker", level="INFO"
            ) as logs:
                SpeechRecognizerNemoWorker(
                    voice_log_dir=None,
                    proper_noun_enable=False,
                    proper_noun_dict_path=str(self.fixture_path),
                    proper_noun_context_biasing_enable=True,
                    proper_noun_nbest_enable=True,
                )

        joined_logs = "\n".join(logs.output)
        self.assertIn(
            "Proper noun dictionary is unavailable (disabled by config: "
            "SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=false).",
            joined_logs,
        )
        self.assertIn(
            "Proper noun context biasing is enabled but dictionary is unavailable "
            "(disabled by config: SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=false).",
            joined_logs,
        )
        self.assertIn(
            "Proper noun N-best reranking is enabled but dictionary is unavailable "
            "(disabled by config: SINCRO_RECOGNIZER_PROPER_NOUN_ENABLE=false).",
            joined_logs,
        )

    def test_init_logs_when_dictionary_file_is_missing(self) -> None:
        missing_path = self.fixture_path.with_name("missing.csv")
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=FakeSpeechRecognizerNemo(),
        ):
            with self.assertLogs(
                "sincro.SpeechRecognizerNemoWorker", level="WARNING"
            ) as logs:
                SpeechRecognizerNemoWorker(
                    voice_log_dir=None,
                    proper_noun_enable=True,
                    proper_noun_dict_path=str(missing_path),
                    proper_noun_context_biasing_enable=True,
                )

        joined_logs = "\n".join(logs.output)
        self.assertIn(
            f"Proper noun dictionary is unavailable (dictionary file does not exist: path={missing_path}).",
            joined_logs,
        )
        self.assertIn(
            f"Proper noun context biasing is enabled but dictionary is unavailable "
            f"(dictionary file does not exist: path={missing_path}).",
            joined_logs,
        )

    def test_init_logs_invalid_dictionary_format_reason(self) -> None:
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=FakeSpeechRecognizerNemo(),
        ):
            with tempfile.TemporaryDirectory() as temp_dir:
                invalid_csv_path = Path(temp_dir, "invalid.csv")
                invalid_csv_path.write_text(
                    "surface,priority\nSincromisor,100\n",
                    encoding="utf-8",
                )
                with self.assertLogs(
                    "sincro.SpeechRecognizerNemoWorker", level="WARNING"
                ) as logs:
                    SpeechRecognizerNemoWorker(
                        voice_log_dir=None,
                        proper_noun_enable=True,
                        proper_noun_dict_path=str(invalid_csv_path),
                        proper_noun_nbest_enable=True,
                    )

        joined_logs = "\n".join(logs.output)
        self.assertIn(
            "Proper noun dictionary load failed: "
            f"path={invalid_csv_path} reason=invalid dictionary format "
            "(Proper noun dictionary is missing required columns: yomi)",
            joined_logs,
        )
        self.assertIn(
            "Proper noun N-best reranking is enabled but dictionary is unavailable "
            f"(invalid dictionary format (Proper noun dictionary is missing required "
            f"columns: yomi): path={invalid_csv_path}).",
            joined_logs,
        )

    def test_init_logs_permission_error_reason(self) -> None:
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=FakeSpeechRecognizerNemo(),
        ):
            with patch(
                "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.ProperNounDictionary.load_from_csv_with_logger",
                side_effect=PermissionError("permission denied"),
            ):
                with tempfile.TemporaryDirectory() as temp_dir:
                    csv_path = Path(temp_dir, "proper_nouns.csv")
                    csv_path.write_text(
                        "surface,yomi\nSincromisor,しんくろみそーる\n",
                        encoding="utf-8",
                    )
                    with self.assertLogs(
                        "sincro.SpeechRecognizerNemoWorker", level="WARNING"
                    ) as logs:
                        SpeechRecognizerNemoWorker(
                            voice_log_dir=None,
                            proper_noun_enable=True,
                            proper_noun_dict_path=str(csv_path),
                            proper_noun_context_biasing_enable=True,
                        )

        joined_logs = "\n".join(logs.output)
        self.assertIn(
            "Proper noun dictionary load failed: "
            f"path={csv_path} reason=dictionary file is not readable "
            "(check directory/file permissions)",
            joined_logs,
        )
        self.assertIn(
            "Proper noun context biasing is enabled but dictionary is unavailable "
            f"(dictionary file is not readable (check directory/file permissions): "
            f"path={csv_path}).",
            joined_logs,
        )

    def test_recognize_applies_postprocess_only_for_confirmed(self) -> None:
        fake_nemo = FakeSpeechRecognizerNemo()
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=fake_nemo,
        ):
            worker = SpeechRecognizerNemoWorker(
                voice_log_dir=None,
                proper_noun_enable=False,
                proper_noun_dict_path=None,
            )
            worker.post_processor = FakePostProcessor()

            partial_result = worker.recognize(
                SpeechExtractorResult(
                    session_id="session",
                    speech_id=1,
                    sequence_id=1,
                    start_at=1.0,
                    confirmed=False,
                    voice=np.zeros(8, dtype=np.int16),
                ),
                s3_client=None,
            )
            confirmed_result = worker.recognize(
                SpeechExtractorResult(
                    session_id="session",
                    speech_id=1,
                    sequence_id=2,
                    start_at=1.0,
                    confirmed=True,
                    voice=np.zeros(8, dtype=np.int16),
                ),
                s3_client=None,
            )

        self.assertEqual(partial_result.result_text(), "しんくろみそーるです")
        self.assertEqual(confirmed_result.result_text(), "Sincromisorです")
        self.assertIsNone(fake_nemo.last_candidates_kwargs)

    def test_recognize_records_deferred_entries_in_trace(self) -> None:
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=FakeSpeechRecognizerNemo(),
        ):
            with tempfile.TemporaryDirectory() as temp_dir:
                worker = SpeechRecognizerNemoWorker(
                    voice_log_dir=temp_dir,
                    proper_noun_enable=False,
                    proper_noun_dict_path=None,
                )
                worker.post_processor = FakeDeferredPostProcessor()

                worker.recognize(
                    SpeechExtractorResult(
                        session_id="session",
                        speech_id=1,
                        sequence_id=2,
                        start_at=1.0,
                        confirmed=True,
                        voice=np.zeros(8, dtype=np.int16),
                    ),
                    s3_client=None,
                )

                trace_files = list(Path(temp_dir, "session").glob("*.trace.json"))
                self.assertEqual(len(trace_files), 1)
                correction_trace = json.loads(
                    trace_files[0].read_text(encoding="utf-8")
                )

        self.assertEqual(correction_trace["deferred_yomi"], ["たぶんね"])
        self.assertEqual(len(correction_trace["deferred_entries"]), 1)
        deferred_entry = correction_trace["deferred_entries"][0]
        self.assertEqual(
            deferred_entry["reason"],
            "multiple_candidates_for_same_yomi",
        )
        self.assertEqual(
            [candidate["surface"] for candidate in deferred_entry["candidates"]],
            ["タブンネ", "たぶんね"],
        )

    def test_recognize_uses_context_biasing_only_for_confirmed_and_adopts_result(
        self,
    ) -> None:
        fake_nemo = FakeSpeechRecognizerNemo()
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=fake_nemo,
        ):
            with tempfile.TemporaryDirectory() as temp_dir:
                worker = SpeechRecognizerNemoWorker(
                    voice_log_dir=temp_dir,
                    proper_noun_enable=False,
                    proper_noun_dict_path=None,
                    proper_noun_context_biasing_enable=True,
                    proper_noun_context_biasing_beam_size=5,
                )
                worker.proper_noun_dictionary = ProperNounDictionary.load_from_csv(
                    self.fixture_path
                )
                worker.post_processor = FakeDeferredPostProcessor()

                partial_result = worker.recognize(
                    SpeechExtractorResult(
                        session_id="session",
                        speech_id=1,
                        sequence_id=1,
                        start_at=1.0,
                        confirmed=False,
                        voice=np.zeros(8, dtype=np.int16),
                    ),
                    s3_client=None,
                )
                self.assertEqual(partial_result.result_text(), "しんくろみそーるです")
                self.assertIsNone(fake_nemo.last_candidates_kwargs)

                confirmed_result = worker.recognize(
                    SpeechExtractorResult(
                        session_id="session",
                        speech_id=1,
                        sequence_id=2,
                        start_at=1.0,
                        confirmed=True,
                        voice=np.zeros(8, dtype=np.int16),
                    ),
                    s3_client=None,
                )

                trace_files = list(Path(temp_dir, "session").glob("*.trace.json"))
                self.assertEqual(len(trace_files), 1)
                correction_trace = json.loads(
                    trace_files[0].read_text(encoding="utf-8")
                )

        self.assertEqual(confirmed_result.result_text(), "タブンネです")
        self.assertEqual(fake_nemo.last_candidates_kwargs["strategy"], "malsd_batch")
        self.assertEqual(fake_nemo.last_candidates_kwargs["beam_size"], 5)
        self.assertFalse(fake_nemo.last_candidates_kwargs["allow_cuda_graphs"])
        self.assertIn(
            "Sincromisor",
            fake_nemo.last_candidates_kwargs["boosting_phrases"],
        )
        self.assertIn(
            "タブンネ",
            fake_nemo.last_candidates_kwargs["boosting_phrases"],
        )
        self.assertEqual(correction_trace["decode_path"], "context_biasing")
        self.assertEqual(
            correction_trace["decision_reason"],
            "resolved_deferred_candidates_from_context_biasing",
        )
        self.assertTrue(correction_trace["context_biasing"]["adopted"])
        self.assertEqual(
            correction_trace["context_biasing"]["resolved_candidates"][0]["surface"],
            "タブンネ",
        )

    def test_recognize_uses_nbest_reranking_for_confirmed_ambiguous_candidates(
        self,
    ) -> None:
        fake_nemo = FakeSpeechRecognizerNemo()
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=fake_nemo,
        ):
            with tempfile.TemporaryDirectory() as temp_dir:
                worker = SpeechRecognizerNemoWorker(
                    voice_log_dir=temp_dir,
                    proper_noun_enable=False,
                    proper_noun_dict_path=None,
                    proper_noun_nbest_enable=True,
                    proper_noun_nbest_beam_size=3,
                )
                worker.proper_noun_dictionary = ProperNounDictionary.load_from_csv(
                    self.fixture_path
                )
                worker.post_processor = FakeRerankAwareDeferredPostProcessor()

                confirmed_result = worker.recognize(
                    SpeechExtractorResult(
                        session_id="session",
                        speech_id=2,
                        sequence_id=1,
                        start_at=1.0,
                        confirmed=True,
                        voice=np.zeros(8, dtype=np.int16),
                    ),
                    s3_client=None,
                )

                trace_files = list(Path(temp_dir, "session").glob("*.trace.json"))
                self.assertEqual(len(trace_files), 1)
                correction_trace = json.loads(
                    trace_files[0].read_text(encoding="utf-8")
                )

        self.assertEqual(confirmed_result.result_text(), "タブンネです")
        self.assertEqual(fake_nemo.last_nbest_kwargs["strategy"], "alsd")
        self.assertEqual(fake_nemo.last_nbest_kwargs["beam_size"], 3)
        self.assertEqual(correction_trace["decode_path"], "nbest_rerank")
        self.assertEqual(
            correction_trace["decision_reason"],
            "resolved_deferred_candidates_from_nbest_reranking",
        )
        self.assertTrue(correction_trace["nbest_reranking"]["adopted"])
        self.assertEqual(
            correction_trace["nbest_reranking"]["raw_baseline_candidate"][
                "corrected_text"
            ],
            "しんくろみそーるです",
        )
        self.assertEqual(
            correction_trace["nbest_reranking"]["selected_candidate"]["corrected_text"],
            "タブンネです",
        )
        self.assertEqual(
            correction_trace["nbest_reranking"]["ranked_candidates"][0][
                "resolved_candidates"
            ][0]["surface"],
            "タブンネ",
        )

    def test_recognize_skips_nbest_when_context_biasing_was_adopted(self) -> None:
        fake_nemo = FakeSpeechRecognizerNemo()
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=fake_nemo,
        ):
            with tempfile.TemporaryDirectory() as temp_dir:
                worker = SpeechRecognizerNemoWorker(
                    voice_log_dir=temp_dir,
                    proper_noun_enable=False,
                    proper_noun_dict_path=None,
                    proper_noun_context_biasing_enable=True,
                    proper_noun_context_biasing_beam_size=5,
                    proper_noun_nbest_enable=True,
                    proper_noun_nbest_beam_size=3,
                )
                worker.proper_noun_dictionary = ProperNounDictionary.load_from_csv(
                    self.fixture_path
                )
                worker.post_processor = FakeDeferredPostProcessor()

                confirmed_result = worker.recognize(
                    SpeechExtractorResult(
                        session_id="session",
                        speech_id=3,
                        sequence_id=1,
                        start_at=1.0,
                        confirmed=True,
                        voice=np.zeros(8, dtype=np.int16),
                    ),
                    s3_client=None,
                )

                trace_files = list(Path(temp_dir, "session").glob("*.trace.json"))
                self.assertEqual(len(trace_files), 1)
                correction_trace = json.loads(
                    trace_files[0].read_text(encoding="utf-8")
                )

        self.assertEqual(confirmed_result.result_text(), "タブンネです")
        self.assertIsNone(fake_nemo.last_nbest_kwargs)
        self.assertEqual(correction_trace["decode_path"], "context_biasing")
        self.assertEqual(
            correction_trace["nbest_reranking"]["decision_reason"],
            "context_biasing_already_adopted",
        )

    def test_recognize_skips_context_biasing_when_no_deferred_candidates_exist(
        self,
    ) -> None:
        fake_nemo = FakeSpeechRecognizerNemo()
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=fake_nemo,
        ):
            with tempfile.TemporaryDirectory() as temp_dir:
                worker = SpeechRecognizerNemoWorker(
                    voice_log_dir=temp_dir,
                    proper_noun_enable=False,
                    proper_noun_dict_path=None,
                    proper_noun_context_biasing_enable=True,
                    proper_noun_context_biasing_beam_size=5,
                )
                worker.proper_noun_dictionary = ProperNounDictionary.load_from_csv(
                    self.fixture_path
                )
                worker.post_processor = FakePostProcessor()

                confirmed_result = worker.recognize(
                    SpeechExtractorResult(
                        session_id="session",
                        speech_id=4,
                        sequence_id=1,
                        start_at=1.0,
                        confirmed=True,
                        voice=np.zeros(8, dtype=np.int16),
                    ),
                    s3_client=None,
                )

                trace_files = list(Path(temp_dir, "session").glob("*.trace.json"))
                self.assertEqual(len(trace_files), 1)
                correction_trace = json.loads(
                    trace_files[0].read_text(encoding="utf-8")
                )

        self.assertEqual(confirmed_result.result_text(), "Sincromisorです")
        self.assertIsNone(fake_nemo.last_candidates_kwargs)
        self.assertEqual(
            correction_trace["context_biasing"]["decision_reason"],
            "no_deferred_candidates_for_context_biasing",
        )


class EncodedReuseTests(unittest.TestCase):
    def test_request_scoped_reuse_and_release(self):
        # 既存の採否判定用代役で、実際に通ったデコードの入力同一性を確認する。
        for mode in (
            "no_retry",
            "adopted",
            "nbest",
            "retry_failure",
            "baseline_failure",
        ):
            with self.subTest(mode=mode):
                fake = FakeSpeechRecognizerNemo()
                original = fake.decode_candidates

                def candidates(encoded, original=original, mode=mode, **kwargs):
                    values = original(encoded, **kwargs)
                    if mode == "retry_failure":
                        raise ValueError("retry failed")
                    if mode == "nbest" and kwargs.get("boosting_phrases"):
                        return [("しんくろみそーるです", 0.5)]
                    return values

                fake.decode_candidates = candidates
                with patch(
                    "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
                    return_value=fake,
                ):
                    worker = SpeechRecognizerNemoWorker(
                        voice_log_dir=None,
                        proper_noun_enable=False,
                        proper_noun_context_biasing_enable=True,
                        proper_noun_nbest_enable=True,
                    )
                worker.proper_noun_dictionary = ProperNounDictionary.load_from_csv(
                    Path(__file__).parent / "fixtures" / "proper_nouns.csv"
                )
                worker.post_processor = FakeRerankAwareDeferredPostProcessor()
                request = SpeechExtractorResult(
                    session_id="fixture",
                    speech_id=1,
                    sequence_id=1,
                    start_at=0,
                    confirmed=mode != "no_retry",
                    voice=np.zeros(8, dtype=np.int16),
                )
                if mode == "baseline_failure":
                    fake.decode_with_score = lambda encoded: (_ for _ in ()).throw(
                        ValueError("baseline")
                    )
                    with self.assertRaises(ValueError):
                        worker.recognize(request, None)
                else:
                    result = worker.recognize(request, None)
                    self.assertEqual(result.speech_id, 1)
                self.assertEqual(len(fake.encoded_refs), 1)
                self.assertIsNone(fake.encoded_refs[0]())
                expected = {
                    "no_retry": 1,
                    "adopted": 2,
                    "nbest": 3,
                    "retry_failure": 3,
                    "baseline_failure": 0,
                }[mode]
                self.assertEqual(len(fake.decode_refs), expected)
                self.assertTrue(
                    all(ref is fake.encoded_refs[0] for ref in fake.decode_refs)
                )
                if mode == "nbest":
                    self.assertEqual(result.result_text(), "タブンネです")
                if mode in ("retry_failure", "no_retry"):
                    self.assertEqual(result.result_text(), "しんくろみそーるです")

    def test_cancelled_execution_releases_request_encoding(self):
        import asyncio
        import threading

        from speech_recognizer_nemo.recognizer_execution import RecognizerExecution

        async def run():
            loop = asyncio.get_running_loop()
            started = asyncio.Event()
            release = threading.Event()
            fake = FakeSpeechRecognizerNemo()
            original_decode = fake.decode_with_score

            def decode(encoded):
                loop.call_soon_threadsafe(started.set)
                assert release.wait(5)
                return original_decode(encoded)

            fake.decode_with_score = decode
            with patch(
                "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
                return_value=fake,
            ):
                execution = RecognizerExecution(
                    lambda: SpeechRecognizerNemoWorker(voice_log_dir=None)
                )
            request = SpeechExtractorResult(
                session_id="fixture",
                speech_id=1,
                sequence_id=1,
                start_at=0,
                confirmed=False,
                voice=np.zeros(8, dtype=np.int16),
            )
            pending = asyncio.create_task(execution.recognize(request, None))
            try:
                await asyncio.wait_for(started.wait(), 2)
                pending.cancel()
                await asyncio.sleep(0)
                self.assertFalse(pending.done())
                self.assertIsNotNone(fake.encoded_refs[0]())
                release.set()
                with self.assertRaises(asyncio.CancelledError):
                    await pending
                self.assertIsNone(fake.encoded_refs[0]())
                await execution.recognize(request, None)
                self.assertEqual(len(fake.encoded_refs), 2)
                self.assertTrue(all(ref() is None for ref in fake.encoded_refs))
            finally:
                release.set()
                await asyncio.gather(pending, return_exceptions=True)
                execution.close()

        asyncio.run(run())
