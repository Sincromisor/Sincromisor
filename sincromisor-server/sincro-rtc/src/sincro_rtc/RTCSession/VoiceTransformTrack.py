import logging
import traceback
from asyncio.exceptions import CancelledError
from fractions import Fraction
from logging import Logger
from multiprocessing.sharedctypes import Synchronized

import numpy as np
from aiortc import MediaStreamTrack
from aiortc.mediastreams import MediaStreamError
from av.audio.frame import AudioFrame
from av.audio.resampler import AudioResampler
from sincro_models import TextProcessorResult, VoiceSynthesizerResultFrame

from ..AudioBroker import AudioBroker, AudioBrokerError
from ..models import RTCVoiceChatSession


class VoiceTransformTrack(MediaStreamTrack):
    kind = "audio"

    def __init__(
        self,
        track: MediaStreamTrack,
        vcs: RTCVoiceChatSession,
        rtc_session_status: Synchronized,
        redis_host: str,
        redis_port: int,
    ):
        super().__init__()
        self.__logger: Logger = logging.getLogger(
            __name__ + f"[{vcs.session_id[21:26]}]"
        )
        # RTCSessionManager、RTCSessionProcessと共有される
        self.__rtc_session_status: Synchronized = rtc_session_status
        self.__session_id: str = vcs.session_id
        self.__logger.info("Initialize VoiceTransformTrack.")
        self.__track: MediaStreamTrack = track
        self.__vcs: RTCVoiceChatSession = vcs
        # SpeechExtractor -> SpeechRecognizer用フォーマットは1ch, 16bit, 16000Hz
        self.__resampler = AudioResampler(layout=1, rate=16000)
        self.__audio_broker = AudioBroker(
            session_id=self.__session_id,
            talk_mode=self.__vcs.talk_mode,
            redis_host=redis_host,
            redis_port=redis_port,
        )

    # デコード済みのオーディオフレームを受け取って、何らかの処理を行った上でフレームを返す。
    # 返却するフレームは、同じフォーマット、かつ同じサンプル数でなければならない。
    # ここでフレームを返さないと、aiortc/rtcrtpsender.pyのnext_encoded_frameの
    # await self.__track.recv()がデッドロックしてしまう。
    async def recv(self) -> AudioFrame:
        if not self.__audio_broker.is_running():
            # AudioBrokerに異常が発生したら、RTC Sessionも止める
            self.__rtc_session_status = -1
            return self.__generate_dummy_frame()

        try:
            frame: AudioFrame = await self.__track.recv()
            return self.__transform(frame)
        except CancelledError:
            self.__logger.info("recv - CancelledError.")
        except MediaStreamError:
            self.__logger.info("recv - MediaStreamError.")
        except Exception as e:
            self.__logger.error(
                f"recv - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
            traceback.print_exc()
        # 何らかの例外が発生した時はrtcをshutdownする
        self.__rtc_session_status = -1
        return self.__generate_dummy_frame()

    def __transform(self, frame: AudioFrame) -> AudioFrame:
        try:
            self.__audio_broker.return_frame_format["sample_rate"] = frame.sample_rate
            self.__audio_broker.return_frame_format["sample_size"] = frame.samples
            resampled_frames = self.__resampler.resample(frame)
            for rf in resampled_frames:
                self.__audio_broker.add_frame(rf.to_ndarray().tobytes())
            if (sr_result := self.__get_recognized_text()) is not None:
                self.__vcs.text_ch.send(sr_result.model_dump_json())
            if (synth_voice := self.__get_voice_frame()) is not None:
                if synth_voice.new_text:
                    self.__vcs.telop_ch.send(synth_voice.params_to_json())
                newframe = frame.from_ndarray(
                    synth_voice.vframe, format="s16", layout="stereo"
                )
                newframe.pts = frame.pts
                newframe.rate = frame.sample_rate
            else:
                newframe = self.__convert_dummy_frame(frame)
            return newframe
        except AttributeError as e:
            self.__logger.error(
                f"transform - AttributeError: {repr(e)}\n{traceback.format_exc()}"
            )
        except AudioBrokerError as e:
            self.__logger.error(
                f"transform - AudioBrokerError: {repr(e)}\n{traceback.format_exc()}"
            )
            raise e
        except Exception as e:
            self.__logger.error(
                f"transform - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
        # 何らかの例外が発生した時はrtcをshutdownする
        self.__rtc_session_status = -1
        return self.__convert_dummy_frame(frame)

    def __get_recognized_text(self) -> TextProcessorResult | None:
        if len(self.__audio_broker.text_channel_queue) > 0:
            sr_result: TextProcessorResult = (
                self.__audio_broker.text_channel_queue.popleft()
            )
            return sr_result
        return None

    def __get_voice_frame(self) -> VoiceSynthesizerResultFrame | None:
        if len(self.__audio_broker.voice_frame_queue) > 0:
            vs_result: VoiceSynthesizerResultFrame = (
                self.__audio_broker.voice_frame_queue.popleft()
            )
            return vs_result
        return None

    def __convert_dummy_frame(self, frame: AudioFrame) -> AudioFrame:
        # opus/48000Hz/2chで1920フレームらしい
        zero_frame: np.ndarray = np.zeros((frame.to_ndarray().shape), dtype=np.int16)
        newframe: AudioFrame = frame.from_ndarray(
            zero_frame, format="s16", layout="stereo"
        )
        newframe.pts = frame.pts
        newframe.rate = 48000
        return newframe

    def __generate_dummy_frame(self) -> AudioFrame:
        samplerate = 48000
        blocksize = 960
        byte_frame: bytes = b"\0" * blocksize * 2
        np_frame: np.ndarray = np.frombuffer(byte_frame, dtype=np.int16)
        frame = AudioFrame.from_ndarray(
            np_frame.reshape(1, blocksize), format="s16", layout="mono"
        )
        frame.pts = 0
        frame.time_base = Fraction(1, samplerate)
        frame.sample_rate = samplerate
        return frame

    def close(self) -> None:
        self.__logger.info("Closing VoiceTransformTrack.")

        try:
            self.__audio_broker.close()
        except Exception as e:
            self.__logger.error(
                f"close - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
            traceback.print_exc()
        try:
            self.stop()
        except Exception as e:
            self.__logger.error(
                f"close - UnknownError: {repr(e)}\n{traceback.format_exc()}"
            )
            traceback.print_exc()
        self.__logger.info("Closed VoiceTransformTrack.")
