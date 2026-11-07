# ruff: noqa: N999  # reason: 既存の公開import名を維持する。
"""接続のPCM受信・VAD・送信を進め、休止時の終端推論だけを独立して待つ。"""

import asyncio
import logging
import time
from dataclasses import dataclass
from functools import partial
from pathlib import Path

import numpy as np
from fastapi import WebSocket
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from sincro_models import SpeechExtractorResult
from speech_extractor.endpoint_models import EndpointModels, VadMemory
from speech_extractor.model_assets import DEFAULT_MODEL_DIR
from speech_extractor.model_execution import ModelExecution
from speech_extractor.turn_state import TurnState


@dataclass(frozen=True)
class TurnPrediction:
    """推論が見た音声位置と結果。失敗は未完了とは別の状態で返す。"""

    token: tuple[int, int]
    probability: float | None
    elapsed_ms: float


class SpeechExtractorWorker:
    """共有モデルを借り、接続固有のVAD履歴・PCM・発話状態を所有する。"""

    models: EndpointModels
    vad_execution: ModelExecution
    turn_execution: ModelExecution

    def __init__(
        self, session_id: str, voice_channels: int = 1, voice_sampling_rate: int = 16000
    ) -> None:
        if voice_channels != 1 or voice_sampling_rate != 16000:
            raise ValueError("Extractor requires 16kHz mono PCM")
        self.session_id = session_id
        self.logger = logging.getLogger("sincro.SpeechExtractorWorker")
        self.memory = VadMemory()
        self.pending: asyncio.Task[TurnPrediction] | None = None

    @classmethod
    def setup_model(cls, directory: Path = DEFAULT_MODEL_DIR) -> None:
        """起動時にモデルを先にロードする。失敗したサービスを準備完了にしない。"""
        cls.models = EndpointModels(directory)
        cls.vad_execution = ModelExecution("speech-vad")
        cls.turn_execution = ModelExecution("speech-turn")

    @classmethod
    def close_model(cls) -> None:
        """接続タスク停止後、開始済み推論を回収してから共有モデルを解放する。"""
        cls.vad_execution.close()
        cls.turn_execution.close()
        del cls.models

    async def extract(
        self,
        ws: WebSocket,
        max_silence_ms: int = 600,
        diagnostic: WebSocketDiagnostics | None = None,
    ) -> None:
        """受信・状態更新・送信を接続のTaskGroupへ閉じ込め、どれかの失敗で全て終了する。"""
        self.diagnostic = diagnostic or WebSocketDiagnostics(self.logger)
        self.diagnostic.ids = {"session_id": self.session_id}
        state = TurnState(self.session_id, max_silence_ms)
        # 通常20ms入力を最大2秒、送信は最大32区間。過負荷で音声を捨てず接続を失敗させる。
        incoming: asyncio.Queue[bytes] = asyncio.Queue(maxsize=100)
        outgoing: asyncio.Queue[SpeechExtractorResult] = asyncio.Queue(maxsize=32)
        try:
            async with asyncio.TaskGroup() as group:
                group.create_task(self._receive(ws, incoming))
                group.create_task(self._send(ws, outgoing))
                group.create_task(self._consume(incoming, outgoing, state))
        finally:
            if self.pending is not None:
                self.pending.cancel()
                await asyncio.gather(self.pending, return_exceptions=True)
                self.pending = None

    async def _receive(self, ws: WebSocket, incoming: asyncio.Queue[bytes]) -> None:
        """RTCの20ms・s16leフレームだけを受理する。異常な大容量入力を蓄積しない。"""
        while True:
            with self.diagnostic.operation("receive"):
                frame = await ws.receive_bytes()
            with self.diagnostic.operation("decode"):
                if len(frame) != 640:
                    raise ValueError("Extractor PCM frame must contain 640 bytes")
                incoming.put_nowait(frame)
            # モックや溜まったWebSocket入力でも状態更新側を飢餓にしない。
            await asyncio.sleep(0)

    async def _send(
        self, ws: WebSocket, outgoing: asyncio.Queue[SpeechExtractorResult]
    ) -> None:
        """キュー順に差分を送る。遅い接続が音声処理を無制限に停止させないよう期限を設ける。"""
        while True:
            result = await outgoing.get()
            self.diagnostic.ids.update(
                speech_id=result.speech_id, sequence_id=result.sequence_id
            )
            with self.diagnostic.operation("send"):
                async with asyncio.timeout(5):
                    await ws.send_bytes(result.to_msgpack())

    async def _consume(
        self,
        incoming: asyncio.Queue[bytes],
        outgoing: asyncio.Queue[SpeechExtractorResult],
        state: TurnState,
    ) -> None:
        """20ms入力を欠落なく32msへ組み直す。終端結果は受信済み音声を処理した後だけ採用する。"""
        with self.diagnostic.operation("process"):
            remainder = np.empty(0, dtype=np.int16)
            while True:
                frame = np.frombuffer(await incoming.get(), dtype="<i2")
                remainder = np.concatenate((remainder, frame))
                while remainder.size >= 512:
                    pcm, remainder = remainder[:512].copy(), remainder[512:]
                    probability = await self.vad_execution.run(
                        partial(self.models.speech_probability, pcm, self.memory)
                    )
                    packet = state.feed(pcm, probability)
                    if packet is not None:
                        outgoing.put_nowait(packet)
                    # 受信済み音声が残る間は古い判定で確定しない。次のフレームで再開を先に検出する。
                    if incoming.empty() and remainder.size < 512:
                        self._endpoint(state, outgoing)
                    elif state.active and state.silence >= state.MAX_SILENCE:
                        self._finish(state, outgoing, "silence_limit")

    def _endpoint(
        self, state: TurnState, outgoing: asyncio.Queue[SpeechExtractorResult]
    ) -> None:
        """結果採用、無音上限、次推論の順に判断する。発話状態の更新はこのイベントループだけが行う。"""
        reason: str | None = None
        if self.pending is not None and self.pending.done():
            prediction = self.pending.result()
            self.pending = None
            accepted = state.accepts(prediction.token)
            self.logger.info(
                "Turn inference completed",
                extra={
                    "event": "turn_inference",
                    "session_id": self.session_id,
                    "speech_id": prediction.token[0],
                    "sample_offset": state.position,
                    "accepted": accepted,
                    "probability": prediction.probability,
                    "elapsed_ms": prediction.elapsed_ms,
                },
            )
            if accepted:
                if prediction.probability is None:
                    reason = "inference_failed"
                elif prediction.probability > 0.5:
                    reason = "model_complete"
        if state.active and state.silence >= state.MAX_SILENCE:
            reason = "silence_limit"
        if reason is not None:
            self._finish(state, outgoing, reason)
        # 古い実行中要求も1接続1件まで。再開後の候補は完了回収後に投入する。
        if self.pending is None:
            candidate = state.candidate()
            if candidate is not None:
                token, audio = candidate
                self.pending = asyncio.create_task(self._predict(token, audio))

    def _finish(
        self,
        state: TurnState,
        outgoing: asyncio.Queue[SpeechExtractorResult],
        reason: str,
    ) -> None:
        """確定理由とPCM位置を残し、送信は別タスクへ渡す。"""
        self.logger.info(
            "Speech endpoint confirmed",
            extra={
                "event": "speech_endpoint",
                "session_id": self.session_id,
                "speech_id": state.result.speech_id,
                "sample_offset": state.position,
                "reason": reason,
            },
        )
        outgoing.put_nowait(state.finish())

    async def _predict(
        self, token: tuple[int, int], audio: np.ndarray
    ) -> TurnPrediction:
        """Smart Turnだけの失敗は既存相当の無音確定へ縮退する。VADの失敗は伝播させる。"""
        started = time.monotonic()
        try:
            probability = await self.turn_execution.run(
                lambda: self.models.completion_probability(audio)
            )
        except Exception as error:  # noqa: BLE001  # reason: 外部推論境界の失敗を観測し、音声継続を無期限に待たせない。
            self.logger.warning(
                "Turn inference failed",
                extra={
                    "event": "turn_inference_failed",
                    "session_id": self.session_id,
                    "error_type": type(error).__name__,
                },
            )
            probability = None
        return TurnPrediction(token, probability, (time.monotonic() - started) * 1000)
