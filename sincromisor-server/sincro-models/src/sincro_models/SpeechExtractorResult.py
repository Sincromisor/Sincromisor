import io
import subprocess as sp
import wave

import msgpack
import numpy as np
from pydantic import BaseModel, ConfigDict


class SpeechExtractorResult(BaseModel):
    # counter: ClassVar[int] = 0

    # np.ndarrayがメンバにいるとコケる問題対策
    model_config = ConfigDict(arbitrary_types_allowed=True)

    # セッションのID。接続している間は同じ値となる。
    session_id: str

    # 発話ごとに割り振られるID。
    # 最初の音声検知時に割り当てられ、
    # 発話が完了する(confirmedがTrueとなる)まで維持される。
    speech_id: int = 0

    # SpeechExtractorResultを送信するごとに割り振られるID。
    sequence_id: int = 0

    # 発話開始時の時刻(秒)。
    start_at: float

    # 発話が完了しているか否か。途中の場合はFalse。
    confirmed: bool = False

    # 音声データ。通常はint16_t, 16000Hz, 1chのndarrayとなる。
    voice: np.ndarray = np.zeros(0, dtype="int16")
    voice_dtype: str = "int16"
    voice_sampling_rate: int = 16000
    voice_sample_bytes: int = 2
    voice_channels: int = 1

    def append_voice(self, new_voice: np.ndarray):
        self.voice = np.append(self.voice, new_voice)
        return self.voice

    def cut_voice(self, target_sample: int) -> None:
        self.voice = self.voice[target_sample:]

    def clear_voice(self):
        self.voice = np.zeros(0, dtype=self.voice_dtype)

    @classmethod
    def from_msgpack(cls, pack: bytes) -> "SpeechExtractorResult":
        contents = msgpack.unpackb(pack)
        contents["voice"] = np.frombuffer(
            contents["voice"],
            dtype=contents["voice_dtype"],
        )
        return SpeechExtractorResult(**contents)

    def to_msgpack(self) -> bytes:
        return msgpack.packb(
            {
                "session_id": self.session_id,
                "speech_id": self.speech_id,
                "sequence_id": self.sequence_id,
                "start_at": self.start_at,
                "confirmed": self.confirmed,
                "voice": self.voice.tobytes(),
                "voice_dtype": self.voice_dtype,
                "voice_sampling_rate": self.voice_sampling_rate,
                "voice_sample_bytes": self.voice_sample_bytes,
                "voice_channels": self.voice_channels,
            },
        )

    def to_opus(self) -> bytes:
        enc_p = sp.run(
            [
                "opusenc",
                "--raw",
                "--raw-bits",
                str(self.voice_sample_bytes * 8),
                "--raw-rate",
                str(self.voice_sampling_rate),
                "--raw-chan",
                str(self.voice_channels),
                "-",
                "-",
            ],
            input=self.voice.tobytes(),
            capture_output=True,
            text=False,
            check=True,
        )
        return enc_p.stdout

    # voiceをopus形式でエンコードし、ファイルに書き出す。
    # 実行にはopusencコマンドが必要。
    def to_opusfile(self, path: str) -> None:
        opus: bytes = self.to_opus()
        with open(path, "wb") as opusfile:
            opusfile.write(opus)

    def to_wavfile(self, path: str) -> None:
        with wave.open(path, "wb") as wav:
            wav.setnchannels(self.voice_channels)
            wav.setsampwidth(self.voice_sample_bytes)
            wav.setframerate(self.voice_sampling_rate)
            wav.writeframes(self.voice.tobytes())
