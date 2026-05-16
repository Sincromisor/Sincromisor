from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .AmbiguityResolver import (
    AmbiguityCandidate,
    AmbiguityContextHint,
    AmbiguityResolver,
)
from .ProperNounDictionary import ProperNounDictionary, ProperNounDictionaryEntry

try:
    from sudachipy import Dictionary as _SudachiDictionary
    from sudachipy import SplitMode as _SudachiSplitMode
except (
    ImportError
):  # pragma: no cover - dependency availability is verified in runtime env.
    SudachiDictionary: Any | None = None
    SudachiSplitMode: Any | None = None
else:
    SudachiDictionary = _SudachiDictionary
    SudachiSplitMode = _SudachiSplitMode


@dataclass(frozen=True)
class RecognizerPostProcessorMatch:
    """辞書補正で採用した置換内容を trace しやすい形で保持する。"""

    surface_before: str
    surface_after: str
    normalized_yomi: str
    start_index: int
    end_index: int
    source_line: int


@dataclass(frozen=True)
class RecognizerPostProcessorResult:
    """後処理前後の結果と、保留候補の痕跡をまとめた返り値。"""

    raw_text: str
    corrected_text: str
    raw_result: tuple[tuple[str, float], ...]
    corrected_result: tuple[tuple[str, float], ...]
    matches: tuple[RecognizerPostProcessorMatch, ...]
    deferred_yomi: tuple[str, ...]
    deferred_matches: tuple[RecognizerPostProcessorDeferredMatch, ...]

    @property
    def changed(self) -> bool:
        """呼び出し側が補正有無だけを簡単に判定できるようにする。"""
        return self.raw_text != self.corrected_text


@dataclass(frozen=True)
class _AnalyzedMorpheme:
    """Sudachi 解析結果のうち、照合に必要な最小情報だけを抜き出したもの。"""

    surface: str
    normalized_yomi: str
    pos0: str


@dataclass(frozen=True)
class _MatchCandidate:
    """開始位置から見つかった最長一致候補。"""

    entry: ProperNounDictionaryEntry
    end_index: int


@dataclass(frozen=True)
class RecognizerPostProcessorDeferredMatch:
    """この段階では確定できず、後段へ持ち越した曖昧語候補。"""

    normalized_yomi: str
    start_index: int
    end_index: int
    reason: str
    candidates: tuple[AmbiguityCandidate, ...]
    context_hint: AmbiguityContextHint


