"""VOICEVOXの合成と音声変換を調停し、口形列の計算はmora_timingへ委ねる。"""

import logging
import wave
from collections.abc import Generator
from contextlib import contextmanager
from io import BytesIO
from threading import Event
from time import perf_counter, time_ns

from sincro_config.runtime_diagnostics import failure_fields
from sincro_models import (
    VoiceSynthesizerMora,
    VoiceSynthesizerRequest,
    VoiceSynthesizerResult,
    VoiceVoxQuery,
)
from sincro_models.audio_encoder import encode_audio
from voice_synthesizer.mora_timing import build_mora_queue
from voice_synthesizer.wav_stream import iter_pcm

from .VoiceVox import VoiceVox


class VoiceSynthesizer(VoiceVox):
    """VOICEVOXの生成結果を音声とモーラ時刻へ整え、指定形式へ変換する。"""

    def __init__(self, host: str = "127.0.0.1", port: int = 50021) -> None:
        """共有HTTP処理へ接続先を渡す。初期化時には通信しない。"""
        super().__init__(host=host, port=port)
        self.host: str = host
        self.port: int = port

    @contextmanager
    def __operation(self, stage: str, ids: dict[str, object]) -> Generator[None]:
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
        except (Exception, GeneratorExit) as error:
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
            mora_list: list[VoiceSynthesizerMora] = build_mora_queue(query)
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

    def generate_pcm(
        self,
        request: VoiceSynthesizerRequest,
        cancelled: Event,
        ids: dict[str, object],
    ) -> Generator[tuple[VoiceVoxQuery, bytes]]:
        """48kHz monoの区間を返し、全WAV検証後の時刻だけを安全な診断へ残す。"""
        with self.__operation("audio_query", ids):
            query = self.audio_query(request.message, request.style_id)
            query.prePhonemeLength = request.pre_phoneme_length
            query.postPhonemeLength = request.post_phoneme_length
            query.outputSamplingRate = 48_000
            query.outputStereo = False
            query = self.query_filter(query)
        if cancelled.is_set():
            raise InterruptedError("Synthesis cancelled")
        with self.__operation("streaming_synthesis", ids):
            parts = self.query_synthesis_stream(query, request.style_id, cancelled)
            try:
                for pcm in iter_pcm(parts):
                    yield query, pcm
            finally:
                parts.close()
        logging.getLogger("sincro.VoiceSynthesizer").info(
            {
                "event": "synthesis_engine_complete",
                "completed_unix_ns": time_ns(),
                **ids,
            }
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

    def query_filter(self, query: VoiceVoxQuery, sec: float = 0.1) -> VoiceVoxQuery:
        """合成前に句末休止の母音長を秒で上書きし、同じクエリを返す。"""
        for phrase in query.accent_phrases:
            if phrase.pause_mora is not None:
                phrase.pause_mora.vowel_length = sec
        return query

    def __wav_speaking_time(self, wav: bytes) -> float:
        """モーラ長の合計ではなく、生成WAVのフレーム数から再生秒数を求める。"""
        with wave.open(BytesIO(wav), "rb") as w:
            return w.getnframes() / w.getframerate()
