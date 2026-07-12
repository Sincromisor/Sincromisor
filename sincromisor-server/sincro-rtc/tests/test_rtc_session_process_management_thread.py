from unittest.mock import Mock

from sincro_rtc.RTCSession import RTCSessionProcessManagementThread


def management_thread(process: Mock) -> RTCSessionProcessManagementThread:
    finalize_event = Mock()
    finalize_event.is_set.return_value = True
    return RTCSessionProcessManagementThread("session", process, finalize_event, 10)


def test_does_not_kill_process_that_exits_within_timeout() -> None:
    process = Mock()
    process.is_alive.return_value = False

    management_thread(process).run()

    process.join.assert_called_once_with(timeout=10)
    process.kill.assert_not_called()
    process.close.assert_called_once_with()


def test_kills_process_that_remains_alive_after_timeout() -> None:
    process = Mock()
    process.is_alive.return_value = True

    management_thread(process).run()

    assert process.join.call_count == 2
    process.kill.assert_called_once_with()
    process.close.assert_called_once_with()
