from __future__ import annotations

from dataclasses import dataclass

from .ProperNounDictionary import ProperNounDictionaryEntry


@dataclass(frozen=True)
class AmbiguityCandidate:
    """曖昧候補としてログや後段判定へ引き渡すための軽量な辞書要約。"""

    surface: str
    normalized_yomi: str
    priority: int
    category: str | None
    source_line: int
    ambiguous: bool


@dataclass(frozen=True)
class AmbiguityContextHint:
    """曖昧語の前後にあった表層形を保持し、再判定時の手掛かりに使う。"""

    left_surfaces: tuple[str, ...]
    right_surfaces: tuple[str, ...]


@dataclass(frozen=True)
class AmbiguityDecision:
    """曖昧語判定の結果を、適用可否と保留理由込みでまとめた値オブジェクト。"""

    apply_entry: ProperNounDictionaryEntry | None
    deferred: bool
    reason: str | None
    candidates: tuple[AmbiguityCandidate, ...]
    context_hint: AmbiguityContextHint


class AmbiguityResolver:
    """読みが一意でない候補を保留し、将来の文脈解決用情報をまとめる。"""

    def resolve(
        self,
        *,
        entries: tuple[ProperNounDictionaryEntry, ...],
        left_surfaces: tuple[str, ...],
        right_surfaces: tuple[str, ...],
    ) -> AmbiguityDecision:
        # 現段階では前後文脈から即断せず、後段の context biasing / N-best 再評価で
        # 参照できるよう前後の表層形だけをヒントとして保存する。
        context_hint = AmbiguityContextHint(
            left_surfaces=left_surfaces,
            right_surfaces=right_surfaces,
        )
        if len(entries) == 1 and not entries[0].ambiguous:
            # 候補が一意で、かつ辞書側でも曖昧扱いされていなければ即時適用してよい。
            return AmbiguityDecision(
                apply_entry=entries[0],
                deferred=False,
                reason=None,
                candidates=(),
                context_hint=context_hint,
            )

        # 複数候補、または辞書側で意図的に ambiguous 指定された語はここでは確定させない。
        # 候補一覧と保留理由を trace に残し、後続の再デコード比較に委ねる。
        return AmbiguityDecision(
            apply_entry=None,
            deferred=bool(entries),
            reason=self._deferred_reason(entries),
            candidates=tuple(
                AmbiguityCandidate(
                    surface=entry.surface,
                    normalized_yomi=entry.normalized_yomi,
                    priority=entry.priority,
                    category=entry.category,
                    source_line=entry.source_line,
                    ambiguous=entry.ambiguous,
                )
                for entry in entries
            ),
            context_hint=context_hint,
        )

    @staticmethod
    def _deferred_reason(entries: tuple[ProperNounDictionaryEntry, ...]) -> str | None:
        """保留の主因を分類し、ログや trace から判断経路を追えるようにする。"""
        if not entries:
            return None
        if len(entries) == 1:
            return "entry_marked_ambiguous"
        top_priority = max(entry.priority for entry in entries)
        top_priority_count = sum(
            1 for entry in entries if entry.priority == top_priority
        )
        if top_priority_count > 1:
            return "multiple_top_priority_candidates"
        return "multiple_candidates_for_same_yomi"
