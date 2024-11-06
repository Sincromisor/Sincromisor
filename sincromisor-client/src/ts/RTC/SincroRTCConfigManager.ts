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
                SincroRTCConfigManager.instance.getServers();
            } catch (err) {
                console.error(err);
                onerror(err);
            }
        }
        return SincroRTCConfigManager.instance;
    }

    private async getServers(): Promise<void> {
        const response: Response = await fetch('/config/RTCConfig.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch /config/RTCConfig.json: ${response.statusText}`);
        }
        this.config = await response.json();
    }
}
