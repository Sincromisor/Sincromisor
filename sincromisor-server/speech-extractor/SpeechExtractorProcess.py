import logging
from logging import Logger
from sincro_config import SincromisorConfig, LoggerConfig

config = SincromisorConfig.from_yaml()
logging.config.dictConfig(
    LoggerConfig.generate(
        log_file=config.get_log_path("SpeechExtractorWorker"), stdout=True
    )
)

import traceback
from setproctitle import setproctitle
from fastapi import FastAPI, WebSocket, Depends, Request, WebSocketDisconnect
from sincro_models import SpeechExtractorInitializeRequest
from speech_extractor.SpeechExtractor import SpeechExtractorWorker

setproctitle(f"SPExtractor")
logger: Logger = logging.getLogger(__name__)
logger.info("===== Starting SpeechExtractorWorkerProcess. =====")
app: FastAPI = FastAPI()
SpeechExtractorWorker.setup_model()


@app.websocket("/SpeechExtractor")
async def websocket_chat_endpoint(ws: WebSocket):
    logger.info("Start SpeechExtractorWebSocket")
    try:
        await ws.accept()
        pack = await ws.receive_bytes()
        speRequest = SpeechExtractorInitializeRequest.from_msgpack(pack=pack)
        speechExtractor = SpeechExtractorWorker(
            session_id=speRequest.session_id,
            voice_channels=speRequest.voice_channels,
            voice_sampling_rate=speRequest.voice_sampling_rate,
        )
        await speechExtractor.extract(ws=ws, max_silence_ms=600)
    except WebSocketDisconnect:
        logger.info("Disconnected WebSocket.")
    except Exception as e:
        logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
        await ws.close()
