"""接続内の前無音、発話切替と無音条件別の逐次キャッシュを確認する。"""

import asyncio
from importlib import import_module
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from sincro_models import TextProcessorResult, VoiceSynthesizerRequest
from test_blocking_work import request_pack
from test_streaming_audio import query
from voice_synthesizer.cache_writer import _complete_result
from voice_synthesizer.voice_stream import StreamContext, stream_voice
from voice_synthesizer.VoiceSynthesizer import VoiceSynthesizerWorker


def test_connection_owns_first_request_and_resets_on_next_speech(monkeypatch):
    received = []
    module = import_module("voice_synthesizer.VoiceSynthesizer.VoiceSynthesizerWorker")
    manager = Mock()

    def stream(request, context):
        received.append((request, context.request_id))
        return iter(())

    manager.stream_voice.side_effect = stream
    monkeypatch.setattr(module, "VoiceCacheManager", Mock(return_value=manager))

    async def run():
        for _ in range(2):
            worker = VoiceSynthesizerWorker(
                "unused",
                1,
                0,
                "unused",
                1,
                "unused",
                1,
                "fixture",
                "fixture",
                cache_writer=Mock(),
            )
            packs = []
            for speech_id, text in [
                (8, None),
                (8, "同じ本文。"),
                (8, "同じ本文。"),
                (8, None),
                (9, "同じ本文。"),
                (9, "同じ本文。"),
            ]:
                result = TextProcessorResult.from_msgpack(request_pack())
                result.response_message.speech_id = speech_id
                result.voice_text = text
                packs.append(result.to_msgpack())
            packs.append(b"")

            async def receive(packs=packs):
                return packs.pop(0)

            await worker.communicate(SimpleNamespace(receive_bytes=receive))
            worker.close()

    asyncio.run(run())
    assert [r.pre_phoneme_length for r, _ in received] == [0.1, 0, 0.1, 0] * 2
    assert [r.post_phoneme_length for r, _ in received] == [0.1] * 8
    assert [n for _, n in received] == [1, 2, 3, 4] * 2


@pytest.mark.parametrize("source", ["redis", "s3"])
def test_cache_separates_padding_and_replays_identical_pcm_and_moras(source):
    cache, generated, looked_up = {}, [], []

    def generate(request, *_):
        generated.append(request)
        q = query()
        q.prePhonemeLength = request.pre_phoneme_length
        q.postPhonemeLength = request.post_phoneme_length
        yield q, b"\0\0" * round(q.prePhonemeLength * 48000) + b"\1\0" * 4800

    def load(request, context):
        looked_up.append(request)
        context.cache_source = source
        return cache.get(request.redis_key())

    def save(request, q, pcm, context):
        cache[request.redis_key()] = _complete_result(request, q, pcm)

    manager = SimpleNamespace(
        load_cached_voice=load,
        save_generated_voice=save,
        save_cached_voice=Mock(),
        vsynth=SimpleNamespace(generate_pcm=generate),
    )
    request = VoiceSynthesizerRequest(speech_id=8, message="同じ本文。", style_id=0)
    # 旧版と完全音声キーの存在を模し、新経路から参照しないことも確認する。
    cache[request.redis_key()] = object()
    cache["streaming-pcm-v1/" + request.redis_key()] = object()
    originals = []
    for _ in range(2):
        for i, (pre, post) in enumerate([(0.1, 0.1), (0, 0.1), (0, 0.2)]):
            current = request.model_copy(
                update={"pre_phoneme_length": float(pre), "post_phoneme_length": post}
            )
            chunks = list(
                stream_voice(manager, current, StreamContext(i + 1, Event(), {}))
            )
            payload = (b"".join(c.pcm for c in chunks), chunks[0].mora_queue)
            if len(originals) < 3:
                originals.append(payload)
            else:
                assert payload == originals[i]
            assert chunks[-1].final
    assert len(generated) == 3
    assert len({r.redis_key() for r in looked_up}) == 3
    assert len({r.s3_key() for r in looked_up}) == 3
    assert all(r.redis_key().startswith("streaming-pcm-v2/") for r in looked_up)
    assert all(r.s3_key().startswith("streaming-pcm-v2/") for r in looked_up)
    assert not request.redis_key().startswith("streaming")
    assert not request.s3_key().startswith("streaming")
