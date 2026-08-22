"""Go producer payload と既存 Pydantic ``from_msgpack`` の互換性を検証する。"""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
from sincro_models import (
    ChatHistory,
    ChatMessage,
    SpeechExtractorInitializeRequest,
    SpeechExtractorResult,
    TextProcessorRequest,
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[3]
GO_MODULE = REPOSITORY_ROOT / "sincromisor-server" / "sincro-rtc"
GO_HELPER = "./internal/pipeline/protocol/testdata/generate_go_payloads.go"


def test_go_payloads_decode_with_existing_pydantic_models() -> None:
    """固定 module cwd で Go helper を実行し、3 producer 方向を production decoder で読む。"""
    with tempfile.TemporaryDirectory(prefix="sincro-go-payloads-") as temporary:
        output_dir = Path(temporary)
        environment = os.environ.copy()
        environment["GOCACHE"] = str(output_dir / "go-build-cache")
        subprocess.run(
            ["go", "run", GO_HELPER, "--output-dir", str(output_dir)],
            cwd=GO_MODULE,
            env=environment,
            check=True,
        )

        initialize = SpeechExtractorInitializeRequest.from_msgpack(
            (output_dir / "extractor_initialize.msgpack").read_bytes(),
        )
        assert initialize == SpeechExtractorInitializeRequest(
            session_id="fixture-session",
            start_at=1_700_000_000.125,
            voice_sampling_rate=16_000,
            voice_sample_bytes=2,
            voice_channels=1,
        )

        extractor = SpeechExtractorResult.from_msgpack(
            (output_dir / "extractor_result.msgpack").read_bytes(),
        )
        assert extractor.session_id == "fixture-session"
        assert extractor.speech_id == 42
        assert extractor.sequence_id == 7
        assert extractor.start_at == 1_700_000_000.5
        assert extractor.confirmed is True
        assert np.array_equal(
            extractor.voice,
            np.array([-32768, -1, 0, 1, 32767], dtype=np.int16),
        )

        request = TextProcessorRequest.from_msgpack(
            (output_dir / "text_processor_request.msgpack").read_bytes(),
        )
        expected_message = ChatMessage(
            speech_id=42,
            message_id="01J00000000000000000000001",
            message_type="user",
            speaker_id="fixture-user",
            speaker_name="利用者",
            expression_code=None,
            message="固定された認識文",
            created_at=1_700_000_001.25,
        )
        assert request == TextProcessorRequest(
            session_id="fixture-session",
            sequence_id=7,
            confirmed=True,
            history=ChatHistory(messages=[expected_message]),
            request_message=expected_message,
        )
