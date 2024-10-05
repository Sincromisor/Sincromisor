import os

if os.environ.get("SINCROMISOR_MODE") == "development":
    import tracemalloc

    tracemalloc.start()
import logging
from logging import Logger

logging.basicConfig(
    filename="log/Sincromisor.log",
    encoding="utf-8",
    level=logging.INFO,
    format=f"[%(asctime)s] {logging.BASIC_FORMAT}",
    datefmt="%Y/%m/%d %H:%M:%S",
)

from setproctitle import setproctitle
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from fastapi.templating import Jinja2Templates
from sincroLib.models import RTCSessionOffer, SincromisorConfig
from starlette.middleware.cors import CORSMiddleware
from sincroLib.RTCSession import RTCSessionManager
from sincroLib.utils import MemoryProfiler


setproctitle(f"Sincromisor")
config = SincromisorConfig.from_yaml()

logger: Logger = logging.getLogger(__name__)
logger.info("start Syncromisor")

rtcSM = RTCSessionManager()
app = FastAPI(on_shutdown=[rtcSM.shutdown])
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
mem = MemoryProfiler()
templates = Jinja2Templates(directory="templates")


@app.post("/offer")
async def offer(request: Request, offer_params: RTCSessionOffer):
    if rtcSM.session_count() > config.WebRTC.MaxSessions:
        res = JSONResponse({'error': 'Too many requests.'})
        res.status_code = status.HTTP_429_TOO_MANY_REQUESTS
        return res

    session_info = rtcSM.create_session(offer=offer_params)
    logger.info(
        f"Client: {request.client}\n"
        + f"RequestHeaders: {request.headers}\n"
        + f"OfferSDP:\n{offer_params.sdp}\n"
        + f"ResponseSDP:\n{session_info['sdp']}"
    )
    return JSONResponse(session_info)


@app.get("/cleanup")
def app_cleanup(request: Request):
    result = rtcSM.cleanup_sessions()
    return JSONResponse({"status": True, "running": result})