class RecognizerPostProcessor:
    """認識テキストを形態素単位で走査し、固有名詞辞書に基づく補正を行う。"""

    def __init__(
        self,
        proper_noun_dictionary: ProperNounDictionary,
        tokenizer: Any | None = None,
    ) -> None:
        # tokenizer を外から差し替えられるようにして、テストでは Sudachi 依存を弱める。
        self.proper_noun_dictionary = proper_noun_dictionary
        self.tokenizer = (
            tokenizer if tokenizer is not None else self._create_tokenizer()
        )
        self.split_mode = getattr(SudachiSplitMode, "C", None)
        self.ambiguity_resolver = AmbiguityResolver()

    @property
    def enabled(self) -> bool:
        """辞書と tokenizer の両方が揃ったときだけ後処理を有効化する。"""
        return self.tokenizer is not None and bool(self.proper_noun_dictionary.entries)

    def apply(
        self,
        result: list[tuple[str, float]] | tuple[tuple[str, float], ...],
    ) -> RecognizerPostProcessorResult:
        """N-best 形式の結果を受け取り、辞書補正後の結果と trace を返す。"""
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
                deferred_matches=(),
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
                deferred_matches=(),
            )

        corrected_parts: list[str] = []
        matches: list[RecognizerPostProcessorMatch] = []
        deferred_yomi: set[str] = set()
        deferred_matches: list[RecognizerPostProcessorDeferredMatch] = []
        index = 0
        while index < len(morphemes):
            # 各開始位置で最長一致を探し、見つからなければ元の形態素をそのまま残す。
            match = self._find_longest_match(
                morphemes=morphemes,
                start_index=index,
                deferred_yomi=deferred_yomi,
                deferred_matches=deferred_matches,
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
            deferred_matches=tuple(deferred_matches),
        )

    def _create_tokenizer(self) -> Any | None:
        """Sudachi が利用可能な環境では full 辞書で tokenizer を生成する。"""
        if SudachiDictionary is None:
            return None
        return SudachiDictionary(dict="full").create()

    def _analyze_text(self, text: str) -> list[_AnalyzedMorpheme]:
        """認識テキストを、辞書照合に必要な読み付き形態素列へ変換する。"""
        tokenizer = self.tokenizer
        if tokenizer is None:
            return []
        tokenized = tokenizer.tokenize(text, self.split_mode)
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
        deferred_matches: list[RecognizerPostProcessorDeferredMatch],
    ) -> _MatchCandidate | None:
        """開始位置から連続する読みを伸ばし、辞書の最長一致候補を探す。"""
        first = morphemes[start_index]
        if not first.normalized_yomi or first.pos0 == "補助記号":
            return None

        current_yomi = ""
        best_match: _MatchCandidate | None = None
        for current_index in range(start_index, len(morphemes)):
            current = morphemes[current_index]
            if not current.normalized_yomi or current.pos0 == "補助記号":
                break

            # 形態素を1つずつ足しながら読みを連結し、複合語も辞書照合できるようにする。
            current_yomi += current.normalized_yomi
            entries = self.proper_noun_dictionary.entries_by_yomi.get(current_yomi, ())
            if not entries:
                continue
            decision = self.ambiguity_resolver.resolve(
                entries=entries,
                left_surfaces=self._context_surfaces(
                    morphemes=morphemes,
                    start=max(0, start_index - 2),
                    end=start_index,
                ),
                right_surfaces=self._context_surfaces(
                    morphemes=morphemes,
                    start=current_index + 1,
                    end=min(len(morphemes), current_index + 3),
                ),
            )
            if decision.apply_entry is not None:
                # 一意に確定したものだけを最長一致候補として更新する。
                best_match = _MatchCandidate(
                    entry=decision.apply_entry,
                    end_index=current_index + 1,
                )
                continue
            if decision.deferred:
                # 曖昧な候補はここでは置換せず、後段の再デコード比較の材料に残す。
                deferred_yomi.add(current_yomi)
                deferred_matches.append(
                    RecognizerPostProcessorDeferredMatch(
                        normalized_yomi=current_yomi,
                        start_index=start_index,
                        end_index=current_index + 1,
                        reason=decision.reason or "ambiguous_candidate",
                        candidates=decision.candidates,
                        context_hint=decision.context_hint,
                    )
                )
        return best_match

    @staticmethod
    def _context_surfaces(
        *,
        morphemes: list[_AnalyzedMorpheme],
        start: int,
        end: int,
    ) -> tuple[str, ...]:
        """補助記号を除いた前後コンテキストだけを取り出す。"""
        return tuple(
            morpheme.surface
            for morpheme in morphemes[start:end]
            if morpheme.pos0 != "補助記号"
        )

    @staticmethod
    def _result_text(result: tuple[tuple[str, float], ...]) -> str:
        """`</s>` を除いた可視テキスト部分を結合する。"""
        return "".join(text for text, _score in result if text != "</s>")

    @staticmethod
    def _build_corrected_result(
        *,
        corrected_text: str,
        raw_result: tuple[tuple[str, float], ...],
    ) -> tuple[tuple[str, float], ...]:
        """補正後の文字列を、既存の result 形式へ戻す。"""
        raw_text = RecognizerPostProcessor._result_text(raw_result)
        if corrected_text == raw_text:
            return raw_result

        # 補正後は token 単位のスコアを再計算できないため、既存候補の最低 score を代表値として使う。
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
        """読みが未定義な形態素は、表層形をそのまま読みとして扱う。"""
        reading = morpheme.reading_form()
        if not reading or reading == "*":
            return morpheme.surface()
        return reading

    @staticmethod
    def _morpheme_pos0(morpheme: Any) -> str:
        """品詞の大分類だけを見て、補助記号の除外判定に使う。"""
        pos = morpheme.part_of_speech()
        if not pos:
            return ""
        return pos[0]
