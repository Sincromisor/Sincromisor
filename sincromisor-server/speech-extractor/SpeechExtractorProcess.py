import logging
import logging.config
import traceback
from logging import Logger
from threading import Event

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from setproctitle import setproctitle
from sincro_config import ServiceDiscoveryReporter, SincromisorLoggerConfig
from sincro_models import SpeechExtractorInitializeRequest
from speech_extractor.models import SpeechExtractorProcessArgument
from speech_extractor.SpeechExtractor import SpeechExtractorWorker

setproctitle("SPExtractor")

args: SpeechExtractorProcessArgument = SpeechExtractorProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True),
)


class SpeechExtractorProcess:
    def __init__(self, args: SpeechExtractorProcessArgument):
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__logger.info("===== Starting SpeechExtractorProcess =====")
        self.__args: SpeechExtractorProcessArgument = args
        self.__sessions: int = 0

    def start(self):
        SpeechExtractorWorker.setup_model()
        app: FastAPI = FastAPI()
        event: Event = Event()
        self.sd_reporter: ServiceDiscoveryReporter = ServiceDiscoveryReporter(
            worker_type="SpeechExtractor",
            consul_host=self.__args.consul_agent_host,
            consul_port=self.__args.consul_agent_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
        )
        self.sd_reporter.start()

        @app.get("/api/v1/SpeechExtractor/statuses")
        async def get_status() -> JSONResponse:
            return JSONResponse(
                {"worker_type": "SpeechExtractor", "sessions": self.__sessions}
            )

        @app.websocket("/api/v1/SpeechExtractor")
        async def websocket_chat_endpoint(
            ws: WebSocket, max_silence_ms: int = 600
        ) -> None:
            self.__logger.info(f"Connected Websocket - max_silence_ms={max_silence_ms}")
            self.__sessions += 1
            try:
                await ws.accept()
                pack = await ws.receive_bytes()
                speRequest = SpeechExtractorInitializeRequest.from_msgpack(pack=pack)
                speechExtractor = SpeechExtractorWorker(
                    session_id=speRequest.session_id,
                    voice_channels=speRequest.voice_channels,
                    voice_sampling_rate=speRequest.voice_sampling_rate,
                )
                await speechExtractor.extract(ws=ws, max_silence_ms=max_silence_ms)
            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}",
                )
            finally:
                self.__sessions -= 1
                try:
                    await ws.close()
                except RuntimeError:
                    self.__logger.warning(
                        "WebSocket is already closed.",
                    )

        try:
            uvicorn.run(app, host=self.__args.host, port=self.__args.port)
        except KeyboardInterrupt:
            pass
        finally:
            event.set()


if __name__ == "__main__":
    SpeechExtractorProcess(args=args).start()
