# ruff: noqa: PT009, PT027
import logging
import unittest
from pathlib import Path

from speech_recognizer_nemo.SpeechRecognizerNemo import (
    ProperNounDictionary,
    RecognizerPostProcessor,
)


class FakeMorpheme:
    def __init__(
        self,
        surface: str,
        reading: str,
        pos0: str = "名詞",
    ) -> None:
        self._surface = surface
        self._reading = reading
        self._pos0 = pos0

    def surface(self) -> str:
        return self._surface

    def reading_form(self) -> str:
        return self._reading

    def part_of_speech(self) -> list[str]:
        return [self._pos0]


class FakeTokenizer:
    def __init__(self, mapping: dict[str, list[FakeMorpheme]]) -> None:
        self.mapping = mapping

    def tokenize(self, text: str, _split_mode: object = None) -> list[FakeMorpheme]:
        return self.mapping[text]


class RecognizerPostProcessorTest(unittest.TestCase):
    def setUp(self) -> None:
        fixture_path = Path(__file__).with_name("fixtures") / "proper_nouns.csv"
        self.dictionary = ProperNounDictionary.load_from_csv_with_logger(
            csv_path=fixture_path,
            logger=logging.getLogger("test"),
        )

    def test_apply_replaces_unique_yomi_match_on_morpheme_boundaries(self) -> None:
        tokenizer = FakeTokenizer(
            {
                "しんくろみそーるが好きです": [
                    FakeMorpheme("しんくろ", "シンクロ"),
                    FakeMorpheme("みそーる", "ミソール"),
                    FakeMorpheme("が", "ガ", pos0="助詞"),
                    FakeMorpheme("好き", "スキ"),
                    FakeMorpheme("です", "デス", pos0="助動詞"),
                ],
            }
        )
        processor = RecognizerPostProcessor(self.dictionary, tokenizer=tokenizer)

        result = processor.apply(
            [("しんくろみそーる", 0.9), ("が", 1.0), ("好き", 0.8), ("です", 1.0)]
        )

        self.assertEqual(result.raw_text, "しんくろみそーるが好きです")
        self.assertEqual(result.corrected_text, "Sincromisorが好きです")
        self.assertTrue(result.changed)
        self.assertEqual(result.corrected_result[0][0], "Sincromisorが好きです")
        self.assertEqual(len(result.matches), 1)
        self.assertEqual(result.matches[0].surface_after, "Sincromisor")

    def test_apply_does_not_replace_non_boundary_partial_match(self) -> None:
        tokenizer = FakeTokenizer(
            {
                "しんくろみそーるっぽい": [
                    FakeMorpheme("しんくろみそーるっぽい", "シンクロミソールッポイ"),
                ],
            }
        )
        processor = RecognizerPostProcessor(self.dictionary, tokenizer=tokenizer)

        result = processor.apply([("しんくろみそーるっぽい", 0.9)])

        self.assertEqual(result.corrected_text, "しんくろみそーるっぽい")
        self.assertFalse(result.changed)
        self.assertEqual(result.matches, ())

    def test_apply_defers_ambiguous_yomi(self) -> None:
        tokenizer = FakeTokenizer(
            {
                "たぶんね": [
                    FakeMorpheme("たぶん", "タブン"),
                    FakeMorpheme("ね", "ネ", pos0="助詞"),
                ],
            }
        )
        processor = RecognizerPostProcessor(self.dictionary, tokenizer=tokenizer)

        result = processor.apply([("たぶんね", 0.9)])

        self.assertEqual(result.corrected_text, "たぶんね")
        self.assertFalse(result.changed)
        self.assertEqual(result.matches, ())
        self.assertEqual(result.deferred_yomi, ("たぶんね",))
