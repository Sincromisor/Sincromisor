import { frontendLogger } from "../../shared/logging/appLogger";
import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";
import { parseIceCandidateResponse } from "./rtcBoundarySchema";
import type { SincroRTCConfig } from "./sincroRtcConfigManager";

type RtcIceCandidateSenderParams = {
    candidate: RTCIceCandidateInit | null;
    logger: Pick<DebugConsoleManager, "addRtcEventLog" | "addTextChannelLog">;
    sessionId: string;
    sincroConfig: Pick<SincroRTCConfig, "candidateURL">;
};

export async function sendRtcIceCandidate(params: RtcIceCandidateSenderParams): Promise<void> {
    try {
        const response = await fetch(params.sincroConfig.candidateURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                session_id: params.sessionId,
                candidate: params.candidate,
            }),
        });
        if (!response.ok) {
            throw new Error(
                `Failed to send ICE candidate: ${response.status} ${response.statusText}`,
            );
        }

        const resultJson: unknown = await response.json().catch(() => undefined);
        if (resultJson === undefined) {
            return;
        }
        const result = parseIceCandidateResponse(resultJson);
        if (result.status === false) {
            params.logger.addRtcEventLog(
                `ICE candidate ignored by server: ${result.reason ?? "unknown_reason"}`,
            );
        }
    } catch (error) {
        frontendLogger.error("Failed to send ICE candidate.", { error });
        params.logger.addTextChannelLog(`! failed to send ice candidate: ${error}\n`);
        params.logger.addRtcEventLog(`candidate send failed: ${error}`);
    }
}
