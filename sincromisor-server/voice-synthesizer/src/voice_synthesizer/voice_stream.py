"""完成WAVキャッシュと逐次PCMを同じ区間契約へ接続する。保存は正常EOF後に限る。"""

import io
import wave
from collections.abc import Generator, Iterator
from dataclasses import dataclass
from threading import Event
from typing import TYPE_CHECKING

from sincro_models import (
    VoiceSynthesizerChunk,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
    VoiceVoxQuery,
)
from voice_synthesizer.streaming_mora_timing import build_streaming_mora_queue
from voice_synthesizer.wav_stream import PCM_CHUNK_BYTES, iter_pcm

if TYPE_CHECKING:
    from voice_synthesizer.VoiceSynthesizer.VoiceCacheManager import VoiceCacheManager


@dataclass
class StreamContext:
    """要求番号・取消・診断IDと、取得元・処理段階・完成結果を要求内で共有する。"""

    request_id: int
    cancelled: Event
    ids: dict[str, object]
    operation: str = "process"
    cache_source: str = "generated"
    result: VoiceSynthesizerResult | None = None


class _StreamingCacheRequest(VoiceSynthesizerRequest):
    """従来の24kHz WAV/Opusを保持し、48kHz完成WAVだけを別名前空間へ保存する。"""

    def redis_key(self) -> str:
        """48kHz区間生成の版をキーに含め、従来キャッシュとの誤命中を防ぐ。"""
        return "streaming-pcm-v1/" + super().redis_key()

    def s3_key(self) -> str:
        """保存形式は既存Resultのまま、48kHz合成専用の階層へ分離する。"""
        return "streaming-pcm-v1/" + super().s3_key()


def _cached_pcm(
    result: VoiceSynthesizerResult,
) -> Generator[tuple[VoiceVoxQuery, bytes]]:
    """保存済みWAVも同じ検証・100ms区間化を通し、破損時は正常完了を返さない。"""
    parts = (
        result.voice[index : index + PCM_CHUNK_BYTES]
        for index in range(0, len(result.voice), PCM_CHUNK_BYTES)
    )
    for pcm in iter_pcm(parts):
        yield result.query, pcm


def _complete_result(
    request: VoiceSynthesizerRequest, query: VoiceVoxQuery, pcm: bytearray
) -> VoiceSynthesizerResult:
    """全区間の検証後にだけPCMを完成WAVへ包み、既存の保存DTOへ戻す。"""
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(48_000)
        audio.writeframes(pcm)
    return VoiceSynthesizerResult(
        message=request.message,
        query=query,
        mora_queue=build_streaming_mora_queue(query),
        speaking_time=len(pcm) / 96_000,
        voice=output.getvalue(),
        audio_format="audio/wav",
    )


def stream_voice(
    manager: VoiceCacheManager, request: VoiceSynthesizerRequest, context: StreamContext
) -> Iterator[VoiceSynthesizerChunk]:
    """一要求を有限長PCMへ変換する。反復のclose/取消/失敗は保存・finalを飛ばす。"""
    cache_request = _StreamingCacheRequest.model_validate(
        {**request.model_dump(), "audio_format": "audio/wav"}
    )
    cached = manager.load_cached_voice(cache_request, context)
    context.result = cached
    source = (
        _cached_pcm(cached)
        if cached is not None
        else manager.vsynth.generate_pcm(request, context.cancelled, context.ids)
    )
    full_pcm = bytearray()
    sequence, offset = 0, 0
    query: VoiceVoxQuery | None = None
    try:
        for query, pcm in source:
            if context.cancelled.is_set():
                raise InterruptedError("Synthesis cancelled")
            if cached is None:
                full_pcm.extend(pcm)
            yield VoiceSynthesizerChunk(
                request_id=context.request_id,
                speech_id=request.speech_id,
                sequence=sequence,
                sample_offset=offset,
                final=False,
                pcm=pcm,
                message=request.message if sequence == 0 else "",
                mora_queue=build_streaming_mora_queue(query) if sequence == 0 else [],
            )
            sequence += 1
            offset += len(pcm) // 2
    finally:
        source.close()
    if query is None or context.cancelled.is_set():
        raise InterruptedError("Synthesis incomplete or cancelled")
    if cached is None:
        complete = _complete_result(request, query, full_pcm)
        context.result = complete
        manager.save_cached_voice(cache_request, complete, context)
    yield VoiceSynthesizerChunk(
        request_id=context.request_id,
        speech_id=request.speech_id,
        sequence=sequence,
        sample_offset=offset,
        final=True,
        pcm=b"",
        message="",
        mora_queue=[],
    )
