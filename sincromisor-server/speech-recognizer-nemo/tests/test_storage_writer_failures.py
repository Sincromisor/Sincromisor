"""保存先の障害分離とパス検証を、実際の一時ファイルで確認する。"""

import subprocess
from datetime import datetime

import pytest
from sincro_models import SpeechExtractorResult
from speech_recognizer_nemo.recognition_storage_writer import RecognitionStorageWriter
from test_recognition_storage import request, result


class S3:
    def __init__(self):
        self.outputs = []
        self.audio = []

    def export_result_to_s3(self, output):
        self.outputs.append(output)

    def export_voice_to_s3(self, audio, opus):
        self.audio.append(opus)

    def close(self):
        pass


def test_s3_preparation_failure_keeps_local_and_retries_next_job(
    tmp_path, monkeypatch, caplog
):
    s3 = S3()
    calls = []

    def prepare():
        calls.append(1)
        if len(calls) == 1:
            raise OSError("private connection")
        return s3

    monkeypatch.setattr(
        "speech_recognizer_nemo.recognition_storage_writer.shutil.which", lambda _: None
    )
    writer = RecognitionStorageWriter(str(tmp_path), prepare)
    for sequence in (1, 2):
        audio = request(sequence)
        writer.write(audio, result(audio), None)
    writer.close()
    assert len(list(tmp_path.rglob("*.json"))) == 2
    assert len(list(tmp_path.rglob("*.wav"))) == 2
    assert [output.speech_id for output in s3.outputs] == [2]
    assert "private connection" not in caplog.text
    assert any(
        row.msg.get("stage") == "prepare"
        for row in caplog.records
        if isinstance(row.msg, dict)
    )


@pytest.mark.parametrize(
    "error", [subprocess.TimeoutExpired("opusenc", 30), OSError("private encoder")]
)
def test_encoder_failure_preserves_json_trace_and_wav(
    tmp_path, monkeypatch, caplog, error
):
    s3 = S3()
    writer = RecognitionStorageWriter(str(tmp_path), lambda: s3)
    monkeypatch.setattr(
        "speech_recognizer_nemo.recognition_storage_writer.shutil.which",
        lambda _: "opusenc",
    )

    def fail(self):
        raise error

    monkeypatch.setattr(SpeechExtractorResult, "to_opus", fail)
    audio = request()
    writer.write(audio, result(audio), {"changed": False})
    writer.close()
    assert len(list(tmp_path.rglob("*.json"))) == 2
    assert len(list(tmp_path.rglob("*.wav"))) == 1
    assert len(s3.outputs) == 1
    assert not s3.audio
    assert "private encoder" not in caplog.text
    assert any(
        row.msg.get("stage") == "encode" and row.msg.get("outcome") == "failed"
        for row in caplog.records
        if isinstance(row.msg, dict)
    )


@pytest.mark.parametrize(
    "session_id", ["../outside", "/absolute", "a/b", "a\\b", ".", "..", "", "a\x00b"]
)
def test_invalid_session_id_cannot_write_local(tmp_path, monkeypatch, session_id):
    s3 = S3()
    writer = RecognitionStorageWriter(str(tmp_path / "records"), lambda: s3)
    monkeypatch.setattr(
        "speech_recognizer_nemo.recognition_storage_writer.shutil.which", lambda _: None
    )
    audio = request()
    audio.session_id = session_id
    writer.write(audio, result(audio), None)
    writer.close()
    assert not list(tmp_path.rglob("*.json"))
    assert not (tmp_path / "records").exists()
    assert len(s3.outputs) == 1


@pytest.mark.parametrize("suffix", [None, ".json", ".trace.json", ".opus", ".wav"])
def test_existing_symlink_cannot_redirect_any_local_artifact(
    tmp_path, monkeypatch, suffix
):
    root = tmp_path / "records"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    protected = outside / "protected"
    protected.write_bytes(b"keep")
    audio = request()
    directory = root / audio.session_id
    if suffix is None:
        directory.symlink_to(outside, target_is_directory=True)
    else:
        directory.mkdir()
        stamp = datetime.fromtimestamp(audio.start_at).strftime("%Y%m%d_%H%M%S.%f")
        (directory / f"{audio.speech_id:06d}_{stamp}{suffix}").symlink_to(protected)
    monkeypatch.setattr(
        "speech_recognizer_nemo.recognition_storage_writer.shutil.which", lambda _: None
    )
    s3 = S3()
    writer = RecognitionStorageWriter(str(root), lambda: s3)
    writer.write(audio, result(audio), {"changed": False})
    writer.close()
    assert protected.read_bytes() == b"keep"
    assert list(outside.iterdir()) == [protected]
    assert not [
        path
        for path in directory.iterdir()
        if not path.is_symlink() and path.name != "protected"
    ]
    assert len(s3.outputs) == 1
