"""遅い保存・取消・所有コピー・有限枠と終了順序を実際の実行器で確認する。"""

import asyncio
import json
import logging
import threading
from unittest.mock import patch

import numpy as np
import pytest
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult
from speech_recognizer_nemo.recognition_storage import RecognitionStorage
from speech_recognizer_nemo.recognition_storage_writer import RecognitionStorageWriter
from speech_recognizer_nemo.recognizer_execution import RecognizerExecution


def request(sequence=1, confirmed=True, size=4):
    return SpeechExtractorResult(
        session_id="fixture",
        speech_id=sequence,
        sequence_id=sequence,
        start_at=1,
        confirmed=confirmed,
        voice=np.arange(size, dtype=np.int16),
    )


def result(audio):
    return SpeechRecognizerResult(
        session_id=audio.session_id,
        speech_id=audio.speech_id,
        sequence_id=audio.sequence_id,
        start_at=audio.start_at,
        confirmed=audio.confirmed,
        result=[("試験", 1.0)],
    )


class SlowWriter:
    def __init__(self):
        self.started = threading.Event()
        self.release = threading.Event()
        self.saved = []
        self.closed = False

    def write(self, audio, output, trace):
        assert not self.closed
        self.started.set()
        assert self.release.wait(3)
        self.saved.append((audio, output, trace))

    def close(self):
        self.closed = True


@pytest.mark.parametrize("max_jobs", [1, 2])
def test_slow_storage_releases_model_and_copies_owned_data(max_jobs):
    async def run():
        writer = SlowWriter()
        storage = RecognitionStorage(writer, max_jobs=max_jobs, max_bytes=8)
        trace = {"nested": [1]}

        class Worker:
            def recognize(self, audio):
                return result(audio), trace

        execution = RecognizerExecution(Worker, storage=storage)
        try:
            audio = request()
            output = await asyncio.wait_for(execution.recognize(audio), 2)
            assert await asyncio.to_thread(writer.started.wait, 2)
            assert not writer.saved
            audio.voice[:] = 99
            output.result.clear()
            trace["nested"].append(2)
            waiting = asyncio.create_task(execution.recognize(request(2)))
            await asyncio.sleep(0)
            # 保存枠が満杯でも次接続の推論・暫定認識は進む。
            partial = await asyncio.wait_for(execution.recognize(request(3, False)), 2)
            assert partial.speech_id == 3
            assert not waiting.done()
            waiting.cancel()
            with pytest.raises(asyncio.CancelledError):
                await waiting
            assert storage.jobs == 1
            assert storage.bytes == 8
            writer.release.set()
        finally:
            writer.release.set()
            execution.close()
            storage.close()
        assert writer.closed
        assert len(writer.saved) == 1
        saved_audio, saved_result, saved_trace = writer.saved[0]
        np.testing.assert_array_equal(saved_audio.voice, np.arange(4, dtype=np.int16))
        assert saved_result.result == [("試験", 1.0)]
        assert saved_trace == {"nested": [1]}
        assert storage.jobs == 0
        assert storage.bytes == 0
        storage.close()

    asyncio.run(run())


@pytest.mark.parametrize("failure", ["copy", "submit"])
def test_handoff_failure_preserves_recognition_and_releases_capacity(
    monkeypatch, caplog, failure
):
    async def run():
        writer = SlowWriter()
        storage = RecognitionStorage(writer, max_jobs=1, max_bytes=8)
        audio = request()

        class Worker:
            def recognize(self, audio):
                return result(audio), None

        execution = RecognizerExecution(Worker, storage=storage)
        try:
            with monkeypatch.context() as context:
                context.setattr(
                    SpeechExtractorResult if failure == "copy" else storage.executor,
                    "model_copy" if failure == "copy" else "submit",
                    lambda *a, **kw: (_ for _ in ()).throw(
                        ValueError("private failure")
                    ),
                )
                output = await execution.recognize(audio)
                assert output.result_text() == "試験"
            assert storage.jobs == 0
            assert storage.bytes == 0
            await storage.submit(audio, result(audio), None)
        finally:
            writer.release.set()
            execution.close()
            storage.close()
        assert len(writer.saved) == 1

    asyncio.run(run())
    assert "private failure" not in caplog.text
    assert any(
        isinstance(row.msg, dict)
        and row.msg.get("stage") == "handoff"
        and row.msg.get("outcome") == "failed"
        for row in caplog.records
    )


