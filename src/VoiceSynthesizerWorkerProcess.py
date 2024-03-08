import logging
from logging import Logger
import traceback
from setproctitle import setproctitle
from fastapi import FastAPI, WebSocket, Depends, Request, WebSocketDisconnect
from sincroLib.models import SpeechRecognizerResult
from sincroLib.VoiceSynthesizer import VoiceSynthesizerWorker

setproctitle('VSynthesizer')

logging.basicConfig(
    filename="log/VoiceSynthesizerWorker.log",
    encoding="utf-8",
    level=logging.INFO,
    format=f"[%(asctime)s] {logging.BASIC_FORMAT}",
    datefmt="%Y/%m/%d %H:%M:%S",
)
logger: Logger = logging.getLogger(__name__)

app: FastAPI = FastAPI()


@app.websocket("/VoiceSynthesizer")
async def websocket_chat_endpoint(ws: WebSocket):
    try:
        await ws.accept()
        voice_synthesizer = VoiceSynthesizerWorker()
        while pack := await ws.receive_bytes():
            recognizer_result = SpeechRecognizerResult.from_msgpack(pack=pack)
            for synthesizer_result in voice_synthesizer.synth(recognizer_result):
                await ws.send_bytes(synthesizer_result.to_msgpack())
        traceback.print_exc()
    except WebSocketDisconnect:
        logger.info("Disconnected WebSocket.")
    except Exception as e:
        logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
        await ws.close()
