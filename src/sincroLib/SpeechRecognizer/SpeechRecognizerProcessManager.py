import logging
from logging import Logger
from setproctitle import setproctitle
from multiprocessing import Queue
from multiprocessing.managers import SyncManager, DictProxy
from .SpeechRecognizerProcess import SpeechRecognizerProcess


class SpeechRecognizerProcessManager:
    logger: Logger = logging.getLogger(__name__)
    running: bool = False
    process: SpeechRecognizerProcess
    read_queue: Queue
    result_manager: SyncManager
    data_channel_results: DictProxy
    voice_results: DictProxy
    data_channel_sequence_id: DictProxy
    voice_sequence_id: DictProxy

    @classmethod
    def startProcess(cls) -> None:
        if SpeechRecognizerProcessManager.running:
            SpeechRecognizerProcessManager.logger.error(
                "SpeechRecognizerProcess is already initialized."
            )
            return
        SpeechRecognizerProcessManager.running = True
        SpeechRecognizerProcessManager.logger.info(
            "Initialize SpeechRecognizerProcess."
        )
        SpeechRecognizerProcessManager.read_queue = Queue()
        SpeechRecognizerProcessManager.result_manager = SyncManager()
        SpeechRecognizerProcessManager.result_manager.start(
            lambda: setproctitle("SRPManager")
        )
        SpeechRecognizerProcessManager.data_channel_results = (
            SpeechRecognizerProcessManager.result_manager.dict()
        )
        SpeechRecognizerProcessManager.voice_results = (
            SpeechRecognizerProcessManager.result_manager.dict()
        )
        SpeechRecognizerProcessManager.data_channel_sequence_id = (
            SpeechRecognizerProcessManager.result_manager.dict()
        )
        SpeechRecognizerProcessManager.voice_sequence_id = (
            SpeechRecognizerProcessManager.result_manager.dict()
        )
        SpeechRecognizerProcessManager.process = SpeechRecognizerProcess(
            read_queue=SpeechRecognizerProcessManager.read_queue,
            data_channel_results=SpeechRecognizerProcessManager.data_channel_results,
            voice_results=SpeechRecognizerProcessManager.voice_results,
            data_channel_sequence_id_proxy=SpeechRecognizerProcessManager.data_channel_sequence_id,
            voice_sequence_id_proxy=SpeechRecognizerProcessManager.voice_sequence_id,
        )
        SpeechRecognizerProcessManager.process.start()
        SpeechRecognizerProcessManager.logger.info(
            f"Start SpeechRecognizerProcess({SpeechRecognizerProcessManager.process.pid})."
        )

    @classmethod
    def stopProcess(cls) -> None:
        SpeechRecognizerProcessManager.logger.info(
            f"Closing SpeechRecognizerProcess({SpeechRecognizerProcessManager.process.pid})."
        )
        if SpeechRecognizerProcessManager.running:
            SpeechRecognizerProcessManager.logger.error(
                "SpeechRecognizerProcess is not running."
            )
            return
        SpeechRecognizerProcessManager.read_queue.put(None)
        SpeechRecognizerProcessManager.read_queue.close()
        SpeechRecognizerProcessManager.process.join(30)
        SpeechRecognizerProcessManager.logger.info(
            f"Closed SpeechRecognizerProcess({SpeechRecognizerProcessManager.process.pid})."
        )
        SpeechRecognizerProcessManager.process.close()
        SpeechRecognizerProcessManager.running = False

    @classmethod
    def deleteTrackStatus(cls, session_id) -> None:
        SpeechRecognizerProcessManager.logger.info(f"[{session_id}] deleteTrackStatus.")
        if session_id in SpeechRecognizerProcessManager.data_channel_results:
            del SpeechRecognizerProcessManager.data_channel_results[session_id]
        if session_id in SpeechRecognizerProcessManager.voice_results:
            del SpeechRecognizerProcessManager.voice_results[session_id]
        if session_id in SpeechRecognizerProcessManager.data_channel_sequence_id:
            del SpeechRecognizerProcessManager.data_channel_sequence_id[session_id]
        if session_id in SpeechRecognizerProcessManager.voice_sequence_id:
            del SpeechRecognizerProcessManager.voice_sequence_id[session_id]
