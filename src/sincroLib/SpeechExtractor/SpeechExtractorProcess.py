import logging
from logging import Logger
import traceback
from setproctitle import setproctitle
from multiprocessing import Process, Queue
from multiprocessing.sharedctypes import Synchronized
from .SpeechExtractor import SpeechExtractor
from ..models import SpeechExtractorResult


class SpeechExtractorProcess(Process):
    def __init__(
        self,
        read_queue: Queue,
        write_queue: Queue,
        status_value: Synchronized,
        session_id: str,
    ):
        Process.__init__(self)
        self.logger: Logger = logging.getLogger(__name__)

        self.read_queue: Queue = read_queue
        self.write_queue: Queue = write_queue
        self.session_id: str = session_id
        self.status_value: Synchronized = status_value
        self.logger.error(f"Init SpeechExtractorProcess({self.session_id})")

    def run(self) -> None:
        setproctitle(f"SpeechX[{self.session_id[0:5]}]")
        try:
            spe = SpeechExtractor(
                session_id=self.session_id, status_value=self.status_value
            )
            spe_result: SpeechExtractorResult
            for spe_result in spe.extract(queue=self.read_queue):
                if spe_result.confirmed or self.write_queue.qsize() == 0:
                    self.write_queue.put(spe_result)
        except:
            self.logger.error(
                f"Received UnknownError {self.session_id} - {traceback.format_exc()}"
            )
            traceback.print_exc()
        self.read_queue.close()
