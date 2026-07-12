from logging import Logger

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sincro_config import SincromisorConfig

from .models import RTCSessionCandidate, RTCSessionOffer
from .RTCSession import RTCSessionCapacityError, RTCSessionManager


def create_rtc_signaling_app(
    manager: RTCSessionManager,
    *,
    max_sessions: int,
    logger: Logger,
) -> FastAPI:
    """HTTP 契約と session manager の例外境界を構成する。"""

    app = FastAPI(on_shutdown=[manager.shutdown])

    @app.get("/api/v1/RTCSignalingServer/statuses")
    async def get_status() -> JSONResponse:
        if manager.session_count() > max_sessions:
            return JSONResponse(
                {"error": "Too many requests."},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        return JSONResponse(
            {"worker_type": "RTCSignalingServer", "sessions": manager.session_count()}
        )

    @app.post("/api/v1/RTCSignalingServer/offer")
    def app_offer(request: Request, offer_params: RTCSessionOffer) -> JSONResponse:
        manager.cleanup_sessions()
        logger.info(
            "Offer received: requested_session_id=%s, talk_mode=%s, client=%s",
            offer_params.session_id,
            offer_params.talk_mode,
            request.client,
        )
        try:
            session_info = manager.create_or_update_session(
                offer=offer_params,
                max_sessions=max_sessions,
            )
        except RTCSessionCapacityError:
            return JSONResponse(
                {"error": "Too many requests."},
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        except Exception as error:
            logger.error(
                "Failed to process offer request. session_id=%s, error=%r",
                offer_params.session_id,
                error,
            )
            return JSONResponse(
                {"error": "Failed to establish RTC session."},
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        assigned_session_id = session_info.get("session_id")
        if offer_params.session_id == assigned_session_id:
            logger.info(
                "Offer handled as session update (session_id=%s)", assigned_session_id
            )
        elif offer_params.session_id:
            logger.info(
                "Offer update fallback to new session (requested=%s, assigned=%s)",
                offer_params.session_id,
                assigned_session_id,
            )
        else:
            logger.info(
                "Offer handled as new session (session_id=%s)", assigned_session_id
            )
        return JSONResponse(session_info)

    @app.post("/api/v1/RTCSignalingServer/candidate")
    async def app_candidate(candidate_params: RTCSessionCandidate) -> JSONResponse:
        manager.cleanup_sessions()
        if manager.add_ice_candidate(candidate_params):
            return JSONResponse({"status": True})
        logger.info(
            "Late candidate ignored: session not found or closed "
            "(session_id=%s, has_candidate=%s)",
            candidate_params.session_id,
            candidate_params.candidate is not None,
        )
        return JSONResponse({"status": False, "reason": "session_not_found_or_closed"})

    @app.get("/api/v1/RTCSignalingServer/cleanup")
    def app_cleanup() -> JSONResponse:
        return JSONResponse({"status": True, "running": manager.cleanup_sessions()})

    @app.get("/api/v1/RTCSignalingServer/config.json")
    def app_config_ice_servers() -> JSONResponse:
        config = SincromisorConfig.from_yaml()
        return JSONResponse(
            {
                "offerURL": "/api/v1/RTCSignalingServer/offer",
                "candidateURL": "/api/v1/RTCSignalingServer/candidate",
                "iceServers": [
                    ice_server.to_lowerkeys()
                    for ice_server in config.get_all_ice_servers_conf()
                ],
            }
        )

    return app
