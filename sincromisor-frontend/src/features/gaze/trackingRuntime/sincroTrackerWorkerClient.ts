import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type {
    SincroTrackerWorkerOutputMessage,
    SincroTrackerWorkerStats,
    SincroTrackerWorkerStatus,
} from "./sincroTrackerWorkerTypes";

type DetectResult = {
    face: SincroFaceMotionSnapshot;
    pose?: SincroPoseMotionSnapshot;
    hand?: SincroHandMotionSnapshot;
    stats: SincroTrackerWorkerStats;
};

type PendingDetect = {
    requestId: number;
    sentAtMs: number;
    resolve: (result: DetectResult) => void;
    reject: (reason: Error) => void;
};

const DEFAULT_STATS: SincroTrackerWorkerStats = {
    mode: "worker",
    status: "idle",
    transferTimeMs: 0,
    workerRoundTripMs: 0,
    loadTimeMs: 0,
    droppedFrames: 0,
};

// MediaPipe の同期推論を Worker へ隔離する main-thread 側 adapter。
// Runtime には snapshot 契約だけを返し、Worker の message protocol を UI/VRM 層へ漏らさない。
export class SincroTrackerWorkerClient {
    private worker?: Worker;
    private initPromise?: Promise<void>;
    private pendingInitResolve?: () => void;
    private pendingInitReject?: (reason: Error) => void;
    private pendingDetect?: PendingDetect;
    private requestId = 0;
    private stats: SincroTrackerWorkerStats = { ...DEFAULT_STATS };
    private readonly onStatsChanged: (stats: SincroTrackerWorkerStats) => void;

    constructor(onStatsChanged: (stats: SincroTrackerWorkerStats) => void = () => {}) {
        this.onStatsChanged = onStatsChanged;
    }

    static isSupported(): boolean {
        return typeof Worker !== "undefined" && typeof createImageBitmap === "function";
    }

    async init(poseEnabled: boolean, handEnabled: boolean): Promise<void> {
        if (!SincroTrackerWorkerClient.isSupported()) {
            throw new Error("Sincro tracker worker is not supported in this browser.");
        }
        this.ensureWorker();
        if (!this.initPromise) {
            this.stats = {
                ...this.stats,
                status: "loading",
                fallbackReason: undefined,
            };
            this.publishStats();
            this.initPromise = new Promise<void>((resolve, reject) => {
                this.pendingInitResolve = resolve;
                this.pendingInitReject = reject;
            });
            this.worker?.postMessage({ type: "init", poseEnabled, handEnabled });
        } else if (poseEnabled || handEnabled) {
            this.worker?.postMessage({ type: "init", poseEnabled, handEnabled });
        }
        await this.initPromise;
    }

    async detect(
        frame: ImageBitmap,
        timestampMs: number,
        poseEnabled: boolean,
        handEnabled: boolean,
        transferTimeMs: number,
    ): Promise<DetectResult> {
        if (!this.worker) {
            frame.close();
            throw new Error("Sincro tracker worker is not running.");
        }
        if (this.pendingDetect) {
            frame.close();
            this.stats = {
                ...this.stats,
                droppedFrames: this.stats.droppedFrames + 1,
            };
            this.publishStats();
            throw new Error("Sincro tracker worker is still processing the previous frame.");
        }

        const requestId = this.requestId + 1;
        this.requestId = requestId;
        return new Promise<DetectResult>((resolve, reject) => {
            this.pendingDetect = {
                requestId,
                sentAtMs: performance.now(),
                resolve,
                reject,
            };
            this.stats = {
                ...this.stats,
                status: "running",
                transferTimeMs,
            };
            this.publishStats();
            this.worker?.postMessage(
                {
                    type: "detect",
                    requestId,
                    frame,
                    timestampMs,
                    poseEnabled,
                    handEnabled,
                },
                [frame],
            );
        });
    }

    stop(reason?: string): void {
        this.pendingDetect?.reject(new Error(reason ?? "Sincro tracker worker stopped."));
        this.pendingDetect = undefined;
        this.worker?.postMessage({
            type: "stop",
            reason,
            nowMs: performance.now(),
        });
        this.stats = {
            ...this.stats,
            status: "idle",
        };
        this.publishStats();
    }

    dispose(): void {
        this.worker?.postMessage({ type: "dispose" });
        this.worker?.terminate();
        this.worker = undefined;
        this.initPromise = undefined;
        this.pendingInitResolve = undefined;
        this.pendingInitReject = undefined;
        this.pendingDetect = undefined;
        this.stats = { ...DEFAULT_STATS };
        this.publishStats();
    }

    getStats(): SincroTrackerWorkerStats {
        return { ...this.stats };
    }

    private ensureWorker(): void {
        if (this.worker) {
            return;
        }
        const worker = new Worker(new URL("./sincroTracker.worker.ts", import.meta.url), {
            type: "module",
        });
        this.worker = worker;
        worker.onmessage = (event: MessageEvent<SincroTrackerWorkerOutputMessage>) =>
            this.handleWorkerMessage(event.data);
        worker.onerror = (event: ErrorEvent) => {
            this.handleWorkerFailure(new Error(event.message));
        };
    }

    private handleWorkerMessage(message: SincroTrackerWorkerOutputMessage): void {
        if (message.type === "status") {
            this.applyStatus(message.status, message.message, message.loadTimeMs);
            if (message.status === "ready") {
                this.pendingInitResolve?.();
                this.pendingInitResolve = undefined;
                this.pendingInitReject = undefined;
            }
            if (message.status === "unavailable") {
                this.handleWorkerFailure(
                    new Error(message.message ?? "Sincro tracker worker unavailable."),
                );
            }
            return;
        }
        if (message.type === "result") {
            const pending = this.pendingDetect;
            if (!pending || pending.requestId !== message.requestId) {
                this.stats = {
                    ...this.stats,
                    droppedFrames: this.stats.droppedFrames + 1,
                };
                this.publishStats();
                return;
            }
            this.pendingDetect = undefined;
            this.stats = {
                ...this.stats,
                status: "running",
                workerRoundTripMs: performance.now() - pending.sentAtMs,
                workerTimeMs: message.workerTimeMs,
                fallbackReason: undefined,
            };
            this.publishStats();
            pending.resolve({
                face: message.face,
                pose: message.pose,
                hand: message.hand,
                stats: this.getStats(),
            });
            return;
        }
        if (message.type === "stopped") {
            this.stats = {
                ...this.stats,
                status: "idle",
            };
            this.publishStats();
            return;
        }
        this.handleWorkerFailure(new Error(message.message));
    }

    private applyStatus(
        status: SincroTrackerWorkerStatus,
        message = "",
        loadTimeMs?: number,
    ): void {
        this.stats = {
            ...this.stats,
            status,
            loadTimeMs: loadTimeMs ?? this.stats.loadTimeMs,
            fallbackReason: status === "unavailable" ? message : this.stats.fallbackReason,
        };
        this.publishStats();
    }

    private handleWorkerFailure(error: Error): void {
        this.pendingInitReject?.(error);
        this.pendingDetect?.reject(error);
        this.pendingInitResolve = undefined;
        this.pendingInitReject = undefined;
        this.pendingDetect = undefined;
        this.initPromise = undefined;
        this.stats = {
            ...this.stats,
            mode: "fallback",
            status: "fallback",
            fallbackReason: error.message,
        };
        this.publishStats();
    }

    private publishStats(): void {
        this.onStatsChanged(this.getStats());
    }
}
