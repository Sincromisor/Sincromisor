import logging
import logging.config
import os
from logging import Logger
from threading import Event

import uvicorn
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from setproctitle import setproctitle
from sincro_config import KeepAliveReporter, SincromisorConfig, SincromisorLoggerConfig
from sincro_rtc.models import RTCSessionOffer, SincromisorProcessArgument
from sincro_rtc.RTCSession import RTCSessionManager

if os.environ.get("SINCROMISOR_MODE") == "development":
    import tracemalloc

    from sincro_rtc.utils import MemoryProfiler

    tracemalloc.start()
    mem = MemoryProfiler()

setproctitle("Sincromisor")

args: SincromisorProcessArgument = SincromisorProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True)
)


# from starlette.middleware.cors import CORSMiddleware


class SincromisorProcess:
    def __init__(self, args: SincromisorProcessArgument):
        self.__logger: Logger = logging.getLogger("sincro." + __name__)
        self.__logger.info("===== Starting SincromisorProcess =====")
        self.__args: SincromisorProcessArgument = args

    def start(self):
        rtcSM = RTCSessionManager(
            redis_host=self.__args.redis_host, redis_port=self.__args.redis_port
        )
        app = FastAPI(on_shutdown=[rtcSM.shutdown])
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

        self.keepalive_t: KeepAliveReporter = KeepAliveReporter(
            event=event,
            redis_host=self.__args.redis_host,
            redis_port=self.__args.redis_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
            worker_type="Sincromisor",
            interval=5,
        )
        self.keepalive_t.start()

        @app.post("/api/v1/rtc/offer")
        async def app_offer(request: Request, offer_params: RTCSessionOffer):
            rtcSM.cleanup_sessions()
            if rtcSM.session_count() > self.__args.max_sessions:
                res = JSONResponse({"error": "Too many requests."})
                res.status_code = status.HTTP_429_TOO_MANY_REQUESTS
                return res

            session_info = rtcSM.create_session(offer=offer_params)
            self.__logger.info(
                f"Client: {request.client}\n"
                + f"RequestHeaders: {request.headers}\n"
                + f"OfferSDP:\n{offer_params.sdp}\n"
                + f"ResponseSDP:\n{session_info['sdp']}"
            )
            return JSONResponse(session_info)

        @app.get("/api/v1/cleanup")
        def app_cleanup(request: Request):
            result = rtcSM.cleanup_sessions()
            return JSONResponse({"status": True, "running": result})

        @app.get("/api/v1/rtc/config.json")
        def app_config_ice_servers(request: Request):
            config = SincromisorConfig.from_yaml()
            ice_servers = []
            for ice_server in config.get_all_ice_servers_conf():
                ice_servers.append(ice_server.to_lowerkeys())
            return JSONResponse(
                {"offerURL": "/api/v1/rtc/offer", "iceServers": ice_servers}
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
            self.keepalive_t.join()


if __name__ == "__main__":
    SincromisorProcess(args=args).start()
