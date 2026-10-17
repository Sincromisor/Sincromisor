"""外部符号化の時間切れが呼出元まで伝わり、子プロセスが回収されることを確認する。"""

import subprocess
import sys

import pytest
from sincro_models import audio_encoder


def test_encoder_timeout(monkeypatch):
    monkeypatch.setattr(audio_encoder, "ENCODE_TIMEOUT_SECONDS", 0.05)
    with pytest.raises(subprocess.TimeoutExpired):
        audio_encoder.encode_audio(
            [sys.executable, "-c", "import time; time.sleep(5)"], b"", {}
        )
