import logging
import wave
from collections.abc import Iterator
from contextlib import contextmanager
from io import BytesIO
from time import perf_counter

from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import (
    VoiceSynthesizerMora,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
    VoiceVoxAccentPhrase,
    VoiceVoxMora,
    VoiceVoxQuery,
)
from sincro_models.audio_encoder import encode_audio

from .VoiceVox import VoiceVox


class VoiceSynthesizer(VoiceVox):
    """VOICEVOXの生成結果を音声とモーラ時刻へ整え、指定形式へ変換する。"""

    def __init__(self, host: str = "127.0.0.1", port: int = 50021) -> None:
        """共有HTTP処理へ接続先を渡す。初期化時には通信しない。"""
        super().__init__(host=host, port=port)
        self.host: str = host
        self.port: int = port

    @contextmanager
    def __operation(self, stage: str, ids: dict[str, object]) -> Iterator[None]:
        """生成の一段階を計測する。失敗原因は値を文字列化せず、例外をそのまま返す。"""
        started = perf_counter()
        fields: dict[str, object] = {
            "event": "synthesis_operation",
            **ids,
            "stage": stage,
            "outcome": "success",
        }
        try:
            yield
        except Exception as error:
            fields.update(failure_fields(error), outcome="failed")
            if isinstance(error, self.ProtocolError):
                fields.update(http_status=error.status_code, reason="http_failure")
            raise
        finally:
            fields["duration_ms"] = (perf_counter() - started) * 1000
            logging.getLogger("sincro.VoiceSynthesizer").log(
                logging.WARNING if fields["outcome"] == "failed" else logging.INFO,
                fields,
            )

    def generate(
        self,
        vs_request: VoiceSynthesizerRequest,
        *,
        diagnostic_ids: dict[str, object] | None = None,
    ) -> VoiceSynthesizerResult:
        """クエリ、WAVと時刻、変換の順に生成する。診断IDは音声・保存形式へ含めない。"""
        ids = diagnostic_ids or {"speech_id": vs_request.speech_id}
        with self.__operation("audio_query", ids):
            query: VoiceVoxQuery = self.audio_query(
                text=vs_request.message,
                style_id=vs_request.style_id,
            )
            query.prePhonemeLength = vs_request.pre_phoneme_length
            query.postPhonemeLength = vs_request.post_phoneme_length
            query = self.query_filter(query)
        with self.__operation("synthesis", ids):
            wav: bytes = self.query_synthesis(query, style_id=vs_request.style_id)
            mora_list: list[VoiceSynthesizerMora] = self.__parse_phrases(query)
            sp_time: float = self.__wav_speaking_time(wav)
        with self.__operation("encode", ids):
            enc_result: dict = self.encode(
                wav, vs_request.audio_format, speech_id=vs_request.speech_id
            )
        return VoiceSynthesizerResult(
            # 元となったメッセージテキスト
            message=vs_request.message,
            # メッセージテキストから生成された音声クエリ
            query=query,
            # クエリをモーラごとに時系列で並べたもの
            mora_queue=mora_list,
            # 音声データの再生時間(s)
            speaking_time=sp_time,
            # 音声データ(エンコード済み)
            voice=enc_result["voice"],
            # 音声データフォーマット(audio/aac, audio/ogg;codecs=opus, audio/wavのいずれか)
            audio_format=enc_result["audio_format"],
        )

    def encode(
        self, voice: bytes, audio_format: str | None, *, speech_id: int | None = None
    ) -> dict[str, object]:
        """指定形式のエンコーダーを一度起動する。WAVは変換せず、失敗時は安全な診断を残す。"""
        if audio_format == "audio/aac":
            command = ["fdkaac", "-S", "-m3", "-f2", "-o-", "-"]
        elif audio_format == "audio/ogg;codecs=opus":
            command = ["opusenc", "-", "-"]
        else:
            return {"voice": voice, "audio_format": "audio/wav"}
        return {
            "voice": encode_audio(command, voice, {"speech_id": speech_id}),
            "audio_format": audio_format,
        }

    # フレーズの間隔を指定した秒数で上書きする。
    def query_filter(self, query: VoiceVoxQuery, sec: float = 0.1) -> VoiceVoxQuery:
        pidx = 0
        while pidx < len(query.accent_phrases):
            if query.accent_phrases[pidx].pause_mora:
                pm: VoiceVoxMora | None = query.accent_phrases[pidx].pause_mora
                assert pm is not None, "pause_mora should not be None"
                pm.vowel_length = sec
            pidx += 1
        return query

    # audio_queryで得られたクエリのaccent_phrasesから、
    # モーラとその長さを時系列に抽出し、リストの形で返す。
    # また、音声前後の無音時間も考慮する。
    # 音声データの長さは
    #   prePhonemeLength + accent_phrasesのmoraの長さ + postPhonemeLength
    # に近い値となるはず(完全には一致しない模様)。
    def __parse_phrases(self, query: VoiceVoxQuery) -> list[VoiceSynthesizerMora]:
        mora_list = []

        # 音声前の無音時間
        mora_list.append(
            VoiceSynthesizerMora(vowel=None, length=query.prePhonemeLength, text=None)
        )

        # クエリからフレーズをひとつずつ取り出す。
        # 【例】
        #  おはようございます。今日もいい天気ですね。
        #  "おはようございます。", "今日も", "いい", "天気ですね。" に分割されている。
        phrase: VoiceVoxAccentPhrase
        for phrase in query.accent_phrases:
            mora_list += self.__parse_phrase(phrase)

        # 音声後の無音時間
        mora_list.append(
            VoiceSynthesizerMora(vowel=None, length=query.prePhonemeLength, text=None)
        )
        return mora_list

    # 各フレーズからモーラの長さと母音を抽出し、リストの形で返す。
    def __parse_phrase(
        self, phrase: VoiceVoxAccentPhrase
    ) -> list[VoiceSynthesizerMora]:
        m_queue = []
        # print(phrase)
        # フレーズ中のモーラをひとつずつ取り出す。
        mora: VoiceVoxMora
        for mora in phrase.moras:
            mo: VoiceSynthesizerMora = VoiceSynthesizerMora(
                vowel=None, length=0, text=mora.text
            )
            if mora.vowel_length:
                mo.vowel = mora.vowel
                mo.length += mora.vowel_length
            if mora.consonant_length:
                mo.length += mora.consonant_length
            m_queue.append(mo)

        # フレーズ末尾の休止。
        # フレーズごとに1回のみ存在する。
        # 無い場合はphrase["pause_mora"]はNoneが入っている。
        if phrase.pause_mora:
            mo: VoiceSynthesizerMora = VoiceSynthesizerMora(
                vowel=None, length=0, text=None
            )
            if phrase.pause_mora.vowel_length:
                mo.length += phrase.pause_mora.vowel_length
            if phrase.pause_mora.consonant_length:
                mo.length += phrase.pause_mora.consonant_length
            m_queue.append(mo)
        return m_queue

    # wavファイルの再生時間を計算する。
    def __wav_speaking_time(self, wav: bytes) -> float:
        with wave.open(BytesIO(wav), "rb") as w:
            return w.getnframes() / w.getframerate()
