import logging
from logging import Logger
import traceback
import numpy as np
from pathlib import Path
from datetime import datetime
from multiprocessing import Process, Queue
from multiprocessing.managers import DictProxy
from setproctitle import setproctitle
from ..models import SpeechExtractorResult
from ..models import SpeechRecognizerResult
from .SpeechRecognizer import SpeechRecognizer, RecognizerError


class SpeechRecognizerProcess(Process):
    def __init__(
        self,
        read_queue: Queue,
        data_channel_results: DictProxy,
        voice_results: DictProxy,
        data_channel_sequence_id_proxy: DictProxy,
        voice_sequence_id_proxy: DictProxy,
    ):
        Process.__init__(self)
        self.logger: Logger = logging.getLogger(__name__)

        self.read_queue: Queue = read_queue
        self.data_channel_results: DictProxy = data_channel_results
        self.voice_results: DictProxy = voice_results
        self.data_channel_sequence_id_proxy: DictProxy = data_channel_sequence_id_proxy
        self.voice_sequence_id_proxy: DictProxy = voice_sequence_id_proxy

    def transcribe(self, s2t: SpeechRecognizer, voice: np.ndarray) -> list:
        inputs, outputs = s2t.transcribe(
            voice,
            decode_options={
                "output_scores": True,
                "return_dict_in_generate": True,
                "max_new_tokens": 500,
            },
        )
        return s2t.transcribe_with_score(inputs, outputs)

    def update_results(
        self,
        result_dict: DictProxy,
        sequence_id_dict: DictProxy,
        sr_result: SpeechRecognizerResult,
    ) -> None:
        if sr_result.session_id not in result_dict:
            results_list = []
        else:
            results_list = result_dict[sr_result.session_id]

        results_list.append(sr_result)
        # 既に参照されて不要になったものを削除する。
        # 削除基準として、SpeechExtractorProcessで割り当てられるシーケンス番号と、
        # AudioTransformTrackもしくはVoiceSynthesizerProcessで設定されるシーケンス番号が比較される。
        # (既に処理が終わったものを削除)
        if sr_result.session_id in sequence_id_dict:
            results_list = [
                r
                for r in results_list
                if r.sequence_id >= sequence_id_dict[sr_result.session_id]
            ]
        result_dict[sr_result.session_id] = results_list

    def run(self) -> None:
        setproctitle(f"SpeechRec")
        s2t: SpeechRecognizer = SpeechRecognizer(decode_options={"max_new_tokens": 255})
        print("SpeechRecognizer is initialized.")
        try:
            spe_result: SpeechExtractorResult
            while (spe_result := self.read_queue.get()) is not None:
                try:
                    result = self.transcribe(s2t, spe_result.voice)
                except RecognizerError:
                    self.logger.error(
                        f"RecognizerError: {spe_result.session_id} {spe_result.speech_id} {spe_result.sequence_id}"
                    )
                    continue
                sr_result = SpeechRecognizerResult(
                    session_id=spe_result.session_id,
                    speech_id=spe_result.speech_id,
                    sequence_id=spe_result.sequence_id,
                    start_at=spe_result.start_at,
                    confirmed=spe_result.confirmed,
                    result=result,
                )
                self.logger.info(f"SpeechRecognizerResult: {sr_result}")
                self.update_results(
                    result_dict=self.data_channel_results,
                    sequence_id_dict=self.data_channel_sequence_id_proxy,
                    sr_result=sr_result,
                )
                if spe_result.confirmed:
                    self.update_results(
                        result_dict=self.voice_results,
                        sequence_id_dict=self.voice_sequence_id_proxy,
                        sr_result=sr_result,
                    )
                    self.export_result(result=sr_result)
        except:
            self.logger.error(f"Received UnknownError - {traceback.format_exc()}")
            traceback.print_exc()

    def export_result(self, result: SpeechRecognizerResult):
        time_text: str = datetime.fromtimestamp(result.start_at).strftime(
            "%Y%m%d_%H%M%S.%f"
        )
        write_dir: str = f"log/voice/{result.session_id}"
        write_path: str = f"{write_dir}/{result.speech_id:06d}_{time_text}.json"
        Path(write_dir).mkdir(parents=True, exist_ok=True)
        with open(write_path, "w") as text:
            text.write(result.to_json(dumps_opt={"indent": 4}))
