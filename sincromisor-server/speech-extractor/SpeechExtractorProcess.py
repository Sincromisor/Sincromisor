import logging
import logging.config
from logging import Logger
from setproctitle import setproctitle
from sincro_config import SincromisorLoggerConfig, KeepAliveReporter
from speech_extractor.models import SpeechExtractorProcessArgument

setproctitle(f"SPExtractor")

args: SpeechExtractorProcessArgument = SpeechExtractorProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True)
)


import traceback
from threading import Event
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from sincro_models import SpeechExtractorInitializeRequest
from speech_extractor.SpeechExtractor import SpeechExtractorWorker


class SpeechExtractorProcess:
    def __init__(self, args: SpeechExtractorProcessArgument):
        self.__logger: Logger = logging.getLogger("sincro." + __name__)
        self.__logger.info("===== Starting SpeechExtractorProcess =====")
        self.__args: SpeechExtractorProcessArgument = args

    def start(self):
        SpeechExtractorWorker.setup_model()
        app: FastAPI = FastAPI()
        event: Event = Event()
        self.keepalive_t: KeepAliveReporter = KeepAliveReporter(
            event=event,
            redis_host=self.__args.redis_host,
            redis_port=self.__args.redis_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
            worker_type="SpeechExtractor",
            interval=5,
        )
        self.keepalive_t.start()

        @app.websocket("/SpeechExtractor")
        async def websocket_chat_endpoint(ws: WebSocket):
            self.__logger.info("Connected Websocket.")
            try:
                await ws.accept()
                pack = await ws.receive_bytes()
                speRequest = SpeechExtractorInitializeRequest.from_msgpack(pack=pack)
                speechExtractor = SpeechExtractorWorker(
                    session_id=speRequest.session_id,
                    voice_channels=speRequest.voice_channels,
                    voice_sampling_rate=speRequest.voice_sampling_rate,
                )
                await speechExtractor.extract(ws=ws, max_silence_ms=600)
            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}"
                )
                await ws.close()

        try:
            uvicorn.run(app, host=self.__args.host, port=self.__args.port)
        except KeyboardInterrupt:
            pass
        finally:
            event.set()
            self.keepalive_t.join()


if __name__ == "__main__":
    SpeechExtractorProcess(args=args).start()
