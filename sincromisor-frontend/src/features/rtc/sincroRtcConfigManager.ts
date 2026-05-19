import { frontendLogger } from "../../shared/logging/appLogger";
import { parseSincroRTCConfig, type SincroRTCConfig } from "./rtcBoundarySchema";

export type { IceServerConfig, SincroRTCConfig } from "./rtcBoundarySchema";

type ErrorHandler = (err: unknown) => void;

export class SincroRTCConfigManager {
    private static instance: SincroRTCConfigManager;
    config?: SincroRTCConfig;

    private constructor() {}

    static getManager(onerror: ErrorHandler): SincroRTCConfigManager {
        if (!SincroRTCConfigManager.instance) {
            SincroRTCConfigManager.instance = new SincroRTCConfigManager();
            try {
                void SincroRTCConfigManager.instance.getServers(onerror);
            } catch (err) {
                frontendLogger.error("Failed to start RTC config fetch.", { error: err });
                onerror(err);
            }
        }
        return SincroRTCConfigManager.instance;
    }

    private async getServers(onerror: ErrorHandler): Promise<void> {
        const response: Response = await fetch("/api/v1/RTCSignalingServer/config.json");
        if (!response.ok) {
            const err = new Error(
                `Failed to fetch /api/v1/RTCSignalingServer/config.json: ${response.statusText}`,
            );
            onerror(err);
            throw err;
        }
        const configJson: unknown = await response.json();
        this.config = parseSincroRTCConfig(configJson);
    }
}
