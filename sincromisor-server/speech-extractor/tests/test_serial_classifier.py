"""共有分類器の実行順と接続側の発話状態を確認する。"""

import asyncio
import threading
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
import pytest
from sincro_models import SpeechExtractorResult
from speech_extractor.SpeechExtractor import SpeechExtractorWorker


class Classifier:
    def __init__(self):
        self.events = [("create", threading.get_ident())]
        self.started = threading.Event()
        self.release = threading.Event()
        self.release.set()
        self.speech = False
        self.fail = False

    def classify(self, _clip):
        self.events.append(("classify", threading.get_ident()))
        self.started.set()
        assert self.release.wait(3)
        if self.fail:
            raise ValueError("classification failed")
        category = SimpleNamespace(category_name="Speech", score=int(self.speech))
        return [
            SimpleNamespace(classifications=[SimpleNamespace(categories=[category])])
        ]

    def close(self):
        self.events.append(("close", threading.get_ident()))


class Socket:
    def __init__(self):
        self.results = []

    async def send_bytes(self, pack):
        self.results.append(SpeechExtractorResult.from_msgpack(pack))


async def wait_started(classifier):
    async with asyncio.timeout(3):
        while not classifier.started.is_set():
            await asyncio.sleep(0.001)


def process(worker, ws, state, audio):
    return worker._SpeechExtractorWorker__process_audio_chunk(ws, state, audio, 600)  # noqa: SLF001  # reason: 発話状態を固定した回帰試験のため


def state():
    return SpeechExtractorWorker.ExtractState(
        result=SpeechExtractorResult(session_id="test", start_at=-1),
    )


def test_serial_cancellation_failure_and_close():
    async def run():
        with patch(
            "speech_extractor.SpeechExtractor.SpeechExtractorWorker.audio.AudioClassifier.create_from_options",
            side_effect=lambda _: Classifier(),
        ):
            SpeechExtractorWorker.setup_model()
        classifier = SpeechExtractorWorker.classifier
        classifier.release.clear()
        ws = Socket()
        worker = SpeechExtractorWorker("a")
        other = SpeechExtractorWorker("b")
        audio = np.zeros(3201, dtype=np.int16)
        try:
            running = asyncio.create_task(process(worker, ws, state(), audio))
            await wait_started(classifier)
            queued = asyncio.create_task(process(other, ws, state(), audio))
            await asyncio.sleep(0)
            queued.cancel()
            with pytest.raises(asyncio.CancelledError):
                await queued
            running.cancel()
            with pytest.raises(asyncio.CancelledError):
                await running
            assert not ws.results
            assert [kind for kind, _ in classifier.events] == ["create", "classify"]
            classifier.release.set()
            classifier.fail = True
            with pytest.raises(ValueError, match="classification failed"):
                await process(other, ws, state(), audio)
            classifier.fail = False
            await asyncio.gather(
                process(worker, ws, state(), audio),
                process(other, ws, state(), audio),
            )
        finally:
            classifier.release.set()
            SpeechExtractorWorker.close_model()
        assert [kind for kind, _ in classifier.events] == [
            "create",
            "classify",
            "classify",
            "classify",
            "classify",
            "close",
        ]
        assert len({thread for _, thread in classifier.events}) == 1
        assert classifier.events[0][1] != threading.get_ident()

    asyncio.run(run())


def test_segments_sequence_and_pre_roll():
    async def run():
        with patch(
            "speech_extractor.SpeechExtractor.SpeechExtractorWorker.audio.AudioClassifier.create_from_options",
            side_effect=lambda _: Classifier(),
        ):
            SpeechExtractorWorker.setup_model()
        try:
            worker, ws, current = SpeechExtractorWorker("a"), Socket(), state()
            audio = np.arange(3201, dtype=np.int16)
            for speech in [False, False, False, True, True, False, False, False, True]:
                SpeechExtractorWorker.classifier.speech = speech
                await process(worker, ws, current, audio)
            assert [r.sequence_id for r in ws.results] == [1, 2, 3, 4]
            assert [r.speech_id for r in ws.results] == [0, 0, 0, 1]
            assert [r.confirmed for r in ws.results] == [False, False, True, False]
            assert [r.voice.size for r in ws.results] == [8000 + 3201, 3201, 9603, 3201]
            np.testing.assert_array_equal(ws.results[0].voice[-3201:], audio)
        finally:
            SpeechExtractorWorker.close_model()

    asyncio.run(run())


def test_close_waits_for_running_classification():
    with patch(
        "speech_extractor.SpeechExtractor.SpeechExtractorWorker.audio.AudioClassifier.create_from_options",
        side_effect=lambda _: Classifier(),
    ):
        SpeechExtractorWorker.setup_model()
    classifier = SpeechExtractorWorker.classifier
    classifier.release.clear()
    pending = SpeechExtractorWorker.executor.submit(classifier.classify, None)
    assert classifier.started.wait(3)
    closing = threading.Thread(target=SpeechExtractorWorker.close_model)
    closing.start()
    try:
        assert closing.is_alive()
        assert not any(kind == "close" for kind, _ in classifier.events)
    finally:
        classifier.release.set()
        closing.join(3)
    assert not closing.is_alive()
    pending.result()
    assert [kind for kind, _ in classifier.events] == ["create", "classify", "close"]
