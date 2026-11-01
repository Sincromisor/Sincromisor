"""完成WAVキャッシュと逐次PCMを同じ区間契約へ接続する。保存は正常EOF後に限る。"""

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
    query: VoiceVoxQuery | None = None
    speaking_time: float = 0.0


class _StreamingCacheRequest(VoiceSynthesizerRequest):
    """48kHz完成WAVを無音条件ごとに分離し、旧キーへは読取代替しない。"""

    def redis_key(self) -> str:
        """前後無音の異なるPCM・モーラ列との誤命中を防ぐ。"""
        return (
            f"streaming-pcm-v2/{self.pre_phoneme_length}/{self.post_phoneme_length}/"
            + super().redis_key()
        )

    def s3_key(self) -> str:
        """保存形式は既存Resultのまま、48kHz合成専用の階層へ分離する。"""
        return (
            f"streaming-pcm-v2/{self.pre_phoneme_length}/{self.post_phoneme_length}/"
            + super().s3_key()
        )


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
    # 成功ログは音声を含まないメタデータで成立させ、満杯時のWAV生成を避ける。
    context.query = query
    context.speaking_time = offset / 48_000
    if cached is None:
        manager.save_generated_voice(cache_request, query, full_pcm, context)
    elif context.cache_source == "s3":
        # S3命中も全WAVを検証してから昇格し、破損や取消済み音声をRedisへ広げない。
        manager.save_cached_voice(cache_request, cached, context)
    if context.cancelled.is_set():
        raise InterruptedError("Synthesis cancelled")
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
