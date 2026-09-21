"""共通JSONL設定でHTTP状態確認と音声パイプラインのWebSocket境界を起動する。"""

import logging
import logging.config
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
        speech_recognizer = SpeechRecognizerNemoWorker(
            voice_log_dir=args.voice_log_dir,
            proper_noun_enable=args.proper_noun_enable,
            proper_noun_dict_path=args.proper_noun_dict_path,
            proper_noun_context_biasing_enable=args.proper_noun_context_biasing_enable,
            proper_noun_context_biasing_beam_size=args.proper_noun_context_biasing_beam_size,
            proper_noun_nbest_enable=args.proper_noun_nbest_enable,
            proper_noun_nbest_beam_size=args.proper_noun_nbest_beam_size,
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
            try:
                s3_client: SpeechRecognizerS3Client | None = None
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
                current_speech_buffer = np.zeros(0, dtype=np.int16)
                while pack := await ws.receive_bytes():
                    extractor_result = SpeechExtractorResult.from_msgpack(pack)
                    if current_speech_id != extractor_result.speech_id:
                        current_speech_id = extractor_result.speech_id
                        # voiceのndarrayのフラグwriteableをtrueにしないと、
                        # torch.from_numpy()で下記の警告が出る。
                        # 一旦copy()しないとwriteableにできない点にも注意。
                        # (copy()すると自動的にwritableになる)
                        # UserWarning: The given NumPy array is not writable,
                        # and PyTorch does not support non-writable tensors.
                        # ~~~
                        # (Triggered internally at ../torch/csrc/utils/tensor_numpy.cpp:206.)
                        current_speech_buffer = extractor_result.voice.copy()
                    else:
                        current_speech_buffer = np.append(
                            current_speech_buffer,
                            extractor_result.voice,
                        )
                        extractor_result.voice = current_speech_buffer
                    result: SpeechRecognizerResult = speech_recognizer.recognize(
                        spe_result=extractor_result, s3_client=s3_client
                    )
                    await ws.send_bytes(result.to_msgpack())
            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception:
                self.__logger.exception("WebSocket processing failed.")
            finally:
                self.__sessions -= 1
                try:
                    await ws.close()
                except RuntimeError:
                    self.__logger.warning(
                        "WebSocket is already closed.",
                    )

        try:
            uvicorn.run(
                app, host=self.__args.host, port=self.__args.port, log_config=None
            )
        except KeyboardInterrupt:
            pass
        finally:
            event.set()


if __name__ == "__main__":
    SpeechRecognizerNemoProcess(args=args).start()
