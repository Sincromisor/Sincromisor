# ruff: noqa: PT009, PT027
import tempfile
import unittest
from pathlib import Path

from speech_recognizer_nemo.SpeechRecognizerNemo import ProperNounDictionary


class ProperNounDictionaryTest(unittest.TestCase):
    def test_normalize_yomi_converts_katakana_and_symbols(self) -> None:
        normalized = ProperNounDictionary.normalize_yomi(" シンクロミソール・ ")
        self.assertEqual(normalized, "しんくろみそーる")

    def test_load_from_csv_indexes_entries_and_promotes_ambiguity(self) -> None:
        csv_text = """surface,yomi,priority,category,enabled,ambiguous
Sincromisor, シンクロミソール ,200,product,true,false
タブンネ,たぶんね,100,pokemon,true,false
たぶんね,たぶんね,10,common,true,false
無効語,むこうご,50,common,false,false
Sincromisor,しんくろみそーる,300,product,true,false
priority-bad,ぷらいおりてぃ,abc,debug,true,false
bool-bad,ぶーる,1,debug,maybe,nope
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            csv_path = Path(temp_dir, "proper_nouns.csv")
            csv_path.write_text(csv_text, encoding="utf-8")

            dictionary = ProperNounDictionary.load_from_csv(csv_path)

        self.assertEqual(dictionary.stats.total_rows, 7)
        self.assertEqual(dictionary.stats.loaded_entries, 5)
        self.assertEqual(dictionary.stats.disabled_rows, 1)
        self.assertEqual(dictionary.stats.duplicate_rows, 1)
        self.assertEqual(dictionary.stats.ambiguous_yomi_count, 1)

        sincromisor_entries = dictionary.entries_by_yomi["しんくろみそーる"]
        self.assertEqual(len(sincromisor_entries), 1)
        self.assertEqual(sincromisor_entries[0].priority, 200)

        ambiguous_entries = dictionary.entries_by_yomi["たぶんね"]
        self.assertEqual(
            [entry.surface for entry in ambiguous_entries], ["タブンネ", "たぶんね"]
        )
        self.assertTrue(all(entry.ambiguous for entry in ambiguous_entries))

        priority_bad = dictionary.entries_by_yomi["ぷらいおりてぃ"][0]
        self.assertEqual(priority_bad.priority, 0)

        bool_bad = dictionary.entries_by_yomi["ぶーる"][0]
        self.assertTrue(bool_bad.enabled)
        self.assertFalse(bool_bad.ambiguous)

        joined_warnings = "\n".join(dictionary.warnings)
        self.assertIn("duplicated surface/yomi pair skipped", joined_warnings)
        self.assertIn("invalid priority", joined_warnings)
        self.assertIn("invalid enabled value", joined_warnings)
        self.assertIn("invalid ambiguous value", joined_warnings)
        self.assertIn("promoted all entries to ambiguous=true", joined_warnings)

    def test_load_from_csv_requires_surface_and_yomi_columns(self) -> None:
        csv_text = """surface,priority
Sincromisor,200
"""
        with tempfile.TemporaryDirectory() as temp_dir:
            csv_path = Path(temp_dir, "proper_nouns.csv")
            csv_path.write_text(csv_text, encoding="utf-8")

            with self.assertRaisesRegex(ValueError, "missing required columns"):
                ProperNounDictionary.load_from_csv(csv_path)


if __name__ == "__main__":
    unittest.main()
