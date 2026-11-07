"""実際の差分PCM送信区間を事前注釈と照合する。未確定は遅延0へ変換しない。"""

from dataclasses import dataclass, field

from .evaluation_annotations import EvaluationAnnotations, ExpectedTurn, SampleSpan


@dataclass(frozen=True)
class Emission:
    """入力PCM上の送信区間と、その送信時点の確定状態。endは処理済み入力位置でもある。"""

    start: int
    end: int
    confirmed: bool


@dataclass
class EvaluationRun:
    """逐次評価の記録。compute_msは実時間の処理量であり本番の待ち行列を含まない。"""

    emissions: list[Emission] = field(default_factory=list)
    processed_samples: int = 0
    compute_ms: float = 0
    turn_inferences: int = 0


def _covered(span: SampleSpan, emissions: list[Emission]) -> list[tuple[int, int]]:
    """送信区間の和集合と音声区間の交差を返し、再送があっても欠落を二重計算しない。"""
    merged: list[tuple[int, int]] = []
    for item in sorted(emissions, key=lambda value: value.start):
        start, end = max(span.start, item.start), min(span.end, item.end)
        if start >= end:
            continue
        if merged and start <= merged[-1][1]:
            merged[-1] = merged[-1][0], max(merged[-1][1], end)
        else:
            merged.append((start, end))
    return merged


def _missing(turn: ExpectedTurn, emissions: list[Emission]) -> dict[str, int]:
    """実音声区間全体の欠落と、最初・最後の区間端での欠落をサンプル数で返す。"""
    coverage = [_covered(span, emissions) for span in turn.speech]
    first, last = turn.speech[0], turn.speech[-1]
    missing = sum(
        span.end - span.start - sum(end - start for start, end in parts)
        for span, parts in zip(turn.speech, coverage, strict=True)
    )
    return {
        "missing_speech_samples": missing,
        "leading_missing_samples": (coverage[0][0][0] if coverage[0] else first.end)
        - first.start,
        "trailing_missing_samples": last.end
        - (coverage[-1][-1][1] if coverage[-1] else last.start),
    }


def summarize(
    run: EvaluationRun, annotations: EvaluationAnnotations
) -> dict[str, object]:
    """終端は次発話開始より前まで照合する。途中確定・未確定・欠落を別々に報告する。"""
    confirmations = [item.end for item in run.emissions if item.confirmed]
    turns: list[dict[str, object]] = []
    assigned: set[int] = set()
    premature_count = 0
    unconfirmed_count = 0
    for index, turn in enumerate(annotations.turns):
        next_start = (
            annotations.turns[index + 1].speech[0].start
            if index + 1 < len(annotations.turns)
            else float("inf")
        )
        premature = [
            sample
            for sample in confirmations
            if turn.speech[0].start <= sample < turn.endpoint_sample
        ]
        finals = [
            sample
            for sample in confirmations
            if turn.endpoint_sample <= sample < next_start
        ]
        assigned.update(premature + finals[:1])
        final = finals[0] if finals else None
        premature_count += len(premature)
        unconfirmed_count += final is None
        turns.append(
            {
                "turn_index": index,
                "premature_confirmations": len(premature),
                "incomplete_pause_confirmations": sum(
                    previous.end <= sample < current.start
                    for sample in premature
                    for previous, current in zip(turn.speech, turn.speech[1:])
                ),
                "confirmed_sample": final,
                "endpoint_audio_latency_ms": None
                if final is None
                else (final - turn.endpoint_sample) / 16,
                **_missing(turn, run.emissions),
            }
        )
    return {
        "processed_samples": run.processed_samples,
        "compute_ms": run.compute_ms,
        "turn_inferences": run.turn_inferences,
        "premature_confirmations": premature_count,
        "unconfirmed_turns": unconfirmed_count,
        "unexpected_confirmations": sum(
            sample not in assigned for sample in confirmations
        ),
        "turns": turns,
    }
