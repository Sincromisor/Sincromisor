import logging
import logging.config
from logging import Logger
from setproctitle import setproctitle
from sincro_config import SincromisorLoggerConfig, KeepAliveReporter
from text_processor.models import TextProcessorProcessArgument

setproctitle(f"SPExtractor")

args: TextProcessorProcessArgument = TextProcessorProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True)
)


import traceback
from threading import Event
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from text_processor.TextProcessor import TextProcessorWorker


class TextProcessorProcess:
    def __init__(self, args: TextProcessorProcessArgument):
        self.__logger: Logger = logging.getLogger("sincro." + __name__)
        self.__logger.info("===== Starting TextProcessorProcess =====")
        self.__args: TextProcessorProcessArgument = args

    def start(self):
        app: FastAPI = FastAPI()
        event: Event = Event()
        self.keepalive_t: KeepAliveReporter = KeepAliveReporter(
            event=event,
            redis_host=self.__args.redis_host,
            redis_port=self.__args.redis_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
            worker_type="TextProcessor",
            interval=5,
        )
        self.keepalive_t.start()
        self.__worker: TextProcessorWorker = TextProcessorWorker()

        @app.websocket("/TextProcessor")
        async def websocket_chat_endpoint(ws: WebSocket):
            self.__logger.info("Connected Websocket.")
            try:
                await ws.accept()
                await self.__worker.communicate(ws=ws)
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
    TextProcessorProcess(args=args).start()
