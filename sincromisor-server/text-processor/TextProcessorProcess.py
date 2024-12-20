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
        self.__sessions: int = 0

    def start(self):
        app: FastAPI = FastAPI()
        event: Event = Event()
        self.sd_reporter: ServiceDiscoveryReporter = ServiceDiscoveryReporter(
            worker_type="TextProcessor",
            consul_host=self.__args.consul_agent_host,
            consul_port=self.__args.consul_agent_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
        )
        self.sd_reporter.register()

        @app.get("/api/v1/statuses")
        async def get_status() -> JSONResponse:
            return JSONResponse({"sessions": self.__sessions})

        # talk_mode: chat, sincro
        # /TextProcessor?talk_mode=chat
        @app.websocket("/api/v1/TextProcessor")
        async def websocket_chat_endpoint(ws: WebSocket, talk_mode: str | None) -> None:
            self.__logger.info("Connected Websocket.")
            self.__sessions += 1
            try:
                text_worker: TextProcessorWorker
                await ws.accept()
                if self.__args.dify_url and talk_mode == "chat":
                    text_worker = DifyTextProcessorWorker(
                        base_url=self.__args.dify_url,
                        api_key=self.__args.dify_token,
                    )
                else:
                    text_worker = PokeTextProcessorWorker()
                await text_worker.communicate(ws=ws)
            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}",
                )
            finally:
                self.__sessions -= 1
                await ws.close()

        try:
            uvicorn.run(app, host=self.__args.host, port=self.__args.port)
        except KeyboardInterrupt:
            pass
        finally:
            event.set()


if __name__ == "__main__":
    TextProcessorProcess(args=args).start()
