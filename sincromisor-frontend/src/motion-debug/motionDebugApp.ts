import type { SincroFaceMotionSnapshot } from "../ts/faceTracking/sincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../ts/faceTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../ts/faceTracking/sincroTrackerWorkerTypes";
import { TrackerRuntime } from "../ts/faceTracking/trackerRuntime";
import { frontendLogger } from "../ts/logging/appLogger";
import { CharacterBehaviorState } from "../ts/sincroVrm/vrmCharacter/characterBehaviorState";
import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    type SincroPoseRetargetConfig,
} from "../ts/sincroVrm/vrmCharacter/sincroPoseRetargeter";
import { VRMScene } from "../ts/sincroVrm/vrmScene/vrmScene";
import { DebugConsoleManager } from "../ts/ui/debugConsoleManager";
import { formatError, requireElement } from "./dom";
import { requestMotionDebugCameraStream } from "./motionDebugCameraStream";
import { MotionDebugControls } from "./motionDebugControls";
import { MotionDebugFrameCapture } from "./motionDebugFrameCapture";
import { createFixtureVideoStream } from "./motionDebugVideoSource";
import { MotionDebugPoseOverlayRenderer } from "./poseOverlayRenderer";
import type {
    MotionDebugApi,
    MotionDebugCameraState,
    MotionDebugRenderMetrics,
    MotionDebugRetargetUiConfig,
    MotionDebugSnapshot,
    MotionDebugStatus,
} from "./types";

const DEFAULT_VRM_URL = "/characters/default.vrm";
const POSE_TARGET_INFERENCE_FPS = 12;
const SNAPSHOT_RENDER_INTERVAL_MS = 180;
const DEFAULT_WAIT_FOR_POSE_TIMEOUT_MS = 10000;

// IK 調整ページの所有境界。RTC/chat/dialog を持ち込まず、
// camera/video -> TrackerRuntime -> CharacterBehaviorState -> VRMScene の経路だけを接続する。
export class MotionDebugApp {
    private readonly video = requireElement("motionDebugCameraVideo", HTMLVideoElement);
    private readonly overlayCanvas = requireElement("motionDebugPoseOverlay", HTMLCanvasElement);
    private readonly controls: MotionDebugControls;
    private readonly debugConsole = DebugConsoleManager.getManager();
    private readonly behaviorState = CharacterBehaviorState.getManager();
    private readonly trackerRuntime = new TrackerRuntime(this.video);
    private readonly overlayRenderer = new MotionDebugPoseOverlayRenderer(this.overlayCanvas);
    private readonly frameCapture = new MotionDebugFrameCapture();
    private readonly scene: VRMScene;
    private activeStream?: MediaStream;
    private activeFixtureVideo?: HTMLVideoElement;
    private cameraSource: MotionDebugCameraState["source"] = "none";
    private status: MotionDebugStatus = "idle";
    private message = "待機中";
    private latestPoseSnapshot: SincroPoseMotionSnapshot = DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT;
    private latestTrackerStats: SincroTrackerWorkerStats =
        this.debugConsole.getSnapshot().sincroMotion.tracker;
    private retargetConfig: MotionDebugRetargetUiConfig = {
        armIkMode: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMode,
        armIkStrength: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkStrength,
        armIkTargetScale: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkTargetScale,
        smoothingMs: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.smoothingMs,
        minConfidence: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.minConfidence,
    };
    private lastSnapshotRenderedAtMs = 0;
    private renderFps = 0;
    private renderFrames = 0;
    private renderFpsStartedAtMs = performance.now();

    constructor() {
        const vrmStage = requireElement("motionDebugVrmStage", HTMLDivElement);
        const characterRoot = requireElement("sincroCharacterBox", HTMLDivElement);
        const characterControlLayer = requireElement("sincroCharacterControlLayer", HTMLDivElement);
        this.controls = new MotionDebugControls({
            onStart: () => {
                this.startCamera().catch((error) => {
                    this.handleError(error);
                });
            },
            onStop: () => {
                this.stopCamera();
            },
            onCapture: () => {
                this.handleCaptureButton();
            },
            onRetargetConfigChange: (config) => {
                this.setRetargetConfig(config);
            },
        });
        this.scene = new VRMScene({
            canvasRoot: characterRoot,
            characterControlLayer,
            vrmUrl: DEFAULT_VRM_URL,
            xrMode: false,
        });
        this.scene.start();
        this.scene.setSincroPoseRetargetConfig(this.retargetConfig);
        this.behaviorState.setTalkMode("sincro");
        this.installWindowApi();
        this.startRenderLoop();
        this.setStatus("idle", "待機中");
        vrmStage.dataset.ready = "true";
        this.controls.syncConfig(this.retargetConfig);
        window.addEventListener("beforeunload", () => {
            this.stopActiveRuntime("motion_debug_page_unload");
        });
    }

