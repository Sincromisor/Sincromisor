"""共通JSONL設定でHTTP状態確認と音声パイプラインのWebSocket境界を起動する。"""

import asyncio
import logging
import logging.config
from functools import partial
from logging import Logger
from threading import Event

import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
from setproctitle import setproctitle
from sincro_config import (
    ServiceDescription,
    ServiceDiscoveryReferrer,
    ServiceDiscoveryReporter,
    SincromisorLoggerConfig,
)
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult
from speech_recognizer_nemo.models import SpeechRecognizerNemoProcessArgument
from speech_recognizer_nemo.recognizer_execution import RecognizerExecution
from speech_recognizer_nemo.SpeechRecognizerNemo import SpeechRecognizerNemoWorker
from speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerS3Client import (
    SpeechRecognizerS3Client,
)
from starlette.websockets import WebSocketState

setproctitle("SPRecognizer")
args: SpeechRecognizerNemoProcessArgument = (
    SpeechRecognizerNemoProcessArgument.argparse()
)
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True),
)


class SpeechRecognizerNemoProcess:
    """サービス発見と接続数を管理し、接続処理の失敗を本文なしで記録する。"""

    def __init__(self, args: SpeechRecognizerNemoProcessArgument) -> None:
        """検証済み起動設定を保持し、接続数を初期化する。"""
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__logger.info("===== Starting SpeechRecognizerNemoProcess =====")
        self.__args: SpeechRecognizerNemoProcessArgument = args
        self.__sessions: int = 0

    def start(self) -> None:
        """発見登録後にAPIを起動し、Uvicornでも共通ログ設定を維持する。"""
        if not self.__args.consul_agent_host or not self.__args.consul_agent_port:
            raise RuntimeError(
                "Consul agent is not set. Service discovery will not be available.",
            )

        self.sd_referrer: ServiceDiscoveryReferrer = ServiceDiscoveryReferrer(
            consul_agent_host=self.__args.consul_agent_host,
            consul_agent_port=self.__args.consul_agent_port,
        )
        app: FastAPI = FastAPI()
        event: Event = Event()
        self.sd_reporter: ServiceDiscoveryReporter = ServiceDiscoveryReporter(
            worker_type="SpeechRecognizer",
            consul_host=self.__args.consul_agent_host,
            consul_port=self.__args.consul_agent_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
        )
        self.sd_reporter.start()

        @app.get("/api/v1/SpeechRecognizer/statuses")
        async def get_status() -> JSONResponse:
            """監視へ処理種別と現在の接続数だけを返す。"""
            return JSONResponse(
                {"worker_type": "SpeechRecognizer", "sessions": self.__sessions}
            )

        @app.websocket("/api/v1/SpeechRecognizer/recognize")
        async def websocket_chat_endpoint(ws: WebSocket) -> None:
            """接続単位の診断と後始末を所有し、要求処理の主原因を保持する。"""
            # 本文を持つ要求の処理はワーカーへ委ね、ここでは接続の生存期間を管理する。
            diagnostic = WebSocketDiagnostics(self.__logger)
            diagnostic.start()
            self.__sessions += 1
            s3_client: SpeechRecognizerS3Client | None = None
            try:
                s3_description: ServiceDescription | None = (
                    self.sd_referrer.get_random_worker(worker_type="SincroS3")
                )
                if (
                    s3_description is not None
                    and self.__args.s3_access_key
                    and self.__args.s3_secret_key
                ):
                    s3_client = SpeechRecognizerS3Client(
                        s3_host=s3_description.service_address,
                        s3_port=s3_description.service_port,
                        access_key=self.__args.s3_access_key,
                        secret_key=self.__args.s3_secret_key,
                    )
                with diagnostic.operation("accept"):
                    await ws.accept()
                current_speech_id = -1
                current_speech_buffer = np.empty(0, dtype=np.int16)
                used_samples = 0
                while True:
                    with diagnostic.operation("receive"):
                        pack = await ws.receive_bytes()
                    if not pack:
                        break
                    with diagnostic.operation("decode"):
                        extractor_result = SpeechExtractorResult.from_msgpack(pack)
                    diagnostic.ids = {
                        "session_id": extractor_result.session_id,
                        "speech_id": extractor_result.speech_id,
                        "sequence_id": extractor_result.sequence_id,
                    }
                    with diagnostic.operation("process"):
                        if current_speech_id != extractor_result.speech_id:
                            current_speech_id = extractor_result.speech_id
                            used_samples = 0
                        needed = used_samples + extractor_result.voice.size
                        if needed > current_speech_buffer.size:
                            # 容量不足時だけ倍増し、発話内の使用済み音声を移す。
                            expanded = np.empty(
                                max(needed, current_speech_buffer.size * 2),
                                dtype=np.int16,
                            )
                            expanded[:used_samples] = current_speech_buffer[
                                :used_samples
                            ]
                            current_speech_buffer = expanded
                        # 初回も受信bytesを参照せず、認識へ書込み可能な連続配列を渡す。
                        np.copyto(
                            current_speech_buffer[used_samples:needed],
                            extractor_result.voice,
                            casting="no",
                        )
                        used_samples = needed
                        extractor_result.voice = current_speech_buffer[:used_samples]
                        with diagnostic.operation("process"):
                            result: SpeechRecognizerResult = (
                                await speech_recognizer.recognize(
                                    spe_result=extractor_result, s3_client=s3_client
                                )
                            )
                    with diagnostic.operation("send"):
                        await ws.send_bytes(result.to_msgpack())
            except asyncio.CancelledError as error:
                diagnostic.finish(error)
                raise
            except Exception as error:  # noqa: BLE001  # reason: 接続境界で安全な原因を記録し、他接続へ例外を波及させない。
                diagnostic.finish(error)
            else:
                diagnostic.finish()
            finally:
                if s3_client is not None:
                    try:
                        s3_client.close()
                    except Exception as error:  # noqa: BLE001  # reason: 接続境界で安全な原因を記録し、他接続へ例外を波及させない。
                        diagnostic.cleanup_failed(error)
                self.__sessions -= 1
                # 切断済みの接続は再度closeせず、後始末の失敗も主原因と別に記録する。
                if (
                    ws.client_state != WebSocketState.DISCONNECTED
                    and ws.application_state != WebSocketState.DISCONNECTED
                ):
                    try:
                        await ws.close()
                    except Exception as error:  # noqa: BLE001  # reason: 接続境界で安全な原因を記録し、他接続へ例外を波及させない。
                        diagnostic.cleanup_failed(error)

        speech_recognizer = RecognizerExecution(
            partial(
                SpeechRecognizerNemoWorker,
                voice_log_dir=self.__args.voice_log_dir,
                proper_noun_enable=self.__args.proper_noun_enable,
                proper_noun_dict_path=self.__args.proper_noun_dict_path,
                proper_noun_context_biasing_enable=self.__args.proper_noun_context_biasing_enable,
                proper_noun_context_biasing_beam_size=self.__args.proper_noun_context_biasing_beam_size,
                proper_noun_nbest_enable=self.__args.proper_noun_nbest_enable,
                proper_noun_nbest_beam_size=self.__args.proper_noun_nbest_beam_size,
            )
        )
        try:
            uvicorn.run(
                app, host=self.__args.host, port=self.__args.port, log_config=None
            )
        except KeyboardInterrupt:
            pass
        finally:
            event.set()
            speech_recognizer.close()


if __name__ == "__main__":
    SpeechRecognizerNemoProcess(args=args).start()
