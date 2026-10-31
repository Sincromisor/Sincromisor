"""最小長ちょうどで分類入力を返し、フレームの順序と区間境界を維持する。"""

import asyncio

import numpy as np
from speech_extractor.SpeechExtractor import SpeechExtractorWorker


def test_input_buffer_emits_at_exact_threshold():
    class Socket:
        def __init__(self):
            self.received = 0

        async def receive_bytes(self):
            self.received += 1
            return np.full(320, self.received, dtype=np.int16).tobytes()

    async def run():
        worker, socket = SpeechExtractorWorker("buffer"), Socket()
        chunks = worker._SpeechExtractorWorker__get_audio_buffer(socket)  # noqa: SLF001  # reason: 分類器を起動せず実際の受信境界を検証する。
        try:
            for index in range(2):
                chunk = await anext(chunks)
                assert socket.received == (index + 1) * 10
                np.testing.assert_array_equal(
                    chunk, np.repeat(np.arange(index * 10 + 1, index * 10 + 11), 320)
                )
        finally:
            await chunks.aclose()

    asyncio.run(run())
