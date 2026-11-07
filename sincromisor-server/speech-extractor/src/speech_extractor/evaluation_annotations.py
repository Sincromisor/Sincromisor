"""評価用WAVと事前注釈を検証し、入力サンプル位置の基準を固定する。"""

import hashlib
import io
import wave
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator


class SampleSpan(BaseModel):
    """16kHz入力の半開区間。発話内の間は音声区間に含めず注釈する。"""

    model_config = ConfigDict(extra="forbid", strict=True)
    start: int = Field(ge=0)
    end: int = Field(gt=0)

    @model_validator(mode="after")
    def validate_order(self) -> SampleSpan:
        """空区間と逆向き区間を、欠落の集計前に拒否する。"""
        if self.end <= self.start:
            raise ValueError("Span end must follow start")
        return self


class ExpectedTurn(BaseModel):
    """一回の応答まで待つべき発話。speech間の空白は話し途中の間を表す。"""

    model_config = ConfigDict(extra="forbid", strict=True)
    speech: list[SampleSpan] = Field(min_length=1)
    endpoint_sample: int = Field(ge=0)

    @model_validator(mode="after")
    def validate_speech(self) -> ExpectedTurn:
        """語尾より早い応答可能終端や、音声区間の重複を許さない。"""
        for previous, current in zip(self.speech, self.speech[1:]):
            if current.start < previous.end:
                raise ValueError("Speech spans must be ordered and disjoint")
        if self.endpoint_sample < self.speech[-1].end:
            raise ValueError("Endpoint must not precede speech end")
        return self


class EvaluationAnnotations(BaseModel):
    """録音の内容や保存先を持たず、同じWAVへの事前注釈だけを保持する。"""

    model_config = ConfigDict(extra="forbid", strict=True)
    recording_id: str = Field(min_length=1, max_length=100)
    audio_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    turns: list[ExpectedTurn]

    @model_validator(mode="after")
    def validate_turns(self) -> EvaluationAnnotations:
        """前発話の応答可能終端より前に次発話が始まる曖昧な注釈を拒否する。"""
        for previous, current in zip(self.turns, self.turns[1:]):
            if current.speech[0].start <= previous.endpoint_sample:
                raise ValueError("Turns must be ordered and separated")
        return self

    def validate_audio(self, samples: int, digest: str) -> None:
        """別録音・範囲外注釈を拒否し、入力末尾の無音不足は評価結果として残す。"""
        if self.audio_sha256 != digest:
            raise ValueError("Annotation audio checksum mismatch")
        if self.turns and self.turns[-1].endpoint_sample > samples:
            raise ValueError("Annotation exceeds audio length")


def load_audio(path: Path) -> tuple[np.ndarray, str]:
    """16kHz・mono・s16leの非圧縮WAVだけを受ける。再サンプルや末尾無音追加は行わない。"""
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    with wave.open(io.BytesIO(data), "rb") as source:
        if (
            source.getframerate(),
            source.getnchannels(),
            source.getsampwidth(),
            source.getcomptype(),
        ) != (16000, 1, 2, "NONE"):
            raise ValueError("Evaluation requires 16kHz mono signed-16-bit PCM WAV")
        expected = source.getnframes()
        data = source.readframes(expected)
    if len(data) != expected * 2:
        raise ValueError("Truncated evaluation WAV")
    return np.frombuffer(data, dtype="<i2").copy(), digest