    async startCamera(): Promise<MotionDebugSnapshot> {
        this.setStatus("loading", "カメラ起動中");
        this.stopActiveRuntime("motion_debug_camera_restarting");
        const stream = await requestMotionDebugCameraStream();
        await this.startRuntimeWithStream(stream, "camera");
        return this.getSnapshot();
    }

    stopCamera(): void {
        this.stopActiveRuntime("motion_debug_stopped");
        this.setStatus("stopped", "停止中");
        this.renderSnapshot();
    }

    setRetargetConfig(config: Partial<SincroPoseRetargetConfig>): MotionDebugSnapshot {
        this.retargetConfig = {
            ...this.retargetConfig,
            ...this.controls.pickRetargetConfig(config, this.retargetConfig),
        };
        this.scene.setSincroPoseRetargetConfig(this.retargetConfig);
        this.debugConsole.setSincroPoseRetargetConfig(this.retargetConfig);
        this.controls.syncConfig(this.retargetConfig);
        this.renderSnapshot();
        return this.getSnapshot();
    }

    getSnapshot(): MotionDebugSnapshot {
        const debugSnapshot = this.debugConsole.getSnapshot().sincroMotion;
        return {
            status: this.status,
            message: this.message,
            camera: this.cameraState(),
            pose: this.latestPoseSnapshot,
            tracker: this.latestTrackerStats,
            poseRetarget: debugSnapshot.poseRetarget,
            poseRetargetRuntime: debugSnapshot.poseRetargetRuntime,
            render: this.renderMetrics(),
        };
    }

    captureFrame(): string {
        return this.frameCapture.capture(this.video, this.overlayCanvas);
    }

    waitForPoseDetected(
        timeoutMs: number = DEFAULT_WAIT_FOR_POSE_TIMEOUT_MS,
    ): Promise<MotionDebugSnapshot> {
        const startedAtMs = performance.now();
        return new Promise((resolve, reject) => {
            const wait = () => {
                if (this.latestPoseSnapshot.detected) {
                    resolve(this.getSnapshot());
                    return;
                }
                if (performance.now() - startedAtMs >= timeoutMs) {
                    reject(new Error(`Pose was not detected within ${timeoutMs}ms.`));
                    return;
                }
                window.setTimeout(wait, 80);
            };
            wait();
        });
    }

    async loadVideoFixture(url: string): Promise<MotionDebugSnapshot> {
        this.setStatus("loading", "動画 fixture 読み込み中");
        this.stopActiveRuntime("motion_debug_fixture_restarting");
        const { stream, video } = await createFixtureVideoStream(url);
        this.activeFixtureVideo = video;
        await this.startRuntimeWithStream(stream, "fixture");
        return this.getSnapshot();
    }

    private async startRuntimeWithStream(
        stream: MediaStream,
        source: MotionDebugCameraState["source"],
    ): Promise<void> {
        const [track] = stream.getVideoTracks();
        if (!track) {
            throw new Error("Video stream does not contain a video track.");
        }
        this.activeStream = stream;
        this.cameraSource = source;
        this.behaviorState.setTalkMode("sincro");
        this.behaviorState.setFaceMotionTrackingEnabled(true);
        this.behaviorState.setPoseMotionTrackingEnabled(true);
        await this.trackerRuntime.startFaceTracking(
            track,
            {
                onFaceMotion: (snapshot) => {
                    this.handleFaceMotion(snapshot);
                },
                onPoseMotion: (snapshot) => {
                    this.handlePoseMotion(snapshot);
                },
                onPoseFallback: (snapshot) => {
                    this.handlePoseFallback(snapshot);
                },
                onTrackerStats: (snapshot) => {
                    this.latestTrackerStats = snapshot;
                    this.debugConsole.updateSincroTrackerStats(snapshot);
                },
                onError: (error) => {
                    this.handleError(error);
                },
            },
            undefined,
            {
                enabled: true,
                targetInferenceFps: POSE_TARGET_INFERENCE_FPS,
                ignorePerformanceFallback: true,
            },
        );
        await this.video.play();
        this.setStatus("running", source === "camera" ? "カメラ実行中" : "fixture 実行中");
    }

