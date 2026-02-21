import logging
import time
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from logging import Logger

import numpy as np
from fastapi import WebSocket
from mediapipe.tasks import python
from mediapipe.tasks.python import audio
from mediapipe.tasks.python.audio.audio_classifier import AudioClassifier
from mediapipe.tasks.python.components import containers
from sincro_models import SpeechExtractorResult


class SpeechExtractorWorker:
    classifier: AudioClassifier

    # 200ms程度を目安にVAD判定するための最小バッファ長(16kHz想定)。
    MIN_BUFFER_LENGTH_SAMPLES: int = 3200
    # 発話開始直前の欠けを抑えるため、待機中に保持する先行バッファ量。
    PRE_ROLL_MS: int = 500
    # YAMNetのSpeechカテゴリ判定閾値。
    SPEECH_SCORE_THRESHOLD: float = 0.6

    @dataclass
    class ExtractState:
        # 発話区間内かどうか。Falseの間はpre-rollを維持する。
        in_speech: bool = False
        # 発話中に連続で観測した無音時間(ms)。
        silence_ms: int = 0
        # 現在の発話区間を組み立てるワークバッファ。
        result: SpeechExtractorResult | None = None

    # セッション固有の音声フォーマット情報とログ出力を初期化する。
    def __init__(
        self,
        session_id: str,
        voice_channels: int = 1,
        voice_sampling_rate: int = 16000,
    ):
        self.logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.session_id: str = session_id
        self.voice_channels: int = voice_channels
        self.voice_sampling_rate: int = voice_sampling_rate
        self.voice_dtype: type = np.int16
        self.voice_np_dtype: np.dtype[np.int16] = np.dtype(np.int16)
        self.voice_sample_bytes: int = self.voice_np_dtype.itemsize
        self.voice_amplitude_max: int = int(np.iinfo(self.voice_np_dtype).max)
        self.logger.info("SpeechExtractorWorker is initialized.")

    # 共有利用するYAMNet分類器を1回だけロードする。
    @classmethod
    def setup_model(cls):
        base_options = python.BaseOptions(
            model_asset_path="assets/3rd_party/yamnet.tflite",
        )
        options = audio.AudioClassifierOptions(base_options=base_options, max_results=1)
        # これが実行された瞬間VSZが32TBになる。
        SpeechExtractorWorker.classifier: AudioClassifier = (
            audio.AudioClassifier.create_from_options(options)
        )

    # ===== Main flow =====
    # WebSocket受信ループを管理し、チャンク単位の処理を順次実行するエントリポイント。
    # 得た音声から音声が入っていそうな部分を抽出し、WebSocket経由で送信する。
    # 音声データはある程度の長さに分割されて送信される。
    # (最大で500ms + get_audio_bufferのサイズ分)
    async def extract(
        self,
        ws: WebSocket,
        max_silence_ms: int = 600,
    ):
        self.logger.info("Start Extractor.extract.")
        # extractはI/O制御に専念し、状態遷移は__process_audio_chunkへ委譲する。
        state = SpeechExtractorWorker.ExtractState(
            result=self.__new_result(),
        )

        async for mic_voice in self.__get_audio_buffer(ws):
            await self.__process_audio_chunk(
                ws=ws,
                state=state,
                mic_voice=mic_voice,
                max_silence_ms=max_silence_ms,
            )
        self.logger.info("End Extractor.extract.")

    # ===== Input buffering =====
    # WebSocket入力を一定長にバッファして、VAD判定しやすい粒度で返す。
    # 一度に得られるフレーム数はRTC側の実装依存のため、ここでバッファリングを行う。
    # 短すぎると音声検知や認識の負荷が高くなる上音声認識がエラーとなる場合もあるため、
    # ある程度(200ms、3200フレーム程度)は確保しておく。
    async def __get_audio_buffer(
        self,
        ws: WebSocket,
        min_buffer_length: int | None = None,
    ) -> AsyncGenerator[np.ndarray, None]:
        target_length = min_buffer_length or self.MIN_BUFFER_LENGTH_SAMPLES
        buffer: np.ndarray = np.zeros(0, dtype=self.voice_dtype)

        while True:
            np_frame: np.ndarray = np.frombuffer(
                await ws.receive_bytes(),
                dtype=self.voice_dtype,
            )
            buffer = np.append(buffer, np_frame)
            if buffer.size > target_length:
                # buffer = nr.reduce_noise(y=buffer, sr=self.voice_sampling_rate)
                yield buffer
                buffer = np.zeros(0, dtype=self.voice_dtype)

    # ===== Chunk processing =====
    # 1チャンク分の判定と状態遷移を実行し、必要ならExtractorResultを送信する。
    async def __process_audio_chunk(
        self,
        ws: WebSocket,
        state: "SpeechExtractorWorker.ExtractState",
        mic_voice: np.ndarray,
        max_silence_ms: int,
    ) -> None:
        assert state.result is not None
        # 1チャンク単位で「開始/継続/終端」の状態遷移を行う。
        has_speech: bool = self.__check_speech_exists(mic_voice)
        if has_speech:
            self.__start_speech(state)

        state.result.append_voice(mic_voice)
        if not state.in_speech:
            # まだ発話開始していないので、pre-rollのみ維持して待機する。
            self.__pre_roll(state)
            return

        if has_speech:
            # 発話中にSpeechを検知したチャンクは逐次送信する。
            await self.__emit_result(ws=ws, state=state, confirmed=False)
            return

        if len(state.result.voice) == 0:
            return

        # 発話中の無音継続を計測し、閾値到達で終端確定を送る。
        state.silence_ms += int((mic_voice.size / self.voice_sampling_rate) * 1000)
        if state.silence_ms >= max_silence_ms:
            await self.__emit_result(ws=ws, state=state, confirmed=True)

    # ===== VAD decision =====
    # YAMNet分類結果からSpeechカテゴリが閾値を超えるかを判定する。
    def __check_speech_exists(self, audio: np.ndarray) -> bool:
        audio_clip = containers.AudioData.create_from_array(
            audio.astype(float) / self.voice_amplitude_max,
            self.voice_sampling_rate,
        )
        try:
            classification_result_list: list[containers.ClassificationResult] = SpeechExtractorWorker.classifier.classify(
                audio_clip,
            )
        except Exception as e:
            self.logger.error(f"UnknownError: {repr(e)}")
            raise e
        for category in classification_result_list[0].classifications[0].categories:
            # self.logger.info(f"{self.session_id}: {category.category_name}({category.score})")
            if (
                category.category_name == "Speech"
                and category.score is not None
                and category.score > self.SPEECH_SCORE_THRESHOLD
            ):
                return True
        return False

    # ===== State and result helpers =====
    # Speech判定を契機に発話状態へ遷移し、無音カウンタをリセットする。
    def __start_speech(self, state: "SpeechExtractorWorker.ExtractState") -> None:
        assert state.result is not None
        # 既存実装と同等に、Speech判定が立つたびにstart_atを更新する。
        state.result.start_at = time.time()
        state.silence_ms = 0
        state.in_speech = True

    # 発話待機時に先行バッファ量を維持する(先頭欠け対策)。
    def __pre_roll(self, state: "SpeechExtractorWorker.ExtractState") -> None:
        assert state.result is not None
        # 発話待機中は最新500msのみ保持し、無音を際限なく蓄積しない。
        pre_roll_samples = int((self.voice_sampling_rate * self.PRE_ROLL_MS) / 1000)
        state.result.cut_voice(-pre_roll_samples)

    async def __emit_result(
        self,
        ws: WebSocket,
        state: "SpeechExtractorWorker.ExtractState",
        confirmed: bool,
    ) -> None:
        # 現在のresultを1パケットとして送信し、継続/終端に応じて状態を更新する。
        assert state.result is not None
        # 送信時点で確定したvoice/metadataをmsgpack化して下流へ渡す。
        self.__increment_sequence(state.result)
        state.result.confirmed = confirmed
        await ws.send_bytes(state.result.to_msgpack())
        state.result.clear_voice()
        if confirmed:
            self.__finish_speech(state)
        else:
            # 既存挙動: 非confirmed送信後は同一speech_idで継続蓄積する。
            state.result.confirmed = False

    # 送信順序管理用のsequence_idを1つ進める。
    def __increment_sequence(self, result: SpeechExtractorResult) -> None:
        # ExtractorResult送信単位で単調増加させる。
        result.sequence_id += 1

    # 発話終端確定後に、次発話へ向けた内部状態を初期化する。
    def __finish_speech(self, state: "SpeechExtractorWorker.ExtractState") -> None:
        assert state.result is not None
        # confirmed送信後に、次発話へ向けて区間メタ情報を初期化する。
        state.result.speech_id += 1
        state.result.start_at = -1
        state.result.confirmed = False
        state.in_speech = False
        state.silence_ms = 0

    # 抽出結果の初期テンプレートを生成する。
    def __new_result(self) -> SpeechExtractorResult:
        # 発話区間をまたいで使い回す、Extractor出力用のベースモデルを生成する。
        return SpeechExtractorResult(
            session_id=self.session_id,
            voice=np.zeros(0, dtype=self.voice_dtype),
            voice_sampling_rate=self.voice_sampling_rate,
            voice_sample_bytes=self.voice_sample_bytes,
            voice_channels=self.voice_channels,
            start_at=-1,
        )
