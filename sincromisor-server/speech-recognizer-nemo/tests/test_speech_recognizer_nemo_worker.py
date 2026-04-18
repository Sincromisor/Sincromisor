# ruff: noqa: PT009, PT027
import unittest
from unittest.mock import patch

import numpy as np
from sincro_models import SpeechExtractorResult
from speech_recognizer_nemo.SpeechRecognizerNemo import SpeechRecognizerNemoWorker


class FakeSpeechRecognizerNemo:
    def transcribe_with_score(self, _voice: np.ndarray) -> list[tuple[str, float]]:
        return [("しんくろみそーる", 0.5), ("です", 1.0), ("</s>", 1.0)]


class FakePostProcessorResult:
    def __init__(self, corrected_text: str, changed: bool) -> None:
        self.raw_text = "しんくろみそーるです"
        self.corrected_text = corrected_text
        self.raw_result = (("しんくろみそーる", 0.5), ("です", 1.0), ("</s>", 1.0))
        self.corrected_result = ((corrected_text, 0.5), ("</s>", 1.0))
        self.matches = ()
        self.deferred_yomi = ()
        self.changed = changed


class FakePostProcessor:
    def __init__(self) -> None:
        self.enabled = True

    def apply(self, _result: list[tuple[str, float]]) -> FakePostProcessorResult:
        return FakePostProcessorResult("Sincromisorです", changed=True)


class SpeechRecognizerNemoWorkerTest(unittest.TestCase):
    def test_recognize_applies_postprocess_only_for_confirmed(self) -> None:
        with patch(
            "speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerNemoWorker.SpeechRecognizerNemo",
            return_value=FakeSpeechRecognizerNemo(),
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
