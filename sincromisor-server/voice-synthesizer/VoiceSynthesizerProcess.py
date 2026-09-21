"""共通JSONL設定でHTTP状態確認と音声パイプラインのWebSocket境界を起動する。"""

import logging
import logging.config
from logging import Logger
from threading import Event

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
from voice_synthesizer.models import VoiceSynthesizerProcessArgument
from voice_synthesizer.VoiceSynthesizer import VoiceSynthesizerWorker

setproctitle("VSynthesizer")

args: VoiceSynthesizerProcessArgument = VoiceSynthesizerProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True),
)


class VoiceSynthesizerProcess:
    """サービス発見と接続数を管理し、接続処理の失敗を本文なしで記録する。"""

    def __init__(self, args: VoiceSynthesizerProcessArgument) -> None:
        """検証済み起動設定を保持し、接続数を初期化する。"""
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__logger.info("===== Starting VoiceSynthesizerProcess =====")
        self.__args: VoiceSynthesizerProcessArgument = args
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
            worker_type="VoiceSynthesizer",
            consul_host=self.__args.consul_agent_host,
            consul_port=self.__args.consul_agent_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
        )
        self.sd_reporter.start()

        @app.get("/api/v1/VoiceSynthesizer/statuses")
        async def get_status() -> JSONResponse:
            """監視へ処理種別と現在の接続数だけを返す。"""
            return JSONResponse(
                {"worker_type": "VoiceSynthesizer", "sessions": self.__sessions}
            )

        @app.websocket("/api/v1/VoiceSynthesizer/synthesize")
        async def websocket_chat_endpoint(ws: WebSocket) -> None:
            # 本文を持つ要求の処理はワーカーへ委ね、ここでは接続の生存期間を管理する。
            self.__logger.info("Connected Websocket.")
            self.__sessions += 1
            try:
                redis_description: ServiceDescription | None = (
                    self.sd_referrer.get_random_worker(worker_type="SincroRedis")
                )
                if redis_description is None:
                    raise RuntimeError("No SincroRedis worker found.")
                s3_description: ServiceDescription | None = (
                    self.sd_referrer.get_random_worker(worker_type="SincroS3")
                )
                if s3_description is None:
                    raise RuntimeError("No SincroS3 worker found.")
                voicevox_description: ServiceDescription | None = (
                    self.sd_referrer.get_random_worker(worker_type="SincroVoiceVox")
                )
                if voicevox_description is None:
                    raise RuntimeError("No SincroVoiceVox worker found.")
                await ws.accept()
                voice_synthesizer = VoiceSynthesizerWorker(
                    voicevox_host=voicevox_description.service_address,
                    voicevox_port=voicevox_description.service_port,
                    voicevox_style_id=self.__args.voicevox_default_style_id,
                    redis_host=redis_description.service_address,
                    redis_port=redis_description.service_port,
                    s3_host=s3_description.service_address,
                    s3_port=s3_description.service_port,
                    s3_access_key=self.__args.s3_access_key,
                    s3_secret_key=self.__args.s3_secret_key,
                )
                await voice_synthesizer.communicate(ws=ws)
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
    VoiceSynthesizerProcess(args=args).start()
