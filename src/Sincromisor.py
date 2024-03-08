import tracemalloc
import threading
import psutil
import logging
import os
from setproctitle import setproctitle
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sincroLib.models import RTCSessionOffer

# from sincroLib.SpeechRecognizer import SpeechRecognizerProcessManager
from sincroLib.RTCSession import RTCSessionProcessManager
from sincroLib.utils import ConfigManager, MemoryProfiler

tracemalloc.start()
setproctitle(f"Sincromisor")
ConfigManager.load()

logging.basicConfig(
    filename="log/Sincromisor.log",
    encoding="utf-8",
    level=logging.INFO,
    format=f"[%(asctime)s] {logging.BASIC_FORMAT}",
    datefmt="%Y/%m/%d %H:%M:%S",
)
logger = logging.getLogger(__name__)
logger.info("start Syncromisor")
# SpeechRecognizerProcessManager.startProcess()

rtcSPM = RTCSessionProcessManager()
app = FastAPI(on_shutdown=[rtcSPM.shutdown])
mem = MemoryProfiler()
templates = Jinja2Templates(directory="templates")


@app.get("/")
def app_root(request: Request):
    return templates.TemplateResponse(
        "index.html", {"request": request}, media_type="text/html"
    )


@app.get("/simple")
def app_simple(request: Request):
    return templates.TemplateResponse(
        "simple.html", {"request": request}, media_type="text/html"
    )


@app.get("/single")
def app_single(request: Request):
    return templates.TemplateResponse(
        "single.html", {"request": request}, media_type="text/html"
    )


@app.get("/double")
def app_double(request: Request):
    return templates.TemplateResponse(
        "double.html", {"request": request}, media_type="text/html"
    )


@app.post("/offer")
async def offer(request: Request, offer_params: RTCSessionOffer):
    return JSONResponse(rtcSPM.create_session(offer=offer_params))


@app.get("/cleanup")
def app_cleanup(request: Request):
    result = rtcSPM.cleanup_sessions()
    return JSONResponse({"status": True, "running": result})


if os.environ.get("SINCROMISOR_MODE") == "development":

    @app.get("/remote")
    def app_remote(request: Request):
        print([request.headers, request.client])
        return JSONResponse(dict(request.headers))

    @app.get("/memory")
    def app_memory(request: Request):
        obj_diff = mem.diff()
        mem.update()
        return JSONResponse(obj_diff)

    @app.get("/top")
    def app_top(request: Request):
        return JSONResponse(mem.top())

    @app.get("/malloc")
    def app_malloc(request: Request):
        snapshot = tracemalloc.take_snapshot()
        top_stats = snapshot.statistics("lineno")
        stats = [[str(stat.traceback), stat.size] for stat in top_stats]
        return JSONResponse(stats)

    @app.get("/thread")
    def app_thread(request: Request):
        stats = {}
        for t in threading.enumerate():
            stats[t.name] = t.is_alive()
        return JSONResponse(stats)

    @app.get("/osthread")
    def app_osthread():
        stats = {}
        ps = psutil.Process()
        for t in ps.threads():
            stats[t.id] = [t.user_time, t.system_time]
        return JSONResponse(stats)


### その他 ###
app.mount("/characters", StaticFiles(directory="assets/characters"), name="characters")
app.mount("/dist", StaticFiles(directory="dist"), name="dist")
app.mount(
    "/mediapipe", StaticFiles(directory="node_modules/@mediapipe"), name="mediapipe"
)
app.mount("/", StaticFiles(directory="static", follow_symlink=True), name="static")
