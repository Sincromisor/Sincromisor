"""実Engineの先頭転送量を再現し、HTTP読取りが次区間を待たない境界を確認する。"""

import io
import wave
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Event, Thread

import pytest
from test_streaming_audio import query
from voice_synthesizer.VoiceSynthesizer.VoiceVox import VoiceVox
from voice_synthesizer.wav_stream import iter_pcm


@pytest.mark.parametrize(
    ("first_samples", "early_chunks"), [(13280, 1), (18260, 2), (19920, 3)]
)
def test_http_first_segment_before_next_generation(first_samples, early_chunks):
    # 実Engineの28/38/40フレームを24→48kHz変換した先頭長。
    # Content-Lengthではヘッダーも9600byte読取へ含まれる。
    pcm = b"\1\0" * 30000
    wav = io.BytesIO()
    with wave.open(wav, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(48000)
        output.writeframes(pcm)
    raw = wav.getvalue()
    release = Event()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            assert "segment_length=0.43" in self.path
            self.rfile.read(int(self.headers["Content-Length"]))
            self.send_response(200)
            self.send_header("Content-Length", str(len(raw)))
            self.end_headers()
            boundary = 44 + first_samples * 2
            self.wfile.write(raw[:boundary])
            self.wfile.flush()
            assert release.wait(5)
            self.wfile.write(raw[boundary:])

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    serving = Thread(target=server.serve_forever)
    serving.start()
    client = VoiceVox(port=server.server_port)
    source = client.query_synthesis_stream(query(), 0, Event())
    iterator = iter_pcm(source)
    chunks = []
    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            try:
                for _ in range(early_chunks):
                    chunks.append(executor.submit(next, iterator).result(timeout=2))
                # 到着量が300msに達した40フレームだけがRTCを開始できる。
                assert sum(map(len, chunks)) == early_chunks * 9600
                waiting = executor.submit(next, iterator)
                with pytest.raises(TimeoutError):
                    waiting.result(timeout=0.05)
            finally:
                release.set()
            chunks.append(waiting.result(timeout=2))
        chunks.extend(iterator)
        assert b"".join(chunks) == pcm
    finally:
        release.set()
        source.close()
        client.close()
        server.shutdown()
        serving.join()
        server.server_close()
