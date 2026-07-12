import importlib
from multiprocessing.connection import Connection
from unittest.mock import Mock

import pytest
from sincro_rtc.models import RTCSessionOffer
from sincro_rtc.models.RTCSessionOffer import TalkMode
from sincro_rtc.RTCSession import (
    RTCSessionCapacityError,
    RTCSessionManager,
    RTCSessionResponseTimeoutError,
)
from sincro_rtc.RTCSession.RTCSessionProcessManagementThread import (
    RTCSessionProcessManagementThread,
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


class FakeProcess:
    instances: list["FakeProcess"] = []

    def __init__(self, **_kwargs: object) -> None:
        self.started = False
        self.killed = False
        self.joined = False
        self.closed = False
        self.__class__.instances.append(self)

    def start(self) -> None:
        self.started = True

    def kill(self) -> None:
        self.killed = True

    def join(self) -> None:
        self.joined = True

    def close(self) -> None:
        self.closed = True


class FakeManagementThread(RTCSessionProcessManagementThread):
    def __init__(self, *, process: FakeProcess, **_kwargs: object) -> None:
        self.process = process

    def start(self) -> None:
        return

    def join(self, timeout: float | None = None) -> None:
        self.process.kill()
        self.process.join()
        self.process.close()


def configure_creation(monkeypatch: pytest.MonkeyPatch, response: object) -> Mock:
    module = importlib.import_module("sincro_rtc.RTCSession.RTCSessionManager")
    server_pipe = Mock(spec=Connection)
    server_pipe.poll.return_value = True
    server_pipe.recv.return_value = response
    client_pipe = Mock(spec=Connection)
    FakeProcess.instances.clear()
    monkeypatch.setattr(module, "Pipe", lambda: (server_pipe, client_pipe))
    monkeypatch.setattr(module, "RTCSessionProcess", FakeProcess)
    monkeypatch.setattr(
        module, "RTCSessionProcessManagementThread", FakeManagementThread
    )
    return server_pipe


def assert_created_process_was_reclaimed(server_pipe: Mock) -> None:
    process = FakeProcess.instances[-1]
    assert process.started
    assert process.killed
    assert process.joined
    assert process.closed
    server_pipe.close.assert_called_once_with()


def test_capacity_zero_rejects_without_creating_process() -> None:
    value = manager()

    with pytest.raises(RTCSessionCapacityError):
        value.create_or_update_session(offer(), max_sessions=0)

    assert processes(value) == {}


def test_new_session_is_created_below_capacity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configure_creation(
        monkeypatch,
        {"sdp": "answer", "type": "answer", "session_id": "assigned"},
    )
    value = manager()

    result = value.create_or_update_session(offer(), max_sessions=1)

    assert result["sdp"] == "answer"
    assert value.session_count() == 1


def test_new_session_is_rejected_at_exact_capacity() -> None:
    value = manager()
    processes(value)["existing"] = active_description("existing", {})

    with pytest.raises(RTCSessionCapacityError):
        value.create_or_update_session(offer(), max_sessions=1)

    assert value.session_count() == 1


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


@pytest.mark.parametrize(
    ("poll_result", "recv_result", "recv_error"),
    [
        (False, None, None),
        (True, None, EOFError()),
        (True, None, BrokenPipeError()),
        (
            True,
            {
                "message_type": "offer_error",
                "error": "failed_to_create_initial_answer",
            },
            None,
        ),
    ],
)
def test_initial_offer_failure_reclaims_process_pipe_and_dictionary(
    monkeypatch: pytest.MonkeyPatch,
    poll_result: bool,
    recv_result: object,
    recv_error: Exception | None,
) -> None:
    server_pipe = configure_creation(monkeypatch, recv_result)
    server_pipe.poll.return_value = poll_result
    if recv_error is not None:
        server_pipe.recv.side_effect = recv_error
    value = manager()

    with pytest.raises((RTCSessionResponseTimeoutError, RuntimeError)):
        value.create_or_update_session(offer(), max_sessions=1)

    assert value.session_count() == 0
    assert_created_process_was_reclaimed(server_pipe)


def test_timeout_reclamation_allows_successful_new_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    value = manager()
    old_description = active_description("existing", None, poll_result=False)
    processes(value)["existing"] = old_description
    configure_creation(
        monkeypatch,
        {"sdp": "fallback", "type": "answer", "session_id": "new"},
    )

    result = value.create_or_update_session(offer("existing"), max_sessions=1)

    assert result["sdp"] == "fallback"
    assert value.session_count() == 1
    old_description.close.assert_called_once_with(timeout=10)
