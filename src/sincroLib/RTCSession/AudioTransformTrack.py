import logging
import traceback
import numpy as np
from asyncio.exceptions import CancelledError
from aiortc import MediaStreamTrack
from aiortc.mediastreams import MediaStreamError
from av.audio.frame import AudioFrame
from av.audio.resampler import AudioResampler
from multiprocessing import Queue, Value
from multiprocessing.sharedctypes import Synchronized
from queue import Empty
from ..models import RTCVoiceChatSession
from ..models import SpeechRecognizerResult
from ..models import VoiceSynthesizerResultFrame
from ..SpeechExtractor import SpeechExtractorProcess
from ..SpeechRecognizer import SpeechRecognizerProcessManager
from ..VoiceSynthesizer import VoiceSynthesizerProcess


class AudioTransformTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(
        self,
        track,
        vcs: RTCVoiceChatSession,
        speech_extractor_status: Synchronized,
        voice_synthesizer_status: Synchronized,
    ):
        super().__init__()
        self.logger = logging.getLogger(__name__)
        self.session_id = vcs.session_id
        self.logger.info(f"[{self.session_id}] Initialize AudioTransformTrack.")
        self.track = track
        self.recognized_voice_sequence_id = -1
        self.vcs = vcs
        # SpeechExtractor -> SpeechRecognizer用フォーマットは1ch, 16bit, 16000Hz
        self.resampler = AudioResampler(layout=1, rate=16000)
        self.speech_extractor_status = speech_extractor_status
        self.voice_synthesizer_status = voice_synthesizer_status
        self.target_sample_rate: Synchronized = Value("i", 48000)
        self.target_sample_size: Synchronized = Value("i", 960)
        self.speech_extractor_reader_queue: Queue = Queue()
        self.speech_extractor_process = self.init_speech_extractor(
            self.speech_extractor_reader_queue
        )
        (
            self.voice_synthesizer_process,
            self.voice_synthesizer_writer_queue,
        ) = self.init_voice_synthesizer()

    # デコード済みのオーディオフレームを受け取って、何らかの処理を行った上でフレームを返す。
    # 返却するフレームは、同じフォーマット、かつ同じサンプル数でなければならない。
    async def recv(self) -> AudioFrame:
        try:
            frame: AudioFrame = await self.track.recv()
            return self.transform(frame)
        except CancelledError:
            self.logger.error(f"[{self.session_id}] recv - CancelledError.")
        except MediaStreamError:
            self.logger.error(f"[{self.session_id}] recv - MediaStreamError.")
        except:
            self.logger.error(f"[{self.session_id}] recv - UnknownError.")
            traceback.print_exc()

    def transform(self, frame: AudioFrame) -> AudioFrame:
        try:
            self.target_sample_rate.value = frame.sample_rate
            self.target_sample_size.value = frame.samples
            resampled_frames = self.resampler.resample(frame)
            for rf in resampled_frames:
                self.speech_extractor_reader_queue.put(rf.to_ndarray().reshape(-1))
            if (sr_result := self.get_recognized_voice_text()) is not None:
                self.vcs.text_ch.send(sr_result.to_json())
            if (synth_voice := self.get_synthesized_voice()) is not None:
                if synth_voice.new_text:
                    self.vcs.telop_ch.send(synth_voice.params_to_json())
                newframe = frame.from_ndarray(
                    synth_voice.vframe, format="s16", layout="stereo"
                )
                newframe.pts = frame.pts
                newframe.rate = frame.sample_rate
            else:
                newframe = self.generate_dummy_frame(frame)
            return newframe
        except AttributeError:
            self.logger.error(f"[{self.session_id}] transform - AttributeError.")
        except:
            self.logger.error(f"[{self.session_id}] transform - UnknownError.")
        return frame

    def get_recognized_voice_text(self) -> SpeechRecognizerResult | None:
        try:
            result: SpeechRecognizerResult
            for result in SpeechRecognizerProcessManager.data_channel_results[
                self.session_id
            ]:
                if result.sequence_id > self.recognized_voice_sequence_id:
                    self.recognized_voice_sequence_id = result.sequence_id
                    SpeechRecognizerProcessManager.data_channel_sequence_id[
                        self.session_id
                    ] = self.recognized_voice_sequence_id
                    return result
        except KeyError:
            pass
        except BrokenPipeError:
            pass
        except:
            self.logger.error(
                f"[{self.session_id}] get_recognized_voice - UnknownError."
            )
            traceback.print_exc()
        return None

    def get_synthesized_voice(self) -> VoiceSynthesizerResultFrame | None:
        try:
            return self.voice_synthesizer_writer_queue.get_nowait()
        except Empty:
            pass
        except BrokenPipeError:
            pass
        except:
            self.logger.error(
                f"[{self.session_id}] get_synthesized_voice - UnknownError."
            )
            traceback.print_exc()
        return None

    def generate_dummy_frame(self, frame) -> np.ndarray:
        # opus/48000Hz/2chで1920フレームらしい
        zero_frame = np.zeros((frame.to_ndarray().shape), dtype=np.int16)
        newframe = frame.from_ndarray(zero_frame, format="s16", layout="stereo")
        newframe.pts = frame.pts
        newframe.rate = 48000
        return newframe

    # [<av.AudioFormat s16>, 960, <av.AudioLayout 'stereo'>, (<av.AudioPlane 3840 bytes; buffer_ptr=0x7fb87000eb40; at 0x7fb88470fa00>,), 48000, 48000, (1, 1920)]
    # [<av.AudioFormat s16>, 320, <av.AudioLayout 'mono'>, (<av.AudioPlane 768 bytes; buffer_ptr=0x55939e0674c0; at 0x7fb88470f4c0>,), 16000, 16000, (1, 320)]
    # VOICEVOXはs16, mono, 24000Hzらしい
    def print_frame(self, frame: AudioFrame) -> None:
        print(
            [
                frame.format,
                frame.samples,
                frame.layout,
                frame.planes,
                frame.rate,
                frame.sample_rate,
                frame.to_ndarray().shape,
            ]
        )

    def init_speech_extractor(self, readQueue: Queue) -> SpeechExtractorProcess:
        # 0未満にするとプロセスが停止するようにSpeechExtractorProcessを実装する。
        ps = SpeechExtractorProcess(
            read_queue=readQueue,
            write_queue=SpeechRecognizerProcessManager.read_queue,
            status_value=self.speech_extractor_status,
            session_id=self.session_id,
        )
        ps.name = f"SpeechExtractor({self.session_id})"
        ps.start()
        self.logger.info(
            f"[{self.session_id}] Start SpeechExtractorProcess(PID: {ps.pid})."
        )
        return ps

    def init_voice_synthesizer(self) -> tuple:
        writeQueue: Queue = Queue()
        # 0未満にするとプロセスが停止するようにVoiceSynthesizerProcessを実装する。
        ps = VoiceSynthesizerProcess(
            voice_recognition_results=SpeechRecognizerProcessManager.voice_results,
            voice_sequence_id=SpeechRecognizerProcessManager.voice_sequence_id,
            write_queue=writeQueue,
            status_value=self.voice_synthesizer_status,
            target_sample_rate=self.target_sample_rate,
            target_sample_size=self.target_sample_size,
            session_id=self.session_id,
        )
        ps.name = f"VoiceSynthesizer({self.session_id})"
        ps.start()
        self.logger.info(
            f"[{self.session_id}] Start VoiceSynthesizerProcess(PID: {ps.pid})."
        )
        return (ps, writeQueue)

    def close(self) -> None:
        self.logger.info(f"[{self.session_id}] Closing AudioTransformTrack.")
        try:
            self.speech_extractor_status.value = -1
            self.voice_synthesizer_status.value = -1
            self.speech_extractor_reader_queue.close()
        except:
            self.logger.error(
                f"[{self.session_id}] UnknownError - {traceback.format_exc()}"
            )
            traceback.print_exc()
        try:
            if self.speech_extractor_process.exitcode is not None:
                self.logger.info(
                    f"[{self.session_id}] Closing SpeechExtractorProcess(PID: {self.speech_extractor_process.pid})."
                )
                self.speech_extractor_process.join(30)
                # 親のuvicornプロセスまで巻き込んで死ぬっぽい
                # self.speechExtractorProcess.terminate()
                self.logger.info(
                    f"[{self.session_id}] Closed SpeechExtractorProcess(PID: {self.speech_extractor_process.pid})."
                )
                self.speech_extractor_process.close()
        except:
            self.logger.error(
                f"[{self.session_id}] UnknownError - {traceback.format_exc()}"
            )
            traceback.print_exc()
        try:
            if self.voice_synthesizer_process.exitcode is not None:
                self.logger.info(
                    f"[{self.session_id}] Closing voiceSynthesizerProcess(PID: {self.voice_synthesizer_process.pid})."
                )
                # SpeechRecognizerProcessManager.voiceQueue.put(None)
                self.voice_synthesizer_writer_queue.close()
                self.voice_synthesizer_process.join(30)
                # 親のuvicornプロセスまで巻き込んで死ぬっぽい
                # self.voiceSynthesizerProcess.terminate()
                self.logger.info(
                    f"[{self.session_id}] Closed voiceSynthesizerProcess(PID: {self.voice_synthesizer_process.pid})."
                )
                self.voice_synthesizer_process.close()
        except:
            self.logger.error(
                f"[{self.session_id}] UnknownError - {traceback.format_exc()}"
            )
            traceback.print_exc()
        try:
            SpeechRecognizerProcessManager.deleteTrackStatus(session_id=self.session_id)
        except:
            self.logger.error(
                f"[{self.session_id}] UnknownError - {traceback.format_exc()}"
            )
            traceback.print_exc()
        try:
            self.stop()
        except:
            self.logger.error(
                f"[{self.session_id}] UnknownError - {traceback.format_exc()}"
            )
            traceback.print_exc()
        self.logger.info(f"[{self.session_id}] Closed AudioTransforkTrack.")
