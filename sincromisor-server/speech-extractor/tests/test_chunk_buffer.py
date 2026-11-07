"""20ms受信から32msのVAD入力への変換と、非同期終端判断を実際のWorkerで確認する。"""

import asyncio
import threading

import numpy as np
import pytest
from sincro_models import SpeechExtractorResult
from speech_extractor.model_execution import ModelExecution
from speech_extractor.SpeechExtractor import SpeechExtractorWorker


class Models:
    def __init__(self):
        self.frames = []
        self.turn_inputs = []
        self.started = threading.Event()
        self.release = threading.Event()
        self.release.set()
        self.probability = 0.9
        self.fail_turn = False
        self.fail_vad = False

    def speech_probability(self, pcm, memory):
        if self.fail_vad:
            raise ValueError("vad failed")
        self.frames.append(pcm.copy())
        return 0.9 if pcm.max() > 0 else 0.01

    def completion_probability(self, pcm):
        self.turn_inputs.append(pcm.copy())
        self.started.set()
        assert self.release.wait(5)
        if self.fail_turn:
            raise ValueError("turn failed")
        return self.probability


class Socket:
    def __init__(self):
        self.input = asyncio.Queue()
        self.output = []

    async def receive_bytes(self):
        return await self.input.get()

    async def send_bytes(self, pack):
        self.output.append(SpeechExtractorResult.from_msgpack(pack))


@pytest.fixture
def models(monkeypatch):
    model = Models()
    monkeypatch.setattr(SpeechExtractorWorker, "models", model, raising=False)
    monkeypatch.setattr(
        SpeechExtractorWorker,
        "vad_execution",
        ModelExecution("test-vad"),
        raising=False,
    )
    monkeypatch.setattr(
        SpeechExtractorWorker,
        "turn_execution",
        ModelExecution("test-turn"),
        raising=False,
    )
    yield model
    model.release.set()
    SpeechExtractorWorker.vad_execution.close()
    SpeechExtractorWorker.turn_execution.close()


async def until(predicate):
    async with asyncio.timeout(3):
        while not predicate():
            await asyncio.sleep(0.001)


async def push(socket, models, value, count):
    before = len(models.frames)
    for _ in range(count):
        await socket.input.put(np.full(320, value, np.int16).tobytes())
    await until(lambda: len(models.frames) >= before + (count * 320 // 512))
    await asyncio.sleep(0.005)


async def stop(task):
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


def test_pcm_reframing_is_lossless(models):
    async def run():
        ws = Socket()
        task = asyncio.create_task(SpeechExtractorWorker("a").extract(ws))
        audio = np.arange(320 * 40, dtype=np.int16) + 1
        try:
            for frame in audio.reshape(-1, 320):
                await ws.input.put(frame.tobytes())
            await until(lambda: len(models.frames) == 25)
            np.testing.assert_array_equal(np.concatenate(models.frames), audio)
        finally:
            await stop(task)

    asyncio.run(run())


def test_pending_prediction_does_not_block_vad_and_old_result_is_rejected(models):
    async def run():
        models.release.clear()
        ws = Socket()
        task = asyncio.create_task(SpeechExtractorWorker("a").extract(ws))
        try:
            await push(ws, models, 1, 16)
            await push(ws, models, 0, 40)
            await until(models.started.is_set)
            await push(ws, models, 2, 16)
            assert models.frames[-1].max() == 2
            models.release.set()
            await push(ws, models, 2, 8)
            assert not any(o.confirmed for o in ws.output)
            await push(ws, models, 0, 40)
            await until(lambda: len(models.turn_inputs) == 2)
            # 終端結果の採用は次の入力フレームで行う。
            await push(ws, models, 0, 8)
            await until(lambda: any(o.confirmed for o in ws.output))
            assert sum(o.confirmed for o in ws.output) == 1
            assert all(o.speech_id == 0 for o in ws.output)
            assert 1 in models.turn_inputs[1]
            assert 2 in models.turn_inputs[1]
        finally:
            models.release.set()
            await stop(task)

    asyncio.run(run())


@pytest.mark.parametrize("failure", [False, True])
def test_incomplete_waits_for_limit_failure_falls_back(models, failure):
    async def run():
        models.probability = 0.1
        models.fail_turn = failure
        ws = Socket()
        task = asyncio.create_task(SpeechExtractorWorker("a").extract(ws))
        try:
            await push(ws, models, 1, 16)
            await push(ws, models, 0, 40)
            await until(models.started.is_set)
            await push(ws, models, 0, 8)
            if failure:
                await until(lambda: any(o.confirmed for o in ws.output))
            else:
                assert not any(o.confirmed for o in ws.output)
                for _ in range(4):
                    await push(ws, models, 0, 32)
                await until(lambda: any(o.confirmed for o in ws.output))
            assert len(models.turn_inputs) == 1
            assert sum(o.confirmed for o in ws.output) == 1
        finally:
            await stop(task)

    asyncio.run(run())


def test_vad_failure_ends_connection(models):
    async def run():
        models.fail_vad = True
        ws = Socket()
        for _ in range(2):
            await ws.input.put(bytes(640))
        with pytest.raises(ExceptionGroup) as error:
            await SpeechExtractorWorker("a").extract(ws)
        assert any(isinstance(e, ValueError) for e in error.value.exceptions)
        assert not ws.output

    asyncio.run(run())


def test_invalid_pcm_is_rejected(models):
    async def run():
        ws = Socket()
        await ws.input.put(bytes(2))
        with pytest.raises(ExceptionGroup):
            await SpeechExtractorWorker("a").extract(ws)

    asyncio.run(run())


def test_another_connection_keeps_processing_during_turn_inference(models):
    async def run():
        models.release.clear()
        first, second = Socket(), Socket()
        one = asyncio.create_task(SpeechExtractorWorker("one").extract(first))
        two = asyncio.create_task(SpeechExtractorWorker("two").extract(second))
        try:
            await push(first, models, 1, 16)
            await push(first, models, 0, 40)
            await until(models.started.is_set)
            await push(second, models, 3, 24)
            await until(lambda: bool(second.output))
            assert all(o.session_id == "two" for o in second.output)
            assert not any(o.confirmed for o in first.output)
            await stop(one)
            assert SpeechExtractorWorker.turn_execution.pending == 1
        finally:
            models.release.set()
            if not one.done():
                await stop(one)
            await stop(two)

    asyncio.run(run())


def test_receive_overload_is_explicit_failure(models):
    async def run():
        ws = Socket()
        worker = SpeechExtractorWorker("overload")
        # VADが停止中でも受信は動く。2秒分の上限を超えたら黙って破棄せず終了する。
        original = models.speech_probability
        started, release = threading.Event(), threading.Event()

        def blocked(pcm, memory):
            started.set()
            assert release.wait(3)
            return original(pcm, memory)

        models.speech_probability = blocked
        for _ in range(110):
            await ws.input.put(bytes(640))
        task = asyncio.create_task(worker.extract(ws))
        try:
            with pytest.raises(ExceptionGroup) as error:
                await asyncio.wait_for(task, timeout=2)
            assert any(isinstance(e, asyncio.QueueFull) for e in error.value.exceptions)
        finally:
            release.set()

    asyncio.run(run())
