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
from sincro_rtc.models import (
    RTCSessionCandidate,
    RTCSessionOffer,
    RTCSignalingServerArgument,
)
from sincro_rtc.RTCSession import RTCSessionCapacityError, RTCSessionManager

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
            fallback_host=self.__args.fallback_host,
            fallback_port=self.__args.fallback_port,
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

        if self.__args.consul_agent_host and self.__args.consul_agent_port:
            self.sd_reporter: ServiceDiscoveryReporter = ServiceDiscoveryReporter(
                worker_type="RTCSignalingServer",
                consul_host=self.__args.consul_agent_host,
                consul_port=self.__args.consul_agent_port,
                public_bind_host=self.__args.public_bind_host,
                public_bind_port=self.__args.public_bind_port,
            )
            self.sd_reporter.start()
        else:
            self.__logger.warning("Service discovery reporter is disabled.")

        @app.get("/api/v1/RTCSignalingServer/statuses")
        async def get_status() -> JSONResponse:
            if rtcSM.session_count() > self.__args.max_sessions:
                res = JSONResponse({"error": "Too many requests."})
                res.status_code = status.HTTP_429_TOO_MANY_REQUESTS
                return res
            return JSONResponse(
                {"worker_type": "RTCSignalingServer", "sessions": rtcSM.session_count()}
            )

        @app.post("/api/v1/RTCSignalingServer/offer")
        def app_offer(request: Request, offer_params: RTCSessionOffer):
            # /offer 時点で寿命切れセッションを回収し、session_id更新可否の判定精度を上げる。
            rtcSM.cleanup_sessions()
            self.__logger.info(
                (
                    "Offer received: "
                    f"requested_session_id={offer_params.session_id}, "
                    f"talk_mode={offer_params.talk_mode}, "
                    f"client={request.client}"
                ),
            )
            try:
                session_info = rtcSM.create_or_update_session(
                    offer=offer_params,
                    max_sessions=self.__args.max_sessions,
                )
            except RTCSessionCapacityError:
                return JSONResponse(
                    {"error": "Too many requests."},
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                )
            except Exception as e:
                self.__logger.error(
                    (
                        "Failed to process offer request. "
                        f"session_id={offer_params.session_id}, error={repr(e)}"
                    ),
                )
                return JSONResponse(
                    {"error": "Failed to establish RTC session."},
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            assigned_session_id = session_info.get("session_id")
            if (
                offer_params.session_id
                and offer_params.session_id == assigned_session_id
            ):
                self.__logger.info(
                    f"Offer handled as session update (session_id={assigned_session_id})"
                )
            elif offer_params.session_id:
                self.__logger.info(
                    (
                        "Offer update fallback to new session "
                        f"(requested={offer_params.session_id}, assigned={assigned_session_id})"
                    ),
                )
            else:
                self.__logger.info(
                    f"Offer handled as new session (session_id={assigned_session_id})"
                )
            self.__logger.info(
                (
                    f"Client: {request.client}\n"
                    f"RequestHeaders: {request.headers}\n"
                    f"OfferSDP:\n{offer_params.sdp}\n"
                    f"ResponseSDP:\n{session_info['sdp']}",
                ),
            )
            return JSONResponse(session_info)

        @app.post("/api/v1/RTCSignalingServer/candidate")
        async def app_candidate(candidate_params: RTCSessionCandidate):
            # Trickle ICE用:
            # Offer後に到着する候補を既存セッションへ中継する。
            # セッション終了済み候補は再接続レースで自然発生するため、
            # 受理不能でもHTTP 200で無害化し、過剰な404/Warningを避ける。
            rtcSM.cleanup_sessions()
            if rtcSM.add_ice_candidate(candidate_params):
                return JSONResponse({"status": True})
            self.__logger.info(
                (
                    "Late candidate ignored: session not found or closed "
                    f"(session_id={candidate_params.session_id}, "
                    f"has_candidate={candidate_params.candidate is not None})"
                ),
            )
            return JSONResponse(
                {"status": False, "reason": "session_not_found_or_closed"}
            )

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
                    # Trickle ICE候補の後送先。フロントはconfig.jsonから動的取得する。
                    "candidateURL": "/api/v1/RTCSignalingServer/candidate",
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
