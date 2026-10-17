"""共通JSONL設定でHTTP状態確認と音声パイプラインのWebSocket境界を起動する。"""

import logging
import logging.config
from functools import partial
from logging import Logger
from threading import Event

import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from setproctitle import setproctitle
from sincro_config import (
    ServiceDescription,
    ServiceDiscoveryReferrer,
    ServiceDiscoveryReporter,
    SincromisorLoggerConfig,
)
from sincro_models import SpeechExtractorResult, SpeechRecognizerResult
from speech_recognizer_nemo.models import SpeechRecognizerNemoProcessArgument
from speech_recognizer_nemo.recognizer_execution import RecognizerExecution
from speech_recognizer_nemo.SpeechRecognizerNemo import SpeechRecognizerNemoWorker
from speech_recognizer_nemo.SpeechRecognizerNemo.SpeechRecognizerS3Client import (
    SpeechRecognizerS3Client,
)

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
            # 本文を持つ要求の処理はワーカーへ委ね、ここでは接続の生存期間を管理する。
            self.__logger.info("Connected Websocket.")
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
                await ws.accept()
                current_speech_id = -1
                current_speech_buffer = np.empty(0, dtype=np.int16)
                used_samples = 0
                while pack := await ws.receive_bytes():
                    extractor_result = SpeechExtractorResult.from_msgpack(pack)
                    if current_speech_id != extractor_result.speech_id:
                        current_speech_id = extractor_result.speech_id
                        used_samples = 0
                    needed = used_samples + extractor_result.voice.size
                    if needed > current_speech_buffer.size:
                        # 容量不足時だけ倍増し、発話内の使用済み音声を移す。
                        expanded = np.empty(
                            max(needed, current_speech_buffer.size * 2), dtype=np.int16
                        )
                        expanded[:used_samples] = current_speech_buffer[:used_samples]
                        current_speech_buffer = expanded
                    # 初回も受信bytesを参照せず、認識へ書込み可能な連続配列を渡す。
                    np.copyto(
                        current_speech_buffer[used_samples:needed],
                        extractor_result.voice,
                        casting="no",
                    )
                    used_samples = needed
                    extractor_result.voice = current_speech_buffer[:used_samples]
                    result: SpeechRecognizerResult = await speech_recognizer.recognize(
                        spe_result=extractor_result, s3_client=s3_client
                    )
                    await ws.send_bytes(result.to_msgpack())
            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception:
                self.__logger.exception("WebSocket processing failed.")
            finally:
                if s3_client is not None:
                    s3_client.close()
                self.__sessions -= 1
                try:
                    await ws.close()
                except RuntimeError:
                    self.__logger.warning(
                        "WebSocket is already closed.",
                    )

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
