"""既存 sincro_models から決定的な MessagePack compatibility fixture を生成する。"""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from pathlib import Path

import numpy as np
from sincro_models import (
    ChatHistory,
    ChatMessage,
    SpeechExtractorInitializeRequest,
    SpeechExtractorResult,
    SpeechRecognizerResult,
    TextProcessorRequest,
    TextProcessorResult,
    VoiceSynthesizerMora,
    VoiceSynthesizerResult,
    VoiceVoxQuery,
)

FIXTURE_METADATA = {
    "extractor_initialize.msgpack": {
        "producer": "Go RTC pipeline",
        "consumer": "SpeechExtractor",
        "wire_direction": "Go -> Python",
        "major_fields": ["session_id", "start_at", "voice_sampling_rate"],
    },
    "extractor_result.msgpack": {
        "producer": "SpeechExtractor",
        "consumer": "Go RTC pipeline",
        "wire_direction": "Python -> Go",
        "major_fields": ["speech_id", "confirmed", "voice"],
    },
    "recognizer_result.msgpack": {
        "producer": "SpeechRecognizer",
        "consumer": "Go RTC pipeline",
        "wire_direction": "Python -> Go",
        "major_fields": ["speech_id", "confirmed", "result"],
    },
    "text_processor_request.msgpack": {
        "producer": "Go RTC pipeline",
        "consumer": "TextProcessor",
        "wire_direction": "Go -> Python",
        "major_fields": ["history", "request_message", "confirmed"],
    },
    "text_processor_result.msgpack": {
        "producer": "TextProcessor",
        "consumer": "Go RTC pipeline / VoiceSynthesizer",
        "wire_direction": "Python -> Go -> Python unchanged",
        "major_fields": ["response_message", "end_of_response", "voice_text"],
    },
    "voice_synthesizer_result.msgpack": {
        "producer": "VoiceSynthesizer",
        "consumer": "Go RTC pipeline",
        "wire_direction": "Python -> Go",
        "major_fields": ["mora_queue", "speaking_time", "voice", "audio_format"],
    },
}


def _messages() -> tuple[ChatMessage, ChatMessage]:
    """固定 ID と時刻を使い、nullable と UTF-8 を含む request/response を作る。"""
    request = ChatMessage(
        speech_id=42,
        message_id="01J00000000000000000000001",
        message_type="user",
        speaker_id="fixture-user",
        speaker_name="利用者",
        expression_code=None,
        message="固定された認識文",
        created_at=1_700_000_001.25,
    )
    response = ChatMessage(
        speech_id=42,
        message_id="01J00000000000000000000002",
        message_type="assistant",
        speaker_id="fixture-assistant",
        speaker_name="応答者",
        expression_code=4,
        message="固定された応答文",
        created_at=1_700_000_002.5,
    )
    return request, response


def build_payloads() -> dict[str, bytes]:
    """各 Python producer の production ``to_msgpack`` だけで fixture bytes を作る。"""
    request_message, response_message = _messages()
    history = ChatHistory(messages=[request_message])

    query = VoiceVoxQuery(
        accent_phrases=[],
        speedScale=1.0,
        pitchScale=0.0,
        intonationScale=1.0,
        volumeScale=1.0,
        prePhonemeLength=0.1,
        postPhonemeLength=0.1,
        pauseLength=None,
        pauseLengthScale=1.0,
        outputSamplingRate=24_000,
        outputStereo=False,
        kana="コテイ",
    )

    return {
        "extractor_initialize.msgpack": SpeechExtractorInitializeRequest(
            session_id="fixture-session",
            start_at=1_700_000_000.125,
            voice_sampling_rate=16_000,
            voice_sample_bytes=2,
            voice_channels=1,
        ).to_msgpack(),
        "extractor_result.msgpack": SpeechExtractorResult(
            session_id="fixture-session",
            speech_id=42,
            sequence_id=7,
            start_at=1_700_000_000.5,
            confirmed=True,
            voice=np.array([-32768, -1, 0, 1, 32767], dtype=np.int16),
            voice_dtype="int16",
            voice_sampling_rate=16_000,
            voice_sample_bytes=2,
            voice_channels=1,
        ).to_msgpack(),
        "recognizer_result.msgpack": SpeechRecognizerResult(
            session_id="fixture-session",
            speech_id=42,
            sequence_id=7,
            start_at=1_700_000_000.5,
            confirmed=True,
            result=[("固定", 0.875), ("文", 0.5)],
        ).to_msgpack(),
        "text_processor_request.msgpack": TextProcessorRequest(
            session_id="fixture-session",
            sequence_id=7,
            confirmed=True,
            history=history,
            request_message=request_message,
        ).to_msgpack(),
        "text_processor_result.msgpack": TextProcessorResult(
            session_id="fixture-session",
            sequence_id=7,
            confirmed=True,
            history=history,
            request_message=request_message,
            response_message=response_message,
            end_of_response=False,
            voice_text=None,
        ).to_msgpack(),
        "voice_synthesizer_result.msgpack": VoiceSynthesizerResult(
            speech_id=42,
            message="固定された応答文",
            query=query,
            mora_queue=[
                VoiceSynthesizerMora(vowel="o", length=0.125, text="コ"),
                VoiceSynthesizerMora(vowel=None, length=0.25, text=None),
            ],
            speaking_time=0.375,
            voice=b"\x00\xffOggS\x00fixture",
            audio_format="audio/ogg;codecs=opus",
        ).to_msgpack(),
    }


def write_fixtures(output_dir: Path) -> None:
    """payload と、その bytes から計算した manifest を同じ directory へ書く。"""
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, object]] = {}
    for filename, payload in build_payloads().items():
        (output_dir / filename).write_bytes(payload)
        manifest[filename] = {
            **FIXTURE_METADATA[filename],
            "byte_length": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def check_fixtures(fixture_dir: Path) -> int:
    """一時 directory への再生成結果を committed fixture と byte 単位で比較する。"""
    with tempfile.TemporaryDirectory(prefix="sincro-protocol-fixtures-") as temporary:
        generated_dir = Path(temporary)
        write_fixtures(generated_dir)
        expected_names = {*FIXTURE_METADATA, "manifest.json"}
        for filename in sorted(expected_names):
            committed = fixture_dir / filename
            generated = generated_dir / filename
            if (
                not committed.is_file()
                or committed.read_bytes() != generated.read_bytes()
            ):
                print(f"fixture mismatch: {filename}")
                return 1
    return 0


def main() -> int:
    """CLI entry point。既定では script と同じ directory の fixture を更新する。"""
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument(
        "--output-dir", type=Path, default=Path(__file__).resolve().parent
    )
    args = parser.parse_args()
    if args.check:
        return check_fixtures(args.output_dir)
    write_fixtures(args.output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
