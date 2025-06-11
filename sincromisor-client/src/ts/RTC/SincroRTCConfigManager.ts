export interface IceServerConfig {
    urls: string;
    username?: string;
    credential?: string;
}

export interface SincroRTCConfig {
    offerURL: string,
    iceServers: IceServerConfig[]
}

export class SincroRTCConfigManager {
    private static instance: SincroRTCConfigManager;
    config: SincroRTCConfig | null = null;

    private constructor() {
    }

    static getManager(onerror: (err: any) => void) {
        if (!SincroRTCConfigManager.instance) {
            SincroRTCConfigManager.instance = new SincroRTCConfigManager();
            try {
                SincroRTCConfigManager.instance.getServers(onerror);
            } catch (err) {
                console.error(err);
                onerror(err);
            }
        }
        return SincroRTCConfigManager.instance;
    }

    private async getServers(onerror: (err: any) => void): Promise<void> {
        const response: Response = await fetch('/api/v1/RTCSignalingServer/config.json');
        if (!response.ok) {
            const err = new Error(`Failed to fetch /api/v1/RTCSignalingServer/config.json: ${response.statusText}`);
            onerror(err);
            throw err;
        }
        this.config = await response.json();
    }
}
