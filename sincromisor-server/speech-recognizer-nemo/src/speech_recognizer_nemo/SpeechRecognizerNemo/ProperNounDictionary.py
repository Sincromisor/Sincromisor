import csv
import logging
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, replace
from pathlib import Path
from typing import ClassVar


@dataclass(frozen=True)
class ProperNounDictionaryEntry:
    surface: str
    yomi: str
    normalized_yomi: str
    priority: int
    category: str | None
    enabled: bool
    ambiguous: bool
    source_line: int


@dataclass(frozen=True)
class ProperNounDictionaryStats:
    total_rows: int = 0
    loaded_entries: int = 0
    disabled_rows: int = 0
    skipped_rows: int = 0
    duplicate_rows: int = 0
    warning_count: int = 0
    ambiguous_yomi_count: int = 0


@dataclass(frozen=True)
class ProperNounDictionary:
    entries: tuple[ProperNounDictionaryEntry, ...]
    entries_by_yomi: dict[str, tuple[ProperNounDictionaryEntry, ...]]
    stats: ProperNounDictionaryStats
    warnings: tuple[str, ...]
    source_path: Path | None = None

    REQUIRED_COLUMNS: ClassVar[set[str]] = {"surface", "yomi"}
    OPTIONAL_COLUMNS: ClassVar[set[str]] = {
        "priority",
        "category",
        "enabled",
        "ambiguous",
    }
    _YOMI_DASH_TRANSLATION: ClassVar[dict[int, str]] = str.maketrans(
        {
            "ｰ": "ー",
            "−": "ー",
            "－": "ー",
            "―": "ー",
            "‐": "ー",
            "-": "ー",
        }
    )

    @classmethod
    def empty(cls) -> "ProperNounDictionary":
        return cls(
            entries=(),
            entries_by_yomi={},
            stats=ProperNounDictionaryStats(),
            warnings=(),
            source_path=None,
        )

    @classmethod
    def load_from_csv(cls, csv_path: str | Path) -> "ProperNounDictionary":
        source_path = Path(csv_path)
        with source_path.open(encoding="utf-8", newline="") as csv_file:
            reader = csv.DictReader(csv_file)
            fieldnames = reader.fieldnames or []
            missing_columns = cls.REQUIRED_COLUMNS - set(fieldnames)
            if missing_columns:
                missing_columns_text = ", ".join(sorted(missing_columns))
                raise ValueError(
                    f"Proper noun dictionary is missing required columns: {missing_columns_text}",
                )

            warnings: list[str] = []
            stats = ProperNounDictionaryStats()
            enabled_entries: list[ProperNounDictionaryEntry] = []
            seen_pairs: set[tuple[str, str]] = set()

            for line_no, row in enumerate(reader, start=2):
                stats = replace(stats, total_rows=stats.total_rows + 1)
                entry = cls._parse_row(row=row, line_no=line_no, warnings=warnings)
                if entry is None:
                    stats = replace(stats, skipped_rows=stats.skipped_rows + 1)
                    continue
                if not entry.enabled:
                    stats = replace(stats, disabled_rows=stats.disabled_rows + 1)
                    continue

                entry_key = (entry.surface, entry.normalized_yomi)
                if entry_key in seen_pairs:
                    warnings.append(
                        f"line {line_no}: duplicated surface/yomi pair skipped: "
                        f"surface={entry.surface!r}, yomi={entry.yomi!r}",
                    )
                    stats = replace(
                        stats,
                        skipped_rows=stats.skipped_rows + 1,
                        duplicate_rows=stats.duplicate_rows + 1,
                    )
                    continue

                seen_pairs.add(entry_key)
                enabled_entries.append(entry)

            entries_by_yomi_lists: dict[str, list[ProperNounDictionaryEntry]] = (
                defaultdict(list)
            )
            for entry in enabled_entries:
                entries_by_yomi_lists[entry.normalized_yomi].append(entry)

            ambiguous_yomi_count = 0
            normalized_index: dict[str, tuple[ProperNounDictionaryEntry, ...]] = {}
            normalized_entries: list[ProperNounDictionaryEntry] = []

            for normalized_yomi, yomi_entries in entries_by_yomi_lists.items():
                unique_surfaces = {entry.surface for entry in yomi_entries}
                promoted_entries = yomi_entries

                if len(unique_surfaces) > 1:
                    # 同じ読みで複数候補がある語は、後続段で安全に扱えるよう常に曖昧語へ昇格する。
                    ambiguous_yomi_count += 1
                    if not all(entry.ambiguous for entry in yomi_entries):
                        warnings.append(
                            f"normalized_yomi={normalized_yomi!r} has multiple surfaces; "
                            "promoted all entries to ambiguous=true",
                        )
                    promoted_entries = [
                        replace(entry, ambiguous=True) for entry in yomi_entries
                    ]

                    highest_priority = max(entry.priority for entry in promoted_entries)
                    highest_priority_entries = [
                        entry
                        for entry in promoted_entries
                        if entry.priority == highest_priority
                    ]
                    if len(highest_priority_entries) > 1:
                        warnings.append(
                            f"normalized_yomi={normalized_yomi!r} has multiple top-priority "
                            "candidates; automatic resolution will stay ambiguous",
                        )

                sorted_entries = tuple(
                    sorted(
                        promoted_entries,
                        key=lambda entry: (-entry.priority, entry.surface),
                    )
                )
                normalized_index[normalized_yomi] = sorted_entries
                normalized_entries.extend(sorted_entries)

            stats = replace(
                stats,
                loaded_entries=len(normalized_entries),
                warning_count=len(warnings),
                ambiguous_yomi_count=ambiguous_yomi_count,
            )
            return cls(
                entries=tuple(normalized_entries),
                entries_by_yomi=normalized_index,
                stats=stats,
                warnings=tuple(warnings),
                source_path=source_path,
            )

    @classmethod
    def load_from_csv_with_logger(
        cls,
        csv_path: str | Path,
        logger: logging.Logger,
    ) -> "ProperNounDictionary":
        dictionary = cls.load_from_csv(csv_path=csv_path)
        for warning_message in dictionary.warnings:
            logger.warning("Proper noun dictionary: %s", warning_message)
        logger.info(
            "Proper noun dictionary loaded: path=%s rows=%d enabled=%d disabled=%d "
            "skipped=%d warnings=%d ambiguous_yomi=%d",
            dictionary.source_path,
            dictionary.stats.total_rows,
            dictionary.stats.loaded_entries,
            dictionary.stats.disabled_rows,
            dictionary.stats.skipped_rows,
            dictionary.stats.warning_count,
            dictionary.stats.ambiguous_yomi_count,
        )
        return dictionary

    @classmethod
    def normalize_yomi(cls, yomi: str) -> str:
        # 辞書比較キーは、記述揺れよりも照合安定性を優先したひらがなベースの形に寄せる。
        normalized = unicodedata.normalize("NFKC", yomi).strip()
        normalized = "".join(normalized.split())
        normalized = normalized.translate(cls._YOMI_DASH_TRANSLATION)
        normalized = cls._katakana_to_hiragana(normalized)

        kept_chars: list[str] = []
        for char in normalized:
            category = unicodedata.category(char)
            if char in {"ー", "ゔ"} or "ぁ" <= char <= "ゖ":
                kept_chars.append(char)
                continue
            if category.startswith(("P", "S")):
                continue
            kept_chars.append(char)
        return "".join(kept_chars)

    def surfaces_for_biasing(self) -> tuple[str, ...]:
        """Build a stable key phrase list from dictionary surfaces."""
        seen_surfaces: set[str] = set()
        ordered_surfaces: list[str] = []
        for entry in self.entries:
            if entry.surface in seen_surfaces:
                continue
            seen_surfaces.add(entry.surface)
            ordered_surfaces.append(entry.surface)
        return tuple(ordered_surfaces)

    @classmethod
    def _parse_row(
        cls,
        *,
        row: dict[str, str | None],
        line_no: int,
        warnings: list[str],
    ) -> ProperNounDictionaryEntry | None:
        surface = (row.get("surface") or "").strip()
        yomi = (row.get("yomi") or "").strip()

        if not surface:
            warnings.append(f"line {line_no}: surface is empty")
            return None
        if not yomi:
            warnings.append(f"line {line_no}: yomi is empty")
            return None

        normalized_yomi = cls.normalize_yomi(yomi)
        if not normalized_yomi:
            warnings.append(f"line {line_no}: normalized yomi is empty")
            return None
        if not cls._is_supported_yomi(normalized_yomi):
            warnings.append(
                f"line {line_no}: yomi contains non-hiragana characters after normalization: "
                f"yomi={yomi!r}, normalized={normalized_yomi!r}",
            )

        priority_text = (row.get("priority") or "").strip()
        priority = cls._parse_priority(
            priority_text=priority_text,
            line_no=line_no,
            warnings=warnings,
        )

        enabled = cls._parse_bool(
            value=row.get("enabled"),
            default=True,
            field_name="enabled",
            line_no=line_no,
            warnings=warnings,
        )
        ambiguous = cls._parse_bool(
            value=row.get("ambiguous"),
            default=False,
            field_name="ambiguous",
            line_no=line_no,
            warnings=warnings,
        )

        category_text = (row.get("category") or "").strip()
        category = category_text or None

        return ProperNounDictionaryEntry(
            surface=surface,
            yomi=yomi,
            normalized_yomi=normalized_yomi,
            priority=priority,
            category=category,
            enabled=enabled,
            ambiguous=ambiguous,
            source_line=line_no,
        )

    @staticmethod
    def _parse_priority(
        *,
        priority_text: str,
        line_no: int,
        warnings: list[str],
    ) -> int:
        if not priority_text:
            return 0
        try:
            return int(priority_text)
        except ValueError:
            warnings.append(
                f"line {line_no}: invalid priority {priority_text!r}; using 0",
            )
            return 0

    @staticmethod
    def _parse_bool(
        *,
        value: str | None,
        default: bool,
        field_name: str,
        line_no: int,
        warnings: list[str],
    ) -> bool:
        if value is None:
            return default

        normalized = value.strip().lower()
        if not normalized:
            return default
        if normalized in {"true", "1", "yes", "on"}:
            return True
        if normalized in {"false", "0", "no", "off"}:
            return False

        warnings.append(
            f"line {line_no}: invalid {field_name} value {value!r}; using {default}",
        )
        return default

    @staticmethod
    def _katakana_to_hiragana(text: str) -> str:
        chars: list[str] = []
        for char in text:
            code = ord(char)
            if 0x30A1 <= code <= 0x30F6:
                chars.append(chr(code - 0x60))
                continue
            chars.append(char)
        return "".join(chars)

    @staticmethod
    def _is_supported_yomi(text: str) -> bool:
        return all(
            char == "ー" or char == "ゔ" or "ぁ" <= char <= "ゖ" for char in text
        )
