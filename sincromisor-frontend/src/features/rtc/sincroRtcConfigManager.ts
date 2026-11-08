import { frontendLogger } from "../../shared/logging/appLogger";
import { parseSincroRTCConfig, type SincroRTCConfig } from "./rtcBoundarySchema";

export type { IceServerConfig, SincroRTCConfig } from "./rtcBoundarySchema";

type ErrorHandler = (err: unknown) => void;

/** 同一ページのRTC設定取得を共有し、非同期の失敗は最初の呼出元へ通知する。 */
export class SincroRTCConfigManager {
    private static instance: SincroRTCConfigManager;
    config?: SincroRTCConfig;
    private loading?: Promise<SincroRTCConfig>;

    private constructor() {}

    /** 初回だけ設定を取得する。取得完了まではconfigが未設定になる。 */
    static getManager(onerror: ErrorHandler): SincroRTCConfigManager {
        if (!SincroRTCConfigManager.instance) {
            SincroRTCConfigManager.instance = new SincroRTCConfigManager();
            // 非同期失敗をこの境界で一度通知し、診断には固定分類だけを渡す。
            void SincroRTCConfigManager.instance.getConfig().catch((error: unknown) => {
                frontendLogger.error("Failed to fetch RTC config.", { error });
                onerror(error);
            });
        }
        return SincroRTCConfigManager.instance;
    }

    /** 設定取得を共有して開始要求を待たせ、失敗後は明示的な次の開始で再取得する。 */
    getConfig(): Promise<SincroRTCConfig> {
        if (this.config !== undefined) return Promise.resolve(this.config);
        if (this.loading !== undefined) return this.loading;
        this.loading = this.getServers().finally(() => {
            this.loading = undefined;
        });
        return this.loading;
    }

    /** 本文まで10秒で取得し、未検証の設定を接続側へ渡さない。 */
    private async getServers(): Promise<SincroRTCConfig> {
        const response: Response = await fetch("/api/v1/RTCSignalingServer/config.json", {
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            const err = new Error(
                `Failed to fetch /api/v1/RTCSignalingServer/config.json: ${response.statusText}`,
            );
            throw err;
        }
        const configJson: unknown = await response.json();
        this.config = parseSincroRTCConfig(configJson);
        return this.config;
    }
}