def test_close_wakes_waiter_and_drains_accepted_job():
    async def run():
        writer = SlowWriter()
        storage = RecognitionStorage(writer, max_jobs=1)
        audio = request()
        await storage.submit(audio, result(audio), None)
        assert await asyncio.to_thread(writer.started.wait, 2)
        waiting = asyncio.create_task(storage.submit(audio, result(audio), None))
        await asyncio.sleep(0)
        closing = asyncio.create_task(asyncio.to_thread(storage.close))
        with pytest.raises(RuntimeError, match="closed"):
            await asyncio.wait_for(waiting, 2)
        assert not writer.closed
        writer.release.set()
        await closing
        assert writer.closed
        assert len(writer.saved) == 1

    asyncio.run(run())


def test_write_failure_is_independent_and_later_jobs_continue(caplog):
    caplog.set_level(logging.INFO, logger="sincro.RecognitionStorage")

    class Writer:
        def __init__(self):
            self.calls = []

        def write(self, audio, output, trace):
            self.calls.append(audio.sequence_id)
            if audio.sequence_id == 1:
                raise PermissionError("private-path")

        def close(self):
            pass

    async def run():
        writer = Writer()
        storage = RecognitionStorage(writer)
        try:
            for sequence in (1, 2):
                audio = request(sequence)
                await storage.submit(audio, result(audio), None)
        finally:
            storage.close()
        assert writer.calls == [1, 2]

    asyncio.run(run())
    rows = [record.msg for record in caplog.records if isinstance(record.msg, dict)]
    assert any(
        row.get("reason") == "permission_denied" and row["outcome"] == "failed"
        for row in rows
    )
    assert any(
        row["stage"] == "execution"
        and row["sequence_id"] == 2
        and row["outcome"] == "success"
        for row in rows
    )
    assert "private-path" not in caplog.text


def test_local_and_s3_share_one_opus_encoding(tmp_path, monkeypatch):
    saved = []
    closed = []

    class S3:
        def export_result_to_s3(self, output):
            saved.append(output.to_json(dumps_opt={"indent": 4}).encode())

        def export_voice_to_s3(self, audio, opus):
            saved.append(opus)

        def close(self):
            closed.append(True)

    monkeypatch.setattr(
        "speech_recognizer_nemo.recognition_storage_writer.shutil.which",
        lambda _: "opusenc",
    )
    writer = RecognitionStorageWriter(str(tmp_path), S3)
    audio = request()
    with patch.object(
        SpeechExtractorResult, "to_opus", return_value=b"fixture-opus"
    ) as encode:
        writer.write(audio, result(audio), {"changed": False})
    writer.close()
    assert encode.call_count == 1
    assert next(tmp_path.rglob("*.opus")).read_bytes() == saved[1] == b"fixture-opus"
    assert (
        next(
            path
            for path in tmp_path.rglob("*.json")
            if not path.name.endswith(".trace.json")
        ).read_bytes()
        == saved[0]
    )
    assert json.loads(next(tmp_path.rglob("*.trace.json")).read_text()) == {
        "changed": False
    }
    assert closed == [True]


def test_local_failure_does_not_prevent_s3(monkeypatch, caplog):
    class S3:
        def __init__(self):
            self.calls = []

        def export_result_to_s3(self, output):
            self.calls.append(output.speech_id)

    s3 = S3()
    writer = RecognitionStorageWriter("/private-test-path", lambda: s3)
    monkeypatch.setattr(
        "speech_recognizer_nemo.recognition_storage_writer.shutil.which", lambda _: None
    )
    monkeypatch.setattr(
        "pathlib.Path.mkdir",
        lambda *a, **kw: (_ for _ in ()).throw(PermissionError("private-path")),
    )
    audio = request()
    writer.write(audio, result(audio), None)
    assert s3.calls == [1]
    assert "private-path" not in caplog.text


def test_oversized_audio_is_reported_without_copy_or_wait(monkeypatch, caplog):
    async def run():
        writer = SlowWriter()
        storage = RecognitionStorage(writer, max_bytes=1)
        audio = request()
        monkeypatch.setattr(
            SpeechExtractorResult,
            "model_copy",
            lambda *a, **kw: pytest.fail("must reserve before copy"),
        )
        try:
            await asyncio.wait_for(storage.submit(audio, result(audio), None), 1)
        finally:
            storage.close()
        assert writer.saved == []
        assert storage.jobs == 0
        assert storage.bytes == 0

    asyncio.run(run())
    assert any(
        isinstance(row.msg, dict) and row.msg.get("reason") == "audio_exceeds_capacity"
        for row in caplog.records
    )
