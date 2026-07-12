import inspect
import logging
from unittest.mock import Mock

from fastapi.testclient import TestClient
from sincro_rtc.RTCSession import (
    RTCSessionCapacityError,
    RTCSessionResponseTimeoutError,
)
from sincro_rtc.RTCSignalingApp import create_rtc_signaling_app

OFFER = {"sdp": "test-sdp", "type": "offer", "talk_mode": "chat"}


def client_for(manager: Mock) -> TestClient:
    manager.cleanup_sessions.return_value = []
    manager.session_count.return_value = 0
    manager.add_ice_candidate.return_value = False
    app = create_rtc_signaling_app(
        manager, max_sessions=1, logger=logging.getLogger("test.rtc")
    )
    return TestClient(app)


def test_offer_endpoint_is_synchronous_for_fastapi_thread_pool() -> None:
    manager = Mock()
    app = create_rtc_signaling_app(
        manager, max_sessions=1, logger=logging.getLogger("test.rtc")
    )
    route = next(route for route in app.routes if route.path.endswith("/offer"))

    assert not inspect.iscoroutinefunction(route.endpoint)


def test_offer_capacity_returns_contract_429() -> None:
    manager = Mock()
    manager.create_or_update_session.side_effect = RTCSessionCapacityError

    response = client_for(manager).post("/api/v1/RTCSignalingServer/offer", json=OFFER)

    assert response.status_code == 429
    assert response.json() == {"error": "Too many requests."}


def test_offer_timeout_returns_contract_503_and_other_endpoints_continue() -> None:
    manager = Mock()
    manager.create_or_update_session.side_effect = RTCSessionResponseTimeoutError
    client = client_for(manager)

    response = client.post("/api/v1/RTCSignalingServer/offer", json=OFFER)

    assert response.status_code == 503
    assert response.json() == {"error": "Failed to establish RTC session."}
    assert client.get("/api/v1/RTCSignalingServer/statuses").json() == {
        "worker_type": "RTCSignalingServer",
        "sessions": 0,
    }
    assert (
        client.post(
            "/api/v1/RTCSignalingServer/candidate",
            json={"session_id": "missing", "candidate": None},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/RTCSignalingServer/cleanup").json() == {
        "status": True,
        "running": [],
    }
    manager.shutdown()
    manager.shutdown.assert_called_once_with()


def test_offer_success_preserves_response_schema() -> None:
    manager = Mock()
    manager.create_or_update_session.return_value = {
        "sdp": "answer-sdp",
        "type": "answer",
        "session_id": "assigned",
    }

    response = client_for(manager).post("/api/v1/RTCSignalingServer/offer", json=OFFER)

    assert response.status_code == 200
    assert response.json() == {
        "sdp": "answer-sdp",
        "type": "answer",
        "session_id": "assigned",
    }
