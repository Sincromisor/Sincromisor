"""共通JSONL設定でHTTP状態確認と音声パイプラインのWebSocket境界を起動する。"""

import asyncio
import logging
import logging.config
from functools import partial
from logging import Logger
from threading import Event

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
from speech_recognizer_nemo.models import SpeechRecognizerNemoProcessArgument
from speech_recognizer_nemo.recognition_connection import recognize_connection
from speech_recognizer_nemo.recognition_storage import RecognitionStorage
from speech_recognizer_nemo.recognition_storage_writer import RecognitionStorageWriter
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
            try:
                with diagnostic.operation("accept"):
                    await ws.accept()
                await recognize_connection(ws, speech_recognizer, diagnostic)
            except asyncio.CancelledError as error:
                diagnostic.finish(error)
                raise
            except Exception as error:  # noqa: BLE001  # reason: 接続境界で安全な原因を記録し、他接続へ例外を波及させない。
                diagnostic.finish(error)
            else:
                diagnostic.finish()
            finally:
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

        def create_s3() -> SpeechRecognizerS3Client | None:
            """保存専用スレッドから発見し、接続と独立したHTTPプールを生成する。"""
            description: ServiceDescription | None = self.sd_referrer.get_random_worker(
                worker_type="SincroS3"
            )
            if (
                description is None
                or not self.__args.s3_access_key
                or not self.__args.s3_secret_key
            ):
                return None
            return SpeechRecognizerS3Client(
                s3_host=description.service_address,
                s3_port=description.service_port,
                access_key=self.__args.s3_access_key,
                secret_key=self.__args.s3_secret_key,
            )

        storage = RecognitionStorage(
            RecognitionStorageWriter(self.__args.voice_log_dir, create_s3)
        )
        try:
            speech_recognizer = RecognizerExecution(
                partial(
                    SpeechRecognizerNemoWorker,
                    proper_noun_enable=self.__args.proper_noun_enable,
                    proper_noun_dict_path=self.__args.proper_noun_dict_path,
                    proper_noun_context_biasing_enable=self.__args.proper_noun_context_biasing_enable,
                    proper_noun_context_biasing_beam_size=self.__args.proper_noun_context_biasing_beam_size,
                    proper_noun_nbest_enable=self.__args.proper_noun_nbest_enable,
                    proper_noun_nbest_beam_size=self.__args.proper_noun_nbest_beam_size,
                ),
                storage=storage,
            )
        except BaseException:
            storage.close()
            raise
        try:
            uvicorn.run(
                app,
                host=self.__args.host,
                port=self.__args.port,
                log_config=None,
                ws_max_size=1 << 20,
            )
        except KeyboardInterrupt:
            pass
        finally:
            event.set()
            try:
                speech_recognizer.close()
            finally:
                storage.close()


if __name__ == "__main__":
    SpeechRecognizerNemoProcess(args=args).start()
