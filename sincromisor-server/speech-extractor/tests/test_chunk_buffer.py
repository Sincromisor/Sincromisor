"""受信バッファの出力時点・配列と結合回数を旧方式に照合する。"""

import asyncio
from unittest.mock import patch

import numpy as np
import pytest
from fastapi import WebSocketDisconnect
from speech_extractor.SpeechExtractor import SpeechExtractorWorker


@pytest.mark.parametrize(
    "sizes",
    [[1000, 2200, 1, 3200], [320, 320, 2560, 320, 6400, 5], [0, 3201, 3202, 0, 1]],
)
def test_chunk_buffer_matches_append(sizes):
    chunks = [np.arange(size, dtype=np.int16) for size in sizes]
    expected = []
    buffer = np.zeros(0, dtype=np.int16)
    for received, chunk in enumerate(chunks, 1):
        buffer = np.append(buffer, chunk)
        if buffer.size > 3200:
            expected.append((received, buffer))
            buffer = np.zeros(0, dtype=np.int16)

    class Socket:
        received = 0

        async def receive_bytes(self):
            if self.received == len(chunks):
                raise WebSocketDisconnect
            chunk = chunks[self.received]
            self.received += 1
            return chunk.tobytes()

    async def run():
        worker, ws = SpeechExtractorWorker("a"), Socket()
        actual = []

        async def consume():
            async for audio in worker._SpeechExtractorWorker__get_audio_buffer(ws):  # noqa: SLF001  # reason: 分類器を使わず受信時点を照合する。
                actual.append((ws.received, audio))

        with patch("numpy.concatenate", wraps=np.concatenate) as concatenate:
            with pytest.raises(WebSocketDisconnect):
                await consume()
            assert concatenate.call_count == len(expected)
        assert len(actual) == len(expected)
        for (actual_time, actual_audio), (expected_time, expected_audio) in zip(
            actual, expected, strict=True
        ):
            assert actual_time == expected_time
            assert actual_audio.dtype == np.int16
            np.testing.assert_array_equal(actual_audio, expected_audio)

    asyncio.run(run())
