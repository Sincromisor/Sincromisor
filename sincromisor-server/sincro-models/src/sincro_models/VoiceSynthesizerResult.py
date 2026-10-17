import msgpack
from pydantic import BaseModel

from .VoiceVoxQuery import VoiceVoxQuery


class VoiceSynthesizerMora(BaseModel):
    """合成音声の母音と継続秒数を保持し、口形の再生へ渡す。"""

    # a,i,u,e,o,N
    vowel: str | None = None
    length: float = 0.0
    text: str | None = None


class VoiceSynthesizerResult(BaseModel):
    """音声・クエリ・モーラ時刻を、キャッシュとRTCへの共通形式で保持する。"""

    # 発話ごとに割り振られるID。TextProcessorから引き継ぐ。
    # 音声を検知する度に割り当てられる。
    # 0以上の値が割り当てられる。-1は未割り当て。
    # RedisやS3上ではこの値は-1として記録される。
    # VoiceSynthesizerWorkerが、VoiceSynthesizerRequestの値と同じになるよう
    # 設定しなおした上でクライアントに返す。
    speech_id: int = -1
    # 元となったメッセージテキスト
    message: str
    # メッセージテキストから生成された音声クエリ
    query: VoiceVoxQuery
    # クエリをモーラごとに時系列で並べたもの
    mora_queue: list[VoiceSynthesizerMora]
    # 音声データの再生時間(s)
    speaking_time: float
    # 音声データ(エンコード済み)
    voice: bytes
    # 音声データフォーマット(audio/aac, audio/ogg;codecs=opus, audio/wavのいずれか)
    audio_format: str

    def to_msgpack(self) -> bytes:
        """入れ子モデルをPython値へ展開し、音声はバイナリのまま送信・保存する。"""
        pack = msgpack.packb(self.model_dump())
        assert isinstance(pack, bytes), "msgpack.packb returned non-bytes"
        return pack

    def to_json(self) -> str:
        """音声を除いた同じモデルを診断・表示用JSONへ変換する。"""
        return self.model_dump_json(exclude={"voice"})

    @classmethod
    def from_msgpack(cls, vpackage: bytes) -> VoiceSynthesizerResult:
        """クエリとモーラを検証して復元する。保存時に省略されたspeech_idは-1とする。"""
        return cls.model_validate(msgpack.unpackb(vpackage))
