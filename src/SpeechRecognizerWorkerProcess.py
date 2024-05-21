import logging
from logging import Logger

logging.basicConfig(
    filename="log/SpeechRecognizerWorker.log",
    encoding="utf-8",
    level=logging.INFO,
    format=f"[%(asctime)s] {logging.BASIC_FORMAT}",
    datefmt="%Y/%m/%d %H:%M:%S",
)

import traceback
from setproctitle import setproctitle
import numpy as np
from fastapi import FastAPI, WebSocket, Depends, Request, WebSocketDisconnect
from sincroLib.models import SpeechExtractorResult
from sincroLib.SpeechRecognizer import SpeechRecognizerWorker

setproctitle(f"SPRecognizer")
logger: Logger = logging.getLogger(__name__)
logger.info("===== Starting SpeechRecognizerWorkerProcess =====")
app: FastAPI = FastAPI()
speech_recognizer = SpeechRecognizerWorker()


@app.websocket("/SpeechRecognizer")
async def websocket_chat_endpoint(ws: WebSocket):
    try:
        await ws.accept()
        current_speech_id = -1
        current_speech_buffer = np.zeros(0, dtype=np.int16)
        while pack := await ws.receive_bytes():
            extractor_result = SpeechExtractorResult.from_msgpack(pack)
            if current_speech_id != extractor_result.speech_id:
                current_speech_id = extractor_result.speech_id
                # voiceのndarrayのフラグwriteableをtrueにしないと、
                # torch.from_numpy()で下記の警告が出る。
                # 一旦copy()しないとwriteableにできない点にも注意。
                # (copy()すると自動的にwritableになる)
                # UserWarning: The given NumPy array is not writable,
                # and PyTorch does not support non-writable tensors.
                # ~~~
                # (Triggered internally at ../torch/csrc/utils/tensor_numpy.cpp:206.)
                current_speech_buffer = extractor_result.voice.copy()
            else:
                current_speech_buffer = np.append(
                    current_speech_buffer, extractor_result.voice
                )
                extractor_result.voice = current_speech_buffer
            result = speech_recognizer.recognize(extractor_result)
            await ws.send_bytes(result.to_msgpack())
        traceback.print_exc()
    except WebSocketDisconnect:
        logger.info("Disconnected WebSocket.")
    except Exception as e:
        logger.error(f"UnknownError: {repr(e)}\n{traceback.format_exc()}")
        await ws.close()
