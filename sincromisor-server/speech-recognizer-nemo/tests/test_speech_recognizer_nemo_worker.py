# ruff: noqa: PT009, PT027
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np
from sincro_models import SpeechExtractorResult
from speech_recognizer_nemo.SpeechRecognizerNemo import (
    ProperNounDictionary,
    SpeechRecognizerNemoWorker,
)


class FakeSpeechRecognizerNemo:
    def __init__(self) -> None:
        self.last_candidates_kwargs: dict[str, object] | None = None

    def transcribe_with_score(self, _voice: np.ndarray) -> list[tuple[str, float]]:
        return [("しんくろみそーる", 0.5), ("です", 1.0), ("</s>", 1.0)]

    def transcribe_candidates(
        self,
        _voice: np.ndarray,
        *,
        strategy: str | None = None,
        beam_size: int | None = None,
        boosting_phrases: list[str] | None = None,
        boosting_tree_alpha: float = 0.0,
        allow_cuda_graphs: bool | None = None,
    ) -> list[tuple[str, float]]:
        self.last_candidates_kwargs = {
            "strategy": strategy,
            "beam_size": beam_size,
            "boosting_phrases": boosting_phrases,
            "boosting_tree_alpha": boosting_tree_alpha,
            "allow_cuda_graphs": allow_cuda_graphs,
        }
        return [("タブンネです", 0.8), ("</s>", 1.0)]


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
    def __init__(self, surface: str) -> None:
        self.surface = surface
        self.normalized_yomi = "たぶんね"
        self.priority = 100
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
    candidates = (FakeCandidate("タブンネ"), FakeCandidate("たぶんね"))
    context_hint = FakeContextHint()


class FakeDeferredPostProcessorResult(FakePostProcessorResult):
    def __init__(self) -> None:
        super().__init__("たぶんねです", changed=False)
        self.deferred_yomi = ("たぶんね",)
        self.deferred_matches = (FakeDeferredMatch(),)


class FakeDeferredPostProcessor(FakePostProcessor):
    def apply(self, _result: list[tuple[str, float]]) -> FakeDeferredPostProcessorResult:
        return FakeDeferredPostProcessorResult()


class SpeechRecognizerNemoWorkerTest(unittest.TestCase):
    def setUp(self) -> None:
        self.fixture_path = Path(__file__).with_name("fixtures") / "proper_nouns.csv"

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
                correction_trace = json.loads(trace_files[0].read_text(encoding="utf-8"))

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

    def test_recognize_uses_context_biasing_only_for_confirmed_and_adopts_result(self) -> None:
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
                worker.proper_noun_dictionary = (
                    ProperNounDictionary.load_from_csv(self.fixture_path)
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
                correction_trace = json.loads(trace_files[0].read_text(encoding="utf-8"))

        self.assertEqual(confirmed_result.result_text(), "タブンネです")
        self.assertEqual(fake_nemo.last_candidates_kwargs["strategy"], "malsd_batch")
        self.assertEqual(fake_nemo.last_candidates_kwargs["beam_size"], 5)
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
