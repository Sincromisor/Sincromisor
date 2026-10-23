"""実CoreのHTTP互換性と、既存利用側のPCM・口形契約を音声保存なしで確認する。"""

import io
import json
import time
import wave
from threading import Event

from sincro_models import VoiceSynthesizerRequest
from voice_synthesizer.streaming_mora_timing import build_streaming_mora_queue
from voice_synthesizer.VoiceSynthesizer.VoiceSynthesizer import VoiceSynthesizer

client = VoiceSynthesizer(host="sincro-voicevox")
text = "音声合成の更新を確認します。最初の音声の後も、続きが順番に届いていますか？"
results = []
try:
    # Engineは話者メタ情報の0.17.0を返す。配布Core自体の版はvoicevox_get_versionで別に検証する。
    assert client.core_versions() == ["0.17.0"]
    query = client.audio_query(text, style_id=0)
    query.outputSamplingRate = 48000
    query.outputStereo = False
    expected_frames = round(
        sum(m.length for m in build_streaming_mora_queue(query)) * 48000
    )
    for mode, path, params in (
        ("normal", "/synthesis", {"speaker": 0}),
        ("fixed", "/streaming_synthesis", {"speaker": 0, "segment_length": 0.3}),
        (
            "ramped",
            "/streaming_synthesis",
            {"speaker": 0, "segment_length": 0.3, "max_segment_length": 2.4},
        ),
    ):
        started = time.perf_counter()
        with client.session.post(
            client.base_url + path,
            params=params,
            json=query.model_dump(),
            timeout=client.HTTP_TIMEOUT,
            stream=True,
        ) as response:
            response.raise_for_status()
            chunks = response.iter_content(4096)
            data = next(chunks)
            first = time.perf_counter() - started
            data += b"".join(chunks)
            total = time.perf_counter() - started
            assert len(data) == int(response.headers["content-length"])
        with wave.open(io.BytesIO(data)) as wav:
            assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (
                48000,
                1,
                2,
            )
            assert wav.getnframes() == expected_frames
            assert len(wav.readframes(expected_frames)) == expected_frames * 2
        if mode != "normal":
            assert first < total
        results.append(
            {
                "mode": mode,
                "bytes": len(data),
                "frames": expected_frames,
                "first_pcm_s": first,
                "total_s": total,
            }
        )
    # 独自引数が黙って無視されず、WAV送信前に不正な上限を拒否することを確認する。
    with client.session.post(
        client.base_url + "/streaming_synthesis",
        params={"speaker": 0, "segment_length": 0.3, "max_segment_length": 0.2},
        json=query.model_dump(),
        timeout=client.HTTP_TIMEOUT,
    ) as response:
        assert response.status_code == 400
    # 通常会話の実アダプターで逐次WAVの検証を通し、口形総長とPCM数を比較する。
    request = VoiceSynthesizerRequest(speech_id=1, message=text, style_id=0)
    stream = client.generate_pcm(request, Event(), {})
    query, first_pcm = next(stream)
    pcm_bytes = len(first_pcm) + sum(len(pcm) for _, pcm in stream)
    mora_frames = round(
        sum(m.length for m in build_streaming_mora_queue(query)) * 48000
    )
    assert pcm_bytes == mora_frames * 2
    print(
        json.dumps(
            {
                "core": client.core_versions(),
                "http": results,
                "adapter_pcm_bytes": pcm_bytes,
                "mora_frames": mora_frames,
            },
            indent=2,
        )
    )
finally:
    client.close()
