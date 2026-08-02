import { frontendLogger } from "../../shared/logging/appLogger";
import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";
import { captureIceFailureDiagnostics } from "./diagnostics/rtcIceDiagnostics";
import { RtcStatsReporter } from "./diagnostics/rtcStatsReporter";

type RtcBundleDiagnosticsParams = {
    getPeerConnection: () => RTCPeerConnection;
    getSessionId: () => string | undefined;
    logger: DebugConsoleManager;
};

/**
 * replace可能なPeerConnectionに対するstats timerとfailure snapshotを所有する。
 *
 * timer callbackごとにcurrent bundleを取得するため、bundle replacement後も旧PCを観測しない。
 * 同generationのfailure snapshotは1回に抑え、復旧時に明示的に再armする。
 */
export class RtcBundleDiagnostics {
    private failureCaptured = false;
    private intervalId?: number;
    private readonly params: RtcBundleDiagnosticsParams;
    private readonly statsReporter: RtcStatsReporter;

    constructor(params: RtcBundleDiagnosticsParams) {
        this.params = params;
        this.statsReporter = new RtcStatsReporter(params.logger);
    }

    /** 現bundleを毎秒観測するstats collectorを開始し、既存timerは置き換える。 */
    start(): void {
        this.stop();
        this.intervalId = window.setInterval(() => {
            this.statsReporter.collectAndRender(this.params.getPeerConnection()).catch((error) => {
                frontendLogger.error("RTC stats collection failed.", { error });
            });
        }, 1_000);
    }

    /** stats timerを解放し、表示用集計stateをresetする。 */
    stop(): void {
        if (this.intervalId !== undefined) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        this.statsReporter.reset();
    }

    /** 接続復帰後、次のfailure generationでsnapshotを再取得できるようにする。 */
    resetFailureCapture(): void {
        this.failureCaptured = false;
    }

    /** 現generationの最初のICE failureだけをsession付きで採取する。 */
    async captureFailure(reason: string): Promise<void> {
        if (this.failureCaptured) {
            return;
        }
        this.failureCaptured = true;
        await captureIceFailureDiagnostics({
            logger: this.params.logger,
            peerConnection: this.params.getPeerConnection(),
            reason,
            sessionId: this.params.getSessionId(),
        });
    }
}
