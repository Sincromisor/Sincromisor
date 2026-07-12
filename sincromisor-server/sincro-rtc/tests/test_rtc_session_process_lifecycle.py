import asyncio
from unittest.mock import AsyncMock, Mock

from aiortc import RTCPeerConnection, RTCSessionDescription
from sincro_rtc.AudioBroker import AudioBroker
from sincro_rtc.AudioBroker.AudioBroker import (
    AudioBrokerCommunicator,
    AudioBrokerCommunicators,
)
from sincro_rtc.models import RTCVoiceChatSession
from sincro_rtc.RTCSession import RTCSessionProcess, VoiceTransformTrack


def session_with_owned_communication() -> tuple[
    RTCVoiceChatSession, list[tuple[Mock, Mock, Mock]]
]:
    broker = AudioBroker(
        session_id="01J00000000000000000000000",
        talk_mode="chat",
        consul_agent_host=None,
        consul_agent_port=None,
    )
    communication_resources: list[tuple[Mock, Mock, Mock]] = []

    def communicator(name: str) -> AudioBrokerCommunicator:
        websocket = Mock()
        sender_thread = Mock()
        receiver_thread = Mock()
        sender_thread.is_alive.return_value = False
        receiver_thread.is_alive.return_value = False
        communication_resources.append((websocket, sender_thread, receiver_thread))
        return AudioBrokerCommunicator(
            comm_type=name,
            session_id="01J00000000000000000000000",
            ws_url=f"ws://{name}",
            ws=websocket,
            sender_thread=sender_thread,
            receiver_thread=receiver_thread,
        )

    communicators = AudioBrokerCommunicators(
        extractor=communicator("extractor"),
        recognizer=communicator("recognizer"),
        text_processor=communicator("text_processor"),
        synthesizer=communicator("synthesizer"),
    )
    setattr(broker, "_AudioBroker__communicators", communicators)
    track = VoiceTransformTrack.__new__(VoiceTransformTrack)
    super(VoiceTransformTrack, track).__init__()
    setattr(track, "_VoiceTransformTrack__audio_broker", broker)
    setattr(track, "_VoiceTransformTrack__stopped", False)
    setattr(track, "_VoiceTransformTrack__logger", Mock())
    peer = RTCPeerConnection()
    session = RTCVoiceChatSession(
        peer=peer,
        desc=RTCSessionDescription(sdp="", type="offer"),
        session_id="01J00000000000000000000000",
        talk_mode="chat",
        audio_transform_track=track,
    )
    return session, communication_resources


def process_with_session(
    session: RTCVoiceChatSession,
    finalize_event: Mock,
) -> RTCSessionProcess:
    process = RTCSessionProcess(
        session_id=session.session_id,
        request_sdp="test-sdp",
        request_type="offer",
        request_talk_mode="chat",
        sdp_pipe=Mock(),
        rtc_finalize_event=finalize_event,
        consul_agent_host=None,
        consul_agent_port=None,
    )
    setattr(process, "_RTCSessionProcess__vcs", session)
    return process


def assert_owned_communication_closed_once(
    session: RTCVoiceChatSession,
    communication_resources: list[tuple[Mock, Mock, Mock]],
) -> None:
    assert session.closed
    assert session.audio_transform_track is not None
    assert session.audio_transform_track.readyState == "ended"
    for websocket, sender_thread, receiver_thread in communication_resources:
        websocket.close.assert_called_once_with()
        sender_thread.join.assert_called_once_with(timeout=2.0)
        receiver_thread.join.assert_called_once_with(timeout=2.0)


def test_normal_process_loop_exit_closes_track_and_communication_once() -> None:
    session, communicators = session_with_owned_communication()
    finalize_event = Mock()
    finalize_event.is_set.return_value = True
    process = process_with_session(session, finalize_event)
    setattr(
        process,
        "_RTCSessionProcess__offer",
        AsyncMock(
            return_value={"sdp": "answer", "type": "answer", "session_id": "session"}
        ),
    )

    asyncio.run(getattr(process, "_RTCSessionProcess__serve")())
    asyncio.run(session.close())

    assert_owned_communication_closed_once(session, communicators)


def test_initialization_failure_closes_created_track_and_communication_once() -> None:
    session, communicators = session_with_owned_communication()
    finalize_event = Mock()
    finalize_event.is_set.return_value = True
    process = process_with_session(session, finalize_event)
    setattr(
        process,
        "_RTCSessionProcess__offer",
        AsyncMock(side_effect=RuntimeError("initialization failed")),
    )

    asyncio.run(getattr(process, "_RTCSessionProcess__serve")())

    finalize_event.set.assert_called_once_with()
    assert_owned_communication_closed_once(session, communicators)


def test_connection_failed_handler_closes_track_and_communication_once() -> None:
    session, communicators = session_with_owned_communication()
    finalize_event = Mock()
    process = process_with_session(session, finalize_event)
    setattr(session.peer, "_RTCPeerConnection__connectionState", "failed")
    handler = getattr(process, "_RTCSessionProcess__handle_connection_state_change")

    asyncio.run(handler(session))
    asyncio.run(session.close())

    finalize_event.set.assert_called_once_with()
    assert_owned_communication_closed_once(session, communicators)
