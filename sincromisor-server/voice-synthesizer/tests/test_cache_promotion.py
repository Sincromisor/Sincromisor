"""逐次合成の反復取得がS3を再訪せず、昇格失敗時も取得結果を返すことを確認する。"""

import io
import logging
from threading import Event
from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from redis.exceptions import ConnectionError as RedisConnectionError
from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult, VoiceVoxQuery
from voice_synthesizer.voice_stream import StreamContext
from voice_synthesizer.VoiceSynthesizer import VoiceCacheManager


def cache_result():
    return VoiceSynthesizerResult(
        message="人工音声",
        query=VoiceVoxQuery(
            accent_phrases=[],
            speedScale=1,
            pitchScale=0,
            intonationScale=1,
            volumeScale=1,
            prePhonemeLength=0,
            postPhonemeLength=0,
            pauseLength=None,
            pauseLengthScale=1,
            outputSamplingRate=48_000,
            outputStereo=False,
            kana="",
        ),
        mora_queue=[],
        speaking_time=0.1,
        voice=b"fixture",
        audio_format="audio/wav",
    )


@pytest.mark.parametrize("outcome", ["success", "write_failure", "cancelled", "miss"])
def test_streaming_s3_hit_promotes_to_redis(outcome):
    manager = object.__new__(VoiceCacheManager)
    manager.logger = logging.getLogger("sincro.test_cache")
    manager.bucket_name = "fixture"
    saved = {}
    result = cache_result()
    pack = result.to_msgpack()
    context = StreamContext(1, Event(), {})

    def read(**kwargs):
        if outcome == "miss":
            raise ClientError({"Error": {"Code": "NoSuchKey"}}, "GetObject")
        if outcome == "cancelled":
            context.cancelled.set()
        return {"Body": StreamingBody(io.BytesIO(pack), len(pack))}

    def write(key, value, *, ex):
        assert ex == 60 * 60 * 24 * 7
        if outcome == "write_failure":
            raise RedisConnectionError("fixture")
        saved[key] = value

    manager.redis = SimpleNamespace(
        get=Mock(side_effect=saved.get), set=Mock(side_effect=write)
    )
    manager.s3_client = SimpleNamespace(get_object=Mock(side_effect=read))
    request = VoiceSynthesizerRequest(message="人工音声", speech_id=1, style_id=3)
    first = manager.load_cached_voice(request, context)
    if outcome == "miss":
        assert first is None
        assert context.cache_source == "generated"
        manager.redis.set.assert_not_called()
        return
    assert first == result
    assert context.cache_source == "s3"
    if outcome == "cancelled":
        manager.redis.set.assert_not_called()
        return
    manager.redis.set.assert_called_once()
    if outcome == "success":
        assert manager.load_cached_voice(request, context) == result
        assert context.cache_source == "redis"
        manager.s3_client.get_object.assert_called_once()
        manager.redis.set.assert_called_once()
