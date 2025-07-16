import subprocess as sp
import wave
from io import BytesIO
from subprocess import CompletedProcess

from sincro_models import (
    VoiceSynthesizerMora,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
    VoiceVoxAccentPhrase,
    VoiceVoxMora,
    VoiceVoxQuery,
)

from .VoiceVox import VoiceVox


class VoiceSynthesizer(VoiceVox):
    def __init__(self, host: str = "127.0.0.1", port: int = 50021):
        super().__init__(host=host, port=port)
        self.host: str = host
        self.port: int = port

    # テキストを元に音声を生成し、エンコード済み音声と母音タイミングデータをdictにまとめて返す。
    def generate(self, vs_request: VoiceSynthesizerRequest) -> VoiceSynthesizerResult:
        query: VoiceVoxQuery = self.audio_query(
            text=vs_request.message,
            style_id=vs_request.style_id,
        )
        query.prePhonemeLength = vs_request.pre_phoneme_length
        query.postPhonemeLength = vs_request.post_phoneme_length
        query = self.query_filter(query)
        wav: bytes = self.query_synthesis(query, style_id=vs_request.style_id)
        mora_list: list[VoiceSynthesizerMora] = self.__parse_phrases(query)
        sp_time: float = self.__wav_speaking_time(wav)
        enc_result: dict = self.encode(wav, vs_request.audio_format)
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

    # voiceをaudio_formatで指定された形式でエンコードする。
    # audio/aac、audio/ogg;codecs=opus、audio/wavのいずれか。
    # 実行にはfdkaacとopusencコマンドが必要。
    def encode(self, voice: bytes, audio_format: str | None) -> dict:
        encoder_p: CompletedProcess
        if audio_format == "audio/aac":
            encoder_p = sp.run(
                ["fdkaac", "-S", "-m3", "-f2", "-o-", "-"],
                input=voice,
                capture_output=True,
                text=False,
                check=True,
            )
            return {"voice": encoder_p.stdout, "audio_format": "audio/aac"}
        if audio_format == "audio/ogg;codecs=opus":
            encoder_p = sp.run(
                ["opusenc", "-", "-"],
                input=voice,
                capture_output=True,
                text=False,
                check=True,
            )
            return {"voice": encoder_p.stdout, "audio_format": "audio/ogg;codecs=opus"}
        return {"voice": voice, "audio_format": "audio/wav"}

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
