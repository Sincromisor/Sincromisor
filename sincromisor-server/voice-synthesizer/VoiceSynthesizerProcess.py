import logging
import logging.config
from logging import Logger
from sincro_config import SincromisorConfig, SincromisorLoggerConfig

config = SincromisorConfig.from_yaml()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(
        log_file=config.get_log_path("VoiceSynthesizerWorker"), stdout=True
    )
)

import traceback
from setproctitle import setproctitle
from fastapi import FastAPI, WebSocket, Depends, Request, WebSocketDisconnect
from sincro_models import SpeechRecognizerResult
from voice_synthesizer.VoiceSynthesizer import VoiceSynthesizerWorker

setproctitle("VSynthesizer")
logger: Logger = logging.getLogger(__name__)
logger.info("===== Starting VoiceSynthesizerWorkerProcess =====")
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
