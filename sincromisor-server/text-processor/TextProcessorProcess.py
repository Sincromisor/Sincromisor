"""共通JSONL設定でHTTP状態確認と音声パイプラインのWebSocket境界を起動する。"""

import asyncio
import logging
import logging.config
from logging import Logger
from threading import Event

import uvicorn
from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
from setproctitle import setproctitle
from sincro_config import ServiceDiscoveryReporter, SincromisorLoggerConfig
from sincro_config.websocket_diagnostics import WebSocketDiagnostics
from starlette.websockets import WebSocketState
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
    """HTTP入口と接続ごとの処理担当を組み立て、失敗を本文なしで記録する。"""

    def __init__(self, args: TextProcessorProcessArgument) -> None:
        """検証済み起動設定を保持し、接続数を初期化する。"""
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
            """監視へ処理種別と現在の接続数だけを返す。"""
            return JSONResponse(
                {"worker_type": "TextProcessor", "sessions": self.__sessions}
            )

        @app.websocket("/api/v1/TextProcessor/chat")
        async def websocket_chat_endpoint(ws: WebSocket) -> None:
            """接続単位の診断と後始末を所有し、要求処理の主原因を保持する。"""
            diagnostic = WebSocketDiagnostics(self.__logger)
            diagnostic.start()
            self.__sessions += 1
            try:
                text_worker: TextProcessorWorker
                with diagnostic.operation("accept"):
                    await ws.accept()
                # sincro単独の起動を維持するため、Mastra設定はchat接続時だけ拒否する。
                if self.__args.mastra_token:
                    text_worker = MastraTextProcessorWorker(
                        base_url=self.__args.mastra_url,
                        api_key=self.__args.mastra_token,
                        agent_id=self.__args.mastra_agent_id,
                    )
                    await text_worker.communicate(ws=ws, diagnostic=diagnostic)
                else:
                    raise RuntimeError(
                        "Mastra token is required for chat mode.",
                    )
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

        @app.websocket("/api/v1/TextProcessor/sincro")
        async def websocket_sincro_endpoint(ws: WebSocket) -> None:
            """sincro接続の診断と後始末を所有し、失敗を他接続へ波及させない。"""
            diagnostic = WebSocketDiagnostics(self.__logger)
            diagnostic.start()
            self.__sessions += 1
            try:
                text_worker: TextProcessorWorker
                with diagnostic.operation("accept"):
                    await ws.accept()
                text_worker = PokeTextProcessorWorker()
                await text_worker.communicate(ws=ws, diagnostic=diagnostic)
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

        try:
            uvicorn.run(
                app, host=self.__args.host, port=self.__args.port, log_config=None
            )
        except KeyboardInterrupt:
            pass
        finally:
            event.set()


if __name__ == "__main__":
    TextProcessorProcess(args=args).start()
