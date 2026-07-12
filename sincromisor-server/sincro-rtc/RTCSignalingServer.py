import logging
import logging.config
import os
from logging import Logger
from threading import Event

import uvicorn
from fastapi import FastAPI
from setproctitle import setproctitle
from sincro_config import ServiceDiscoveryReporter, SincromisorLoggerConfig
from sincro_rtc.models import RTCSignalingServerArgument
from sincro_rtc.RTCSession import RTCSessionManager
from sincro_rtc.RTCSignalingApp import create_rtc_signaling_app

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
        app: FastAPI = create_rtc_signaling_app(
            rtcSM,
            max_sessions=self.__args.max_sessions,
            logger=self.__logger,
        )
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
