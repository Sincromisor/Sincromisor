"""起動済みNeMoコンテナ内で、同梱短音声のWebSocket認識を確認する。"""

import numpy as np
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult
from websockets.sync.client import connect

voice = np.fromfile(
    "speech-recognizer-nemo/src/speech_recognizer_nemo/SpeechRecognizerNemo/sample02_f32le.raw",
    dtype=np.float32,
)
request = SpeechExtractorResult(
    session_id="container-update-check",
    speech_id=1,
    sequence_id=1,
    start_at=0,
    confirmed=True,
    voice=voice,
    voice_dtype="float32",
    voice_sample_bytes=4,
)
with connect(
    "ws://127.0.0.1:8003/api/v1/SpeechRecognizer/recognize",
    open_timeout=30,
    close_timeout=5,
) as websocket:
    websocket.send(request.to_msgpack())
    result = SpeechRecognizerResult.from_msgpack(websocket.recv(timeout=120))
    assert result.confirmed
    assert result.result
    assert result.result[0][0]
    # reason: 検証用の同梱音声の認識結果を標準出力へ表示する。
    print(result.result)