    private stopActiveRuntime(reason: string): void {
        this.trackerRuntime.stopFaceTracking(reason);
        this.activeStream?.getTracks().forEach((track) => {
            track.stop();
        });
        this.activeFixtureVideo?.pause();
        this.activeFixtureVideo = undefined;
        this.activeStream = undefined;
        this.cameraSource = "none";
        this.behaviorState.setFaceMotionTrackingEnabled(false);
        this.behaviorState.setPoseMotionTrackingEnabled(false);
        this.controls.setStatus(this.status, this.message);
    }

    private handleFaceMotion(snapshot: SincroFaceMotionSnapshot): void {
        this.behaviorState.applyFaceMotion(snapshot);
        this.debugConsole.updateSincroFaceMotion(snapshot);
    }

    private handlePoseMotion(snapshot: SincroPoseMotionSnapshot): void {
        this.latestPoseSnapshot = snapshot;
        this.behaviorState.applyPoseMotion(snapshot);
        this.debugConsole.updateSincroPoseMotion(snapshot);
        this.overlayRenderer.render(snapshot, this.video);
    }

    private handlePoseFallback(snapshot: SincroPoseMotionSnapshot): void {
        this.latestPoseSnapshot = snapshot;
        this.behaviorState.applyPoseMotion(snapshot);
        this.debugConsole.updateSincroPoseMotion(snapshot);
    }

    private handleCaptureButton(): void {
        const dataUrl = this.captureFrame();
        this.controls.renderCapture(dataUrl, this.frameCapture.lastFrameCapturedAtMs());
        this.renderSnapshot();
    }

    private handleError(error: unknown): void {
        const message = formatError(error);
        this.behaviorState.setErrorSource("motionDebug", message);
        this.setStatus("error", message);
        frontendLogger.error("Motion debug operation failed.", { error });
    }

    private installWindowApi(): void {
        const api: MotionDebugApi = {
            startCamera: () => this.startCamera(),
            stopCamera: () => {
                this.stopCamera();
            },
            setRetargetConfig: (config) => this.setRetargetConfig(config),
            getSnapshot: () => this.getSnapshot(),
            captureFrame: () => this.captureFrame(),
            waitForPoseDetected: (timeoutMs) => this.waitForPoseDetected(timeoutMs),
            loadVideoFixture: (url) => this.loadVideoFixture(url),
        };
        window.__SINCRO_MOTION_DEBUG__ = api;
    }

    private startRenderLoop(): void {
        window.requestAnimationFrame(() => {
            this.startRenderLoop();
            this.updateRenderFps();
            this.overlayRenderer.render(this.latestPoseSnapshot, this.video);
            if (performance.now() - this.lastSnapshotRenderedAtMs >= SNAPSHOT_RENDER_INTERVAL_MS) {
                this.renderSnapshot();
            }
        });
    }

    private updateRenderFps(): void {
        this.renderFrames += 1;
        const nowMs = performance.now();
        const elapsedMs = nowMs - this.renderFpsStartedAtMs;
        if (elapsedMs < 500) {
            return;
        }
        this.renderFps = (this.renderFrames * 1000) / elapsedMs;
        this.renderFrames = 0;
        this.renderFpsStartedAtMs = nowMs;
    }

    private setStatus(status: MotionDebugStatus, message: string): void {
        this.status = status;
        this.message = message;
        this.controls.setStatus(status, message);
        this.renderSnapshot();
    }

    private renderSnapshot(): void {
        this.lastSnapshotRenderedAtMs = performance.now();
        this.controls.renderSnapshot(this.getSnapshot());
    }

    private cameraState(): MotionDebugCameraState {
        return {
            source: this.cameraSource,
            width: this.video.videoWidth,
            height: this.video.videoHeight,
            readyState: this.video.readyState,
        };
    }

    private renderMetrics(): MotionDebugRenderMetrics {
        return {
            renderFps: this.renderFps,
            lastFrameCapturedAtMs: this.frameCapture.lastFrameCapturedAtMs(),
        };
    }
}
