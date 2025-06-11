import logging
import logging.config
import os
from logging import Logger
from threading import Event

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from setproctitle import setproctitle
from sincro_config import (
    ServiceDiscoveryReporter,
    SincromisorConfig,
    SincromisorLoggerConfig,
)
from sincro_rtc.models import RTCSessionOffer, RTCSignalingServerArgument
from sincro_rtc.RTCSession import RTCSessionManager

if os.environ.get("SINCROMISOR_MODE") == "development":
    import tracemalloc

    from sincro_rtc.utils import MemoryProfiler

    tracemalloc.start()
    mem = MemoryProfiler()

setproctitle("RTCSignalingSv")

args: RTCSignalingServerArgument = RTCSignalingServerArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True),
)


# from starlette.middleware.cors import CORSMiddleware


class RTCSignalingServer:
    def __init__(self, args: RTCSignalingServerArgument):
        self.__logger: Logger = logging.getLogger("sincro." + self.__class__.__name__)
        self.__logger.info("===== Starting SincromisorProcess =====")
        self.__args: RTCSignalingServerArgument = args

    def start(self):
        rtcSM: RTCSessionManager = RTCSessionManager(
            consul_agent_host=self.__args.consul_agent_host,
            consul_agent_port=self.__args.consul_agent_port,
        )
        app: FastAPI = FastAPI(on_shutdown=[rtcSM.shutdown])
        """
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )
        """
        event: Event = Event()

        self.sd_reporter: ServiceDiscoveryReporter = ServiceDiscoveryReporter(
            worker_type="RTCSignalingServer",
            consul_host=self.__args.consul_agent_host,
            consul_port=self.__args.consul_agent_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
        )
        self.sd_reporter.start()

        @app.get("/api/v1/statuses")
        async def get_status() -> JSONResponse:
            if rtcSM.session_count() > self.__args.max_sessions:
                res = JSONResponse({"error": "Too many requests."})
                res.status_code = status.HTTP_429_TOO_MANY_REQUESTS
                return res
            return JSONResponse(
                {"worker_type": "RTCSignalingServer", "sessions": rtcSM.session_count()}
            )

        @app.post("/api/v1/RTCSignalingServer/offer")
        async def app_offer(request: Request, offer_params: RTCSessionOffer):
            rtcSM.cleanup_sessions()
            if rtcSM.session_count() > self.__args.max_sessions:
                res = JSONResponse({"error": "Too many requests."})
                res.status_code = status.HTTP_429_TOO_MANY_REQUESTS
                return res

            session_info = rtcSM.create_session(offer=offer_params)
            self.__logger.info(
                (
                    f"Client: {request.client}\n"
                    f"RequestHeaders: {request.headers}\n"
                    f"OfferSDP:\n{offer_params.sdp}\n"
                    f"ResponseSDP:\n{session_info['sdp']}",
                ),
            )
            return JSONResponse(session_info)

        @app.get("/api/v1/RTCSignalingServer/cleanup")
        def app_cleanup(request: Request):
            result = rtcSM.cleanup_sessions()
            return JSONResponse({"status": True, "running": result})

        @app.get("/api/v1/RTCSignalingServer/config.json")
        def app_config_ice_servers(request: Request):
            config = SincromisorConfig.from_yaml()
            ice_servers = []
            for ice_server in config.get_all_ice_servers_conf():
                ice_servers.append(ice_server.to_lowerkeys())
            return JSONResponse(
                {
                    "offerURL": "/api/v1/RTCSignalingServer/offer",
                    "iceServers": ice_servers,
                },
            )

        try:
            uvicorn.run(
                app,
                host=self.__args.host,
                port=self.__args.port,
                forwarded_allow_ips=self.__args.forwarded_allow_ips,
            )
        except KeyboardInterrupt:
            pass
        finally:
            event.set()


if __name__ == "__main__":
    RTCSignalingServer(args=args).start()
