from unittest.mock import Mock

import pytest
from sincro_rtc.models import RTCSessionOffer
from sincro_rtc.models.RTCSessionOffer import TalkMode
from sincro_rtc.RTCSession import (
    RTCSessionCapacityError,
    RTCSessionManager,
    RTCSessionResponseTimeoutError,
)


def offer(session_id: str | None = None) -> RTCSessionOffer:
    return RTCSessionOffer(
        sdp="test-sdp", type="offer", talk_mode=TalkMode.chat, session_id=session_id
    )


def manager() -> RTCSessionManager:
    return RTCSessionManager(None, None, None, None)


def active_description(
    session_id: str, response: object, poll_result: bool = True
) -> Mock:
    description = Mock()
    description.session_id = session_id
    description.is_active.return_value = True
    description.sv_pipe.poll.return_value = poll_result
    description.sv_pipe.recv.return_value = response
    return description


def processes(value: RTCSessionManager) -> dict[str, object]:
    stored = vars(value)["_RTCSessionManager__processes"]
    if not isinstance(stored, dict):
        raise TypeError("unexpected manager process storage")
    return stored


def test_capacity_zero_rejects_without_creating_process() -> None:
    value = manager()

    with pytest.raises(RTCSessionCapacityError):
        value.create_or_update_session(offer(), max_sessions=0)

    assert processes(value) == {}


def test_active_update_is_allowed_at_capacity() -> None:
    value = manager()
    description = active_description(
        "existing", {"message_type": "update_offer_result", "session_id": "existing"}
    )
    processes(value)["existing"] = description

    result = value.create_or_update_session(offer("existing"), max_sessions=1)

    assert result == {"session_id": "existing"}
    description.sv_pipe.poll.assert_called_once_with(15.0)


def test_update_rejection_at_capacity_does_not_create_fallback() -> None:
    value = manager()
    description = active_description(
        "existing", {"message_type": "update_offer_error", "error": "rejected"}
    )
    processes(value)["existing"] = description

    with pytest.raises(RTCSessionCapacityError):
        value.create_or_update_session(offer("existing"), max_sessions=1)

    assert processes(value) == {"existing": description}
    description.close.assert_not_called()


def test_update_timeout_removes_old_session_before_fallback_capacity_check() -> None:
    value = manager()
    description = active_description("existing", None, poll_result=False)
    processes(value)["existing"] = description

    with pytest.raises(RTCSessionCapacityError):
        value.create_or_update_session(offer("existing"), max_sessions=0)

    assert processes(value) == {}
    description.close.assert_called_once_with(timeout=10)


def test_update_eof_removes_old_session_and_releases_lock() -> None:
    value = manager()
    description = active_description("existing", None)
    description.sv_pipe.recv.side_effect = EOFError
    processes(value)["existing"] = description

    with pytest.raises(RTCSessionCapacityError):
        value.create_or_update_session(offer("existing"), max_sessions=0)

    assert value.session_count() == 0
    description.close.assert_called_once_with(timeout=10)


def test_update_broken_pipe_removes_old_session_before_fallback() -> None:
    value = manager()
    description = active_description("existing", None)
    description.sv_pipe.send.side_effect = BrokenPipeError
    processes(value)["existing"] = description

    with pytest.raises(RTCSessionCapacityError):
        value.create_or_update_session(offer("existing"), max_sessions=0)

    assert value.session_count() == 0
    description.close.assert_called_once_with(timeout=10)


def test_private_response_helper_raises_specific_timeout() -> None:
    value = manager()
    description = active_description("existing", None, poll_result=False)
    processes(value)["existing"] = description
    receive_response = getattr(value, "_RTCSessionManager__receive_response_locked")

    with pytest.raises(RTCSessionResponseTimeoutError):
        receive_response(description, "initial_offer")

    assert processes(value) == {}
