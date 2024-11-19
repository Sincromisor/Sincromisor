import logging
import logging.config
import traceback
from logging import Logger
from threading import Event

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from setproctitle import setproctitle
from sincro_config import KeepAliveReporter, SincromisorLoggerConfig
from text_processor.models import TextProcessorProcessArgument
from text_processor.TextProcessor import (
    DifyTextProcessorWorker,
    PokeTextProcessorWorker,
    TextProcessorWorker,
)

setproctitle("TextProcessor")

args: TextProcessorProcessArgument = TextProcessorProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True),
)


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
        self.__poke_text_worker: TextProcessorWorker = PokeTextProcessorWorker()
        if self.__args.dify_url:
            self.__dify_text_worker: TextProcessorWorker = DifyTextProcessorWorker(
                base_url=self.__args.dify_url,
                api_key=self.__args.dify_token,
            )

        # talk_mode: chat, sincro
        # /TextProcessor?talk_mode=chat
        @app.websocket("/TextProcessor")
        async def websocket_chat_endpoint(ws: WebSocket, talk_mode: str | None):
            self.__logger.info("Connected Websocket.")
            try:
                await ws.accept()
                if self.__args.dify_url and talk_mode == "chat":
                    await self.__dify_text_worker.communicate(ws=ws)
                else:
                    await self.__poke_text_worker.communicate(ws=ws)

            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}",
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
