from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .ProperNounDictionary import ProperNounDictionary, ProperNounDictionaryEntry

try:
    from sudachipy import Dictionary, SplitMode
except ImportError:  # pragma: no cover - dependency availability is verified in runtime env.
    Dictionary = None
    SplitMode = None


@dataclass(frozen=True)
class RecognizerPostProcessorMatch:
    surface_before: str
    surface_after: str
    normalized_yomi: str
    start_index: int
    end_index: int
    source_line: int


@dataclass(frozen=True)
class RecognizerPostProcessorResult:
    raw_text: str
    corrected_text: str
    raw_result: tuple[tuple[str, float], ...]
    corrected_result: tuple[tuple[str, float], ...]
    matches: tuple[RecognizerPostProcessorMatch, ...]
    deferred_yomi: tuple[str, ...]

    @property
    def changed(self) -> bool:
        return self.raw_text != self.corrected_text


@dataclass(frozen=True)
class _AnalyzedMorpheme:
    surface: str
    normalized_yomi: str
    pos0: str


@dataclass(frozen=True)
class _MatchCandidate:
    entry: ProperNounDictionaryEntry
    end_index: int


class RecognizerPostProcessor:
    def __init__(
        self,
        proper_noun_dictionary: ProperNounDictionary,
        tokenizer: Any | None = None,
    ) -> None:
        self.proper_noun_dictionary = proper_noun_dictionary
        self.tokenizer = tokenizer if tokenizer is not None else self._create_tokenizer()
        self.split_mode = getattr(SplitMode, "C", None)

    @property
    def enabled(self) -> bool:
        return self.tokenizer is not None and bool(self.proper_noun_dictionary.entries)

    def apply(
        self,
        result: list[tuple[str, float]] | tuple[tuple[str, float], ...],
    ) -> RecognizerPostProcessorResult:
        raw_result = tuple(result)
        raw_text = self._result_text(raw_result)
        if not self.enabled or not raw_text:
            return RecognizerPostProcessorResult(
                raw_text=raw_text,
                corrected_text=raw_text,
                raw_result=raw_result,
                corrected_result=raw_result,
                matches=(),
                deferred_yomi=(),
            )

        morphemes = self._analyze_text(raw_text)
        if not morphemes:
            return RecognizerPostProcessorResult(
                raw_text=raw_text,
                corrected_text=raw_text,
                raw_result=raw_result,
                corrected_result=raw_result,
                matches=(),
                deferred_yomi=(),
            )

        corrected_parts: list[str] = []
        matches: list[RecognizerPostProcessorMatch] = []
        deferred_yomi: set[str] = set()
        index = 0
        while index < len(morphemes):
            match = self._find_longest_match(
                morphemes=morphemes,
                start_index=index,
                deferred_yomi=deferred_yomi,
            )
            if match is None:
                corrected_parts.append(morphemes[index].surface)
                index += 1
                continue

            original_surface = "".join(
                morpheme.surface for morpheme in morphemes[index : match.end_index]
            )
            corrected_parts.append(match.entry.surface)
            matches.append(
                RecognizerPostProcessorMatch(
                    surface_before=original_surface,
                    surface_after=match.entry.surface,
                    normalized_yomi=match.entry.normalized_yomi,
                    start_index=index,
                    end_index=match.end_index,
                    source_line=match.entry.source_line,
                )
            )
            index = match.end_index

        corrected_text = "".join(corrected_parts)
        corrected_result = self._build_corrected_result(
            corrected_text=corrected_text,
            raw_result=raw_result,
        )
        return RecognizerPostProcessorResult(
            raw_text=raw_text,
            corrected_text=corrected_text,
            raw_result=raw_result,
            corrected_result=corrected_result,
            matches=tuple(matches),
            deferred_yomi=tuple(sorted(deferred_yomi)),
        )

    def _create_tokenizer(self) -> Any | None:
        if Dictionary is None:
            return None
        return Dictionary(dict="full").create()

    def _analyze_text(self, text: str) -> list[_AnalyzedMorpheme]:
        tokenized = self.tokenizer.tokenize(text, self.split_mode)
        return [
            _AnalyzedMorpheme(
                surface=morpheme.surface(),
                normalized_yomi=ProperNounDictionary.normalize_yomi(
                    self._morpheme_reading(morpheme),
                ),
                pos0=self._morpheme_pos0(morpheme),
            )
            for morpheme in tokenized
        ]

    def _find_longest_match(
        self,
        *,
        morphemes: list[_AnalyzedMorpheme],
        start_index: int,
        deferred_yomi: set[str],
    ) -> _MatchCandidate | None:
        first = morphemes[start_index]
        if not first.normalized_yomi or first.pos0 == "補助記号":
            return None

        current_yomi = ""
        best_match: _MatchCandidate | None = None
        for current_index in range(start_index, len(morphemes)):
            current = morphemes[current_index]
            if not current.normalized_yomi or current.pos0 == "補助記号":
                break

            current_yomi += current.normalized_yomi
            entries = self.proper_noun_dictionary.entries_by_yomi.get(current_yomi, ())
            if not entries:
                continue
            if len(entries) == 1 and not entries[0].ambiguous:
                best_match = _MatchCandidate(
                    entry=entries[0],
                    end_index=current_index + 1,
                )
                continue
            deferred_yomi.add(current_yomi)
        return best_match

    @staticmethod
    def _result_text(result: tuple[tuple[str, float], ...]) -> str:
        return "".join(text for text, _score in result if text != "</s>")

    @staticmethod
    def _build_corrected_result(
        *,
        corrected_text: str,
        raw_result: tuple[tuple[str, float], ...],
    ) -> tuple[tuple[str, float], ...]:
        raw_text = RecognizerPostProcessor._result_text(raw_result)
        if corrected_text == raw_text:
            return raw_result

        raw_scores = [score for text, score in raw_result if text != "</s>"]
        corrected_score = min(raw_scores) if raw_scores else 1.0
        corrected_result: list[tuple[str, float]] = []
        if corrected_text:
            corrected_result.append((corrected_text, corrected_score))
        corrected_result.extend(
            (text, score) for text, score in raw_result if text == "</s>"
        )
        return tuple(corrected_result)

    @staticmethod
    def _morpheme_reading(morpheme: Any) -> str:
        reading = morpheme.reading_form()
        if not reading or reading == "*":
            return morpheme.surface()
        return reading

    @staticmethod
    def _morpheme_pos0(morpheme: Any) -> str:
        pos = morpheme.part_of_speech()
        if not pos:
            return ""
        return pos[0]
