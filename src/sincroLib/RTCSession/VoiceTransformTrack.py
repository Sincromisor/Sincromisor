import logging
from logging import Logger
import traceback
import numpy as np
from asyncio.exceptions import CancelledError
from aiortc import MediaStreamTrack
from aiortc.mediastreams import MediaStreamError
from av.audio.frame import AudioFrame
from av.audio.resampler import AudioResampler
from ..models import RTCVoiceChatSession
from ..models import SpeechRecognizerResult
from ..models import VoiceSynthesizerResultFrame
from ..AudioBroker import AudioBroker, AudioBrokerError


class VoiceTransformTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(
        self,
        track: MediaStreamTrack,
        vcs: RTCVoiceChatSession,
    ):
        super().__init__()
        self.logger: Logger = logging.getLogger(__name__ + f"[{vcs.session_id[0:8]}]")
        self.session_id: str = vcs.session_id
        self.logger.info(f"Initialize VoiceTransformTrack.")
        self.track: MediaStreamTrack = track
        self.recognized_voice_sequence_id = -1
        self.vcs: RTCVoiceChatSession = vcs
        # SpeechExtractor -> SpeechRecognizer用フォーマットは1ch, 16bit, 16000Hz
        self.resampler = AudioResampler(layout=1, rate=16000)
        self.audio_broker = AudioBroker(session_id=self.session_id)
        self.audio_broker.start()

    # デコード済みのオーディオフレームを受け取って、何らかの処理を行った上でフレームを返す。
    # 返却するフレームは、同じフォーマット、かつ同じサンプル数でなければならない。
    async def recv(self) -> AudioFrame:
        try:
            frame: AudioFrame = await self.track.recv()
            return self.transform(frame)
        except CancelledError:
            self.logger.info(f"recv - CancelledError.")
        except MediaStreamError:
            self.logger.info(f"recv - MediaStreamError.")
        except Exception as e:
            self.logger.error(
                f"recv - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
            traceback.print_exc()

    def transform(self, frame: AudioFrame) -> AudioFrame:
        try:
            self.audio_broker.return_frame_format["sample_rate"] = frame.sample_rate
            self.audio_broker.return_frame_format["sample_size"] = frame.samples
            resampled_frames = self.resampler.resample(frame)
            for rf in resampled_frames:
                self.audio_broker.add_frame(rf.to_ndarray().tobytes())
            if (sr_result := self.get_recognized_text()) is not None:
                self.vcs.text_ch.send(sr_result.to_json())
            if (synth_voice := self.get_voice_frame()) is not None:
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
        except AttributeError as e:
            self.logger.error(
                f"transform - AttributeError: {repr(e)}\n{traceback.format_exc()}"
            )
        except AudioBrokerError as e:
            self.logger.error(
                f"transform - AudioBrokerError: {repr(e)}\n{traceback.format_exc()}"
            )
            raise e
        except Exception as e:
            self.logger.error(
                f"transform - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
        return frame

    def get_recognized_text(self) -> SpeechRecognizerResult | None:
        if len(self.audio_broker.text_channel_queue) > 0:
            sr_result: SpeechRecognizerResult = (
                self.audio_broker.text_channel_queue.popleft()
            )
            return sr_result
        return None

    def get_voice_frame(self) -> VoiceSynthesizerResultFrame | None:
        if len(self.audio_broker.voice_frame_queue) > 0:
            vs_result: VoiceSynthesizerResultFrame = (
                self.audio_broker.voice_frame_queue.popleft()
            )
            return vs_result
        return None

    def generate_dummy_frame(self, frame) -> np.ndarray:
        # opus/48000Hz/2chで1920フレームらしい
        zero_frame = np.zeros((frame.to_ndarray().shape), dtype=np.int16)
        newframe = frame.from_ndarray(zero_frame, format="s16", layout="stereo")
        newframe.pts = frame.pts
        newframe.rate = 48000
        return newframe

    def close(self) -> None:
        self.logger.info(f"Closing VoiceTransformTrack.")
        try:
            self.audio_broker.close()
        except Exception as e:
            self.logger.error(
                f"close - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
            traceback.print_exc()
        try:
            self.stop()
        except Exception as e:
            self.logger.error(
                f"close - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
            traceback.print_exc()
        self.logger.info(f"Closed VoiceTransformTrack.")
