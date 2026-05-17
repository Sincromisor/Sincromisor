export type IceServerConfig = {
    urls: string | string[];
    username?: string;
    credential?: string;
};

export type SincroRTCConfig = {
    // 初回シグナリング（Offer/Answer）用エンドポイント
    offerURL: string;
    // Trickle ICEで候補を後送するエンドポイント
    candidateURL: string;
    iceServers: IceServerConfig[];
};

type UnknownRecord = Record<string, unknown>;
type ErrorHandler = (err: unknown) => void;

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null;
}

function parseIceServerUrls(value: unknown): string | string[] {
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value) && value.every((url) => typeof url === "string")) {
        return value;
    }
    throw new Error("Invalid RTC config: iceServers entry must include urls.");
}

function parseIceServerConfig(value: unknown): IceServerConfig {
    if (!isRecord(value)) {
        throw new Error("Invalid RTC config: iceServers entry must be an object.");
    }
    const config: IceServerConfig = { urls: parseIceServerUrls(value.urls) };
    if (typeof value.username === "string") {
        config.username = value.username;
    }
    if (typeof value.credential === "string") {
        config.credential = value.credential;
    }
    return config;
}

function parseSincroRTCConfig(value: unknown): SincroRTCConfig {
    if (
        !isRecord(value) ||
        typeof value.offerURL !== "string" ||
        typeof value.candidateURL !== "string" ||
        !Array.isArray(value.iceServers)
    ) {
        throw new Error("Invalid RTC config response.");
    }
    return {
        offerURL: value.offerURL,
        candidateURL: value.candidateURL,
        iceServers: value.iceServers.map(parseIceServerConfig),
    };
}

export class SincroRTCConfigManager {
    private static instance: SincroRTCConfigManager;
    config: SincroRTCConfig | null = null;

    private constructor() {}

    static getManager(onerror: ErrorHandler): SincroRTCConfigManager {
        if (!SincroRTCConfigManager.instance) {
            SincroRTCConfigManager.instance = new SincroRTCConfigManager();
            try {
                void SincroRTCConfigManager.instance.getServers(onerror);
            } catch (err) {
                console.error(err);
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
