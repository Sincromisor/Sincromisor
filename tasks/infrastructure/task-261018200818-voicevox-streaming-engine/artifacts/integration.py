"""隔離キャッシュから実Engine、既存の音声変換とMessagePack返却までを確認する。"""

import json
from uuid import uuid4

from sincro_models import VoiceSynthesizerRequest, VoiceSynthesizerResult
from voice_synthesizer.VoiceSynthesizer.VoiceCacheManager import VoiceCacheManager

manager = VoiceCacheManager(
    voicevox_host="sincro-voicevox",
    voicevox_port=50021,
    redis_host="redis",
    redis_port=6379,
    s3_host="s3",
    s3_port=9000,
    s3_access_key="validation",
    s3_secret_key="validation-only-password",
)
try:
    if manager.bucket_name not in {
        bucket["Name"] for bucket in manager.s3_client.list_buckets()["Buckets"]
    }:
        manager.s3_client.create_bucket(Bucket=manager.bucket_name)
    request = VoiceSynthesizerRequest(
        speech_id=1,
        message="接続確認です。" + uuid4().hex,
        style_id=0,
        audio_format="audio/ogg;codecs=opus",
    )
    assert manager.redis.get(request.redis_key()) is None
    assert (
        manager.s3_client.list_objects_v2(
            Bucket=manager.bucket_name, Prefix=request.s3_key()
        ).get("KeyCount")
        == 0
    )
    result = manager.get_voice(request)
    assert result.voice.startswith(b"OggS")
    assert result.audio_format == request.audio_format
    assert result.mora_queue
    assert result.speaking_time > 0
    returned = VoiceSynthesizerResult.from_msgpack(result.to_msgpack())
    assert returned.voice == result.voice
    assert returned.mora_queue == result.mora_queue
    assert manager.redis.get(request.redis_key())
    assert (
        manager.s3_client.head_object(Bucket=manager.bucket_name, Key=request.s3_key())[
            "ContentLength"
        ]
        > 0
    )
    print(
        json.dumps(
            {
                "cache_miss": True,
                "audio_format": returned.audio_format,
                "voice_bytes": len(returned.voice),
                "moras": len(returned.mora_queue),
                "speaking_time": returned.speaking_time,
                "redis_and_s3_saved": True,
            }
        )
    )
finally:
    manager.close()
