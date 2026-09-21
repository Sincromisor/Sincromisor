import { frontendLogger } from "../../shared/logging/appLogger";
import { parseSincroRTCConfig, type SincroRTCConfig } from "./rtcBoundarySchema";

export type { IceServerConfig, SincroRTCConfig } from "./rtcBoundarySchema";

type ErrorHandler = (err: unknown) => void;

/** 同一ページのRTC設定取得を共有し、非同期の失敗は最初の呼出元へ通知する。 */
export class SincroRTCConfigManager {
    private static instance: SincroRTCConfigManager;
    config?: SincroRTCConfig;

    private constructor() {}

    /** 初回だけ設定を取得する。取得完了まではconfigが未設定になる。 */
    static getManager(onerror: ErrorHandler): SincroRTCConfigManager {
        if (!SincroRTCConfigManager.instance) {
            SincroRTCConfigManager.instance = new SincroRTCConfigManager();
            // 非同期失敗をこの境界で一度通知し、診断には固定分類だけを渡す。
            void SincroRTCConfigManager.instance.getServers().catch((error: unknown) => {
                frontendLogger.error("Failed to fetch RTC config.", { error });
                onerror(error);
            });
        }
        return SincroRTCConfigManager.instance;
    }

    /** 設定を検証して保持する。通信・型の失敗は取得開始元で通知する。 */
    private async getServers(): Promise<void> {
        const response: Response = await fetch("/api/v1/RTCSignalingServer/config.json");
        if (!response.ok) {
            const err = new Error(
                `Failed to fetch /api/v1/RTCSignalingServer/config.json: ${response.statusText}`,
            );
            throw err;
        }
        const configJson: unknown = await response.json();
        this.config = parseSincroRTCConfig(configJson);
    }
}
