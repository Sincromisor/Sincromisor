import logging
import logging.config
from logging import Logger
from setproctitle import setproctitle
from sincro_config import SincromisorLoggerConfig, KeepAliveReporter
from speech_recognizer.models import SpeechRecognizerProcessArgument

setproctitle(f"SPRecognizer")
args: SpeechRecognizerProcessArgument = SpeechRecognizerProcessArgument.argparse()
logging.config.dictConfig(
    SincromisorLoggerConfig.generate(log_file=args.log_file, stdout=True)
)

import traceback
from threading import Event
import numpy as np
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from sincro_models import SpeechExtractorResult
from speech_recognizer.SpeechRecognizer import SpeechRecognizerWorker


class SpeechRecognizerProcess:
    def __init__(self, args: SpeechRecognizerProcessArgument):
        self.__logger: Logger = logging.getLogger("sincro." + __name__)
        self.__logger.info("===== Starting SpeechRecognizerProcess =====")
        self.__args: SpeechRecognizerProcessArgument = (
            SpeechRecognizerProcessArgument.argparse()
        )

    def start(self):
        speech_recognizer = SpeechRecognizerWorker(voice_log_dir=args.voice_log_dir)
        app: FastAPI = FastAPI()
        event: Event = Event()
        self.keepalive_t: KeepAliveReporter = KeepAliveReporter(
            event=event,
            redis_host=self.__args.redis_host,
            redis_port=self.__args.redis_port,
            public_bind_host=self.__args.public_bind_host,
            public_bind_port=self.__args.public_bind_port,
            worker_type="SpeechRecognizer",
            interval=5,
        )
        self.keepalive_t.start()

        @app.websocket("/SpeechRecognizer")
        async def websocket_chat_endpoint(ws: WebSocket):
            self.__logger.info("Connected Websocket.")
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
                self.__logger.info("Disconnected WebSocket.")
            except Exception as e:
                self.__logger.error(
                    f"UnknownError: {repr(e)}\n{traceback.format_exc()}"
                )
                await ws.close()

        try:
            uvicorn.run(app, host=self.__args.host, port=self.__args.port)
        except KeyboardInterrupt:
            pass
        finally:
            event.set()
            self.keepalive_t.join()


if __name__ == "__main__":
    SpeechRecognizerProcess(args=args).start()
