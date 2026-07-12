from fractions import Fraction
from unittest.mock import Mock

import numpy as np
import pytest
from aiortc import MediaStreamTrack
from av.audio.frame import AudioFrame
from sincro_rtc.RTCSession import VoiceTransformTrack


def track_with_broker(broker: Mock) -> VoiceTransformTrack:
    value = VoiceTransformTrack.__new__(VoiceTransformTrack)
    MediaStreamTrack.__init__(value)
    setattr(value, "_VoiceTransformTrack__audio_broker", broker)
    setattr(value, "_VoiceTransformTrack__stopped", False)
    setattr(value, "_VoiceTransformTrack__logger", Mock())
    return value


@pytest.mark.parametrize(
    ("layout", "sample_rate"),
    [("mono", 16000), ("mono", 48000), ("stereo", 16000), ("stereo", 48000)],
)
def test_dummy_frame_preserves_negotiated_input_attributes(
    layout: str, sample_rate: int
) -> None:
    channels = 1 if layout == "mono" else 2
    frame = AudioFrame.from_ndarray(
        np.ones((channels, 160), dtype=np.int16), format="s16p", layout=layout
    )
    frame.sample_rate = sample_rate
    frame.pts = 321
    frame.time_base = Fraction(1, sample_rate)
    value = track_with_broker(Mock())

    convert_dummy_frame = getattr(value, "_VoiceTransformTrack__convert_dummy_frame")
    result = convert_dummy_frame(frame)

    assert result.format.name == frame.format.name
    assert result.layout.name == frame.layout.name
    assert result.samples == frame.samples
    assert result.sample_rate == frame.sample_rate
    assert result.pts == frame.pts
    assert result.time_base == frame.time_base
    assert np.count_nonzero(result.to_ndarray()) == 0


def test_stop_closes_broker_exactly_once() -> None:
    broker = Mock()
    value = track_with_broker(broker)

    value.stop()
    value.stop()
    value.close()

    broker.close.assert_called_once_with()


def test_stop_still_stops_track_when_broker_close_fails() -> None:
    broker = Mock()
    broker.close.side_effect = RuntimeError("close failed")
    value = track_with_broker(broker)

    value.stop()

    assert value.readyState == "ended"
    broker.close.assert_called_once_with()
