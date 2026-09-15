import logging
import logging.config
from logging import Logger
from threading import Event

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from setproctitle import setproctitle
from sincro_config import ServiceDiscoveryReporter, SincromisorLoggerConfig
from text_processor.mastra_worker import MastraTextProcessorWorker
from text_processor.models import TextProcessorProcessArgument
from text_processor.TextProcessor import (
    PokeTextProcessorWorker,
    TextProcessorWorker,
)

setproctitle("TextProcessor")

args: TextProcessorProcessArgument = TextProcessorProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True),
)


class TextProcessorProcess:
    """TextProcessorのHTTP入口と、接続ごとの処理担当を組み立てる。"""

    def __init__(self, args: TextProcessorProcessArgument) -> None:
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__logger.info("===== Starting TextProcessorProcess =====")
        self.__args: TextProcessorProcessArgument = args
        self.__sessions: int = 0

    def start(self) -> None:
        """Consulへ登録して、chatとsincroのWebSocket入口を開始する。"""
        if not self.__args.consul_agent_host or not self.__args.consul_agent_port:
            raise RuntimeError(
                "Consul agent is not set. Service discovery will not be available.",
            )

        app: FastAPI = FastAPI()
        event: Event = Event()
        self.sd_reporter: ServiceDiscoveryReporter = ServiceDiscoveryReporter(
            worker_type="TextProcessor",
            consul_host=self.__args.consul_agent_host,
            consul_port=self.__args.consul_agent_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
        )
        self.sd_reporter.start()

        @app.get("/api/v1/TextProcessor/statuses")
        async def get_status() -> JSONResponse:
            return JSONResponse(
                {"worker_type": "TextProcessor", "sessions": self.__sessions}
            )

        @app.websocket("/api/v1/TextProcessor/chat")
        async def websocket_chat_endpoint(ws: WebSocket) -> None:
            self.__logger.info("Connected Websocket - chat")
            self.__sessions += 1
            try:
                text_worker: TextProcessorWorker
                await ws.accept()
                # sincro単独の起動を維持するため、Mastra設定はchat接続時だけ拒否する。
                if self.__args.mastra_token:
                    text_worker = MastraTextProcessorWorker(
                        base_url=self.__args.mastra_url,
                        api_key=self.__args.mastra_token,
                        agent_id=self.__args.mastra_agent_id,
                    )
                    await text_worker.communicate(ws=ws)
                else:
                    raise RuntimeError(
                        "Mastra token is required for chat mode.",
                    )
            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception:
                self.__logger.exception("Chat WebSocket processing failed.")
            finally:
                self.__sessions -= 1
                try:
                    await ws.close()
                except RuntimeError:
                    self.__logger.warning(
                        "WebSocket is already closed.",
                    )

        @app.websocket("/api/v1/TextProcessor/sincro")
        async def websocket_sincro_endpoint(ws: WebSocket) -> None:
            self.__logger.info("Connected Websocket - sincro")
            self.__sessions += 1
            try:
                text_worker: TextProcessorWorker
                await ws.accept()
                text_worker = PokeTextProcessorWorker()
                await text_worker.communicate(ws=ws)
            except WebSocketDisconnect:
                self.__logger.info("Disconnected WebSocket.")
            except Exception:
                self.__logger.exception("Sincro WebSocket processing failed.")
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
    TextProcessorProcess(args=args).start()
