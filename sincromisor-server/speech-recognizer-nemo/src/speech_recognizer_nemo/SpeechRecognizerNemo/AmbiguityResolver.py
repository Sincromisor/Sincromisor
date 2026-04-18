from __future__ import annotations

from dataclasses import dataclass

from .ProperNounDictionary import ProperNounDictionaryEntry


@dataclass(frozen=True)
class AmbiguityCandidate:
    surface: str
    normalized_yomi: str
    priority: int
    category: str | None
    source_line: int
    ambiguous: bool


@dataclass(frozen=True)
class AmbiguityContextHint:
    left_surfaces: tuple[str, ...]
    right_surfaces: tuple[str, ...]


@dataclass(frozen=True)
class AmbiguityDecision:
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
        context_hint = AmbiguityContextHint(
            left_surfaces=left_surfaces,
            right_surfaces=right_surfaces,
        )
        if len(entries) == 1 and not entries[0].ambiguous:
            return AmbiguityDecision(
                apply_entry=entries[0],
                deferred=False,
                reason=None,
                candidates=(),
                context_hint=context_hint,
            )

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
