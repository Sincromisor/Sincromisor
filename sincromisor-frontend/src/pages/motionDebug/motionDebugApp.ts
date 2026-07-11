/**
 * motion-debug page の developer-facing facade と window API 実装を束ねる app controller。
 * camera / fixture / replay / recording / scene runtime の cleanup 順序を調停し、tracker runtime や Worker の内部責務は持たない。
 */
import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import { createMotionDebugPhase7Snapshot } from "../../character/motionEvaluation/motionDebugPhase7Snapshot";
import type {
    MotionDebugRecorderConfig,
    MotionDebugRecorderResult,
    MotionDebugRecorderState,
} from "../../character/motionEvaluation/motionDebugRecorder";
import type { MotionMetricConfig } from "../../character/motionEvaluation/motionMetrics";
import type { MotionReplayPlayer } from "../../character/motionEvaluation/motionReplayPlayer";
import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    type SincroPoseRetargetConfig,
} from "../../character/retargeting/sincroPoseRetargeter";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { frontendLogger } from "../../shared/logging/appLogger";
import { formatError, requireElement } from "./dom";
import { mergeMotionDebugBehaviorPipelineFrame } from "./motionDebugBehaviorPipeline";
import { MotionDebugCameraRuntime } from "./motionDebugCameraRuntime";
import { MotionDebugControls } from "./motionDebugControls";
import { MotionDebugFrameCapture } from "./motionDebugFrameCapture";
import { MotionDebugMetricsRuntime } from "./motionDebugMetricsRuntime";
import { createMotionDebugLiveFinalPoseSnapshot } from "./motionDebugPhase6Snapshots";
import { MotionDebugRecordingController } from "./motionDebugRecordingController";
import { MotionDebugReplayRuntime } from "./motionDebugReplayRuntime";
import { MotionDebugSceneRuntime } from "./motionDebugSceneRuntime";
import { MotionDebugTrackerBridge } from "./motionDebugTrackerBridge";
import { createMotionDebugViewerSnapshot } from "./motionDebugViewerModel";
import { getMotionDebugVrmUrl } from "./motionDebugVrmUrl";
import { installMotionDebugWindowApi } from "./motionDebugWindowApi";
import { MotionDebugPoseOverlayRenderer } from "./poseOverlayRenderer";
import type {
    MotionDebugApi,
    MotionDebugLayerKey,
    MotionDebugOptimizationCandidateApiResult,
    MotionDebugQaRegressionApiResult,
    MotionDebugQaRegressionConfig,
    MotionDebugRecordingDownloadResult,
    MotionDebugReplayFrameResult,
    MotionDebugReplayLoadResult,
    MotionDebugReplayMetricsResult,
    MotionDebugReplayState,
    MotionDebugRetargetUiConfig,
    MotionDebugSnapshot,
    MotionDebugStartCameraOptions,
    MotionDebugStatus,
    MotionDebugViewerMode,
} from "./types";

const DEFAULT_WAIT_FOR_POSE_TIMEOUT_MS = 10000;

// motion-debug page は DOM、camera source、recording、replay、developer window API を所有する。
// RTC / chat / backend contract は所有せず、本番通信契約に影響しない開発者向け境界に閉じる。
export class MotionDebugApp implements MotionDebugApi {
    // reason: structure-threshold-exception developer window API facade keeps existing public method surface while delegating runtime ownership.
    private readonly video = requireElement("motionDebugCameraVideo", HTMLVideoElement);
    private readonly overlayCanvas = requireElement("motionDebugPoseOverlay", HTMLCanvasElement);
    private readonly debugConsole = DebugConsoleManager.getManager();
    private readonly behaviorState = CharacterBehaviorState.getManager();
    private readonly camera = new MotionDebugCameraRuntime(this.video);
    private readonly overlayRenderer = new MotionDebugPoseOverlayRenderer(this.overlayCanvas);
    private readonly frameCapture = new MotionDebugFrameCapture();
    private readonly controls: MotionDebugControls;
    private readonly recording: MotionDebugRecordingController;
    private readonly tracker: MotionDebugTrackerBridge;
    private readonly scene: MotionDebugSceneRuntime;
    private readonly replayRuntime: MotionDebugReplayRuntime;
    private readonly metricsRuntime: MotionDebugMetricsRuntime;
    private readonly replay: MotionReplayPlayer<MotionDebugSnapshot>;
    private status: MotionDebugStatus = "idle";
    private message = "待機中";
    private viewerMode: MotionDebugViewerMode = "live";
    private selectedLayer: MotionDebugLayerKey = "poseSnapshot";
    private viewerModePinned = false;
    private retargetConfig: MotionDebugRetargetUiConfig = {
        armIkMode: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMode,
        armIkStrength: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkStrength,
        armIkTargetScale: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkTargetScale,
        smoothingMs: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.smoothingMs,
        minConfidence: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.minConfidence,
    };

    constructor() {
        const vrmStage = requireElement("motionDebugVrmStage", HTMLDivElement);
        const characterRoot = requireElement("sincroCharacterBox", HTMLDivElement);
        const characterControlLayer = requireElement("sincroCharacterControlLayer", HTMLDivElement);
        this.controls = this.createControls();
        this.recording = this.createRecordingController();
        this.tracker = new MotionDebugTrackerBridge({
            video: this.video,
            camera: this.camera,
            behaviorState: this.behaviorState,
            debugConsole: this.debugConsole,
            overlayRenderer: this.overlayRenderer,
            recording: this.recording,
            onError: (error) => {
                this.handleError(error);
            },
        });
        this.scene = new MotionDebugSceneRuntime({
            characterRoot,
            characterControlLayer,
            vrmUrl: getMotionDebugVrmUrl(),
            initialRetargetConfig: this.retargetConfig,
            video: this.video,
            overlayRenderer: this.overlayRenderer,
            getLatestPoseSnapshot: () => this.tracker.snapshotState().pose,
            renderSnapshot: () => {
                this.renderSnapshot();
            },
        });
        this.replayRuntime = new MotionDebugReplayRuntime({
            tracker: this.tracker,
            behaviorState: this.behaviorState,
            debugConsole: this.debugConsole,
            scene: this.scene,
            getSnapshot: () => this.getSnapshot(),
            setStatus: (status, message) => {
                this.setStatus(status, message);
            },
            stopActiveRuntime: (reason) => {
                this.stopActiveRuntime(reason);
            },
            setAutoViewerMode: (mode) => {
                this.setAutoViewerMode(mode);
            },
            renderSnapshot: () => {
                this.renderSnapshot();
            },
        });
        this.replay = this.replayRuntime.player;
        this.metricsRuntime = this.createMetricsRuntime(this.replayRuntime);
        this.scene.startRenderLoop();
        this.behaviorState.setTalkMode("sincro");
        installMotionDebugWindowApi(this);
        this.setStatus("idle", "待機中");
        vrmStage.dataset.ready = "true";
        this.controls.syncConfig(this.retargetConfig);
        this.controls.renderRecordingState(this.recording.getState());
        window.addEventListener("beforeunload", () => {
            this.stopActiveRuntime("motion_debug_page_unload");
        });
    }

    async startCamera(options?: MotionDebugStartCameraOptions): Promise<MotionDebugSnapshot> {
        this.setStatus("loading", "カメラ起動中");
        this.stopActiveRuntime("motion_debug_camera_restarting");
        await this.startRuntimeWithStream(await this.camera.requestCamera(options));
        return this.getSnapshot();
    }

    stopCamera(): void {
        this.stopActiveRuntime("motion_debug_stopped");
        this.setAutoViewerMode("live");
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
        const trackerState = this.tracker.snapshotState();
        const replayState = this.replayRuntime.snapshotState();
        const liveSnapshot: Omit<MotionDebugSnapshot, "viewer"> = {
            status: this.status,
            message: this.message,
            camera: this.camera.state(),
            recording: this.recording.getState(),
            pose: trackerState.pose,
            hand: trackerState.hand,
            reliability: trackerState.reliability,
            canonical: replayState.canonical,
            temporal: replayState.temporal,
            intent: replayState.intent,
            postProcessing: replayState.postProcessing,
            canonicalReliabilityInput: replayState.canonicalReliabilityInput,
            tracker: trackerState.tracker,
            poseRetarget: debugSnapshot.poseRetarget,
            poseRetargetRuntime: debugSnapshot.poseRetargetRuntime,
            phase7: this.createLivePhase7Snapshot(),
            finalPose: createMotionDebugLiveFinalPoseSnapshot(debugSnapshot.poseRetargetRuntime),
            render: this.scene.renderMetrics(this.frameCapture),
        };
        return {
            ...liveSnapshot,
            viewer: createMotionDebugViewerSnapshot({
                mode: this.viewerMode,
                selectedLayer: this.selectedLayer,
                liveSnapshot,
                replayState: this.replay.getReplayState(),
                replayManifest: this.replay.replayManifest(),
                replayFrame: this.replay.replayFrame(),
                metrics: this.metricsRuntime.getLatestMetricSummary(),
            }),
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
                if (this.tracker.snapshotState().pose.detected) {
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
        await this.startRuntimeWithStream(await this.camera.requestFixture(url));
        return this.getSnapshot();
    }

    startRecording(config?: Partial<MotionDebugRecorderConfig>): MotionDebugRecorderResult {
        const result = this.recording.start(config);
        if (result.ok) {
            this.setAutoViewerMode("recording");
        }
        this.renderSnapshot();
        return result;
    }

    stopRecording(): MotionDebugRecorderResult {
        const result = this.recording.stop("user");
        this.replayRuntime.resetCanonicalState();
        this.tracker.resetReliabilityState();
        this.replayRuntime.resetTemporalState();
        this.renderSnapshot();
        return result;
    }

    async downloadRecording(options?: {
        compression?: MotionDebugRecorderConfig["compression"];
    }): Promise<MotionDebugRecordingDownloadResult> {
        // recording download は browser File/Blob 境界だけを扱い、replay log schema は変更しない。
        const result = await this.recording.download(options);
        this.controls.renderRecordingDownload(result);
        this.renderSnapshot();
        return result;
    }

    getRecordingState(): MotionDebugRecorderState {
        return this.recording.getState();
    }

    loadRecording(fileOrText: File | string): Promise<MotionDebugReplayLoadResult> {
        return this.replayRuntime.loadRecording(fileOrText);
    }

    startReplay(options: {
        mode: NonNullable<MotionDebugReplayState["mode"]>;
        autoplay?: boolean;
    }): MotionDebugReplayFrameResult {
        return this.replayRuntime.startReplay(options);
    }

    stepReplay(frameIndex: number): MotionDebugReplayFrameResult {
        return this.replayRuntime.stepReplay(frameIndex);
    }

    stopReplay(): MotionDebugReplayState {
        return this.replayRuntime.stopReplay();
    }

    getReplayState(): MotionDebugReplayState {
        return this.replayRuntime.getReplayState();
    }

    calculateReplayMetrics(config: MotionMetricConfig): MotionDebugReplayMetricsResult {
        return this.resolveMetricsRuntime().calculateReplayMetrics(config);
    }

    runQaRegression(
        config: MotionDebugQaRegressionConfig,
    ): Promise<MotionDebugQaRegressionApiResult> {
        return this.resolveMetricsRuntime().runQaRegression(config);
    }

    analyzeOptimizationCandidates(
        config: MotionDebugQaRegressionConfig,
    ): Promise<MotionDebugOptimizationCandidateApiResult> {
        return this.resolveMetricsRuntime().analyzeOptimizationCandidates(config);
    }

    private createControls(): MotionDebugControls {
        return new MotionDebugControls({
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
            onRecordStart: () => {
                this.startRecording();
            },
            onRecordStop: () => {
                this.stopRecording();
            },
            onRecordDownload: () => {
                this.downloadRecording().catch((error) => {
                    this.handleError(error);
                });
            },
            onRetargetConfigChange: (config) => {
                this.setRetargetConfig(config);
            },
            onViewerModeChange: (mode) => {
                this.viewerMode = mode;
                this.viewerModePinned = true;
                this.renderSnapshot();
            },
            onViewerLayerChange: (layer) => {
                this.selectedLayer = layer;
                this.renderSnapshot();
            },
        });
    }

    private createRecordingController(): MotionDebugRecordingController {
        return new MotionDebugRecordingController({
            video: this.video,
            getActiveStream: () => this.camera.getActiveStream(),
            getCameraSource: () => this.camera.getCameraSource(),
            getActiveFixtureUrl: () => this.camera.getActiveFixtureUrl(),
            getRetargetConfig: () => this.retargetConfig,
            getTrackerStats: () => this.tracker.snapshotState().tracker,
            getDebugSnapshot: () => this.debugConsole.getSnapshot().sincroMotion,
            getFaceSnapshot: () => this.tracker.snapshotState().face,
            getHandSnapshot: () => this.tracker.snapshotState().hand,
            getAvatarMotionProfile: () => this.scene.getAvatarMotionProfile(),
            getActivePerformanceProfile: () => this.camera.currentPerformanceProfile(),
            getVrmUrl: () => getMotionDebugVrmUrl(),
            onCanonicalStateChange: (state) => {
                this.replayRuntime.setCanonicalState(state);
            },
            onCanonicalReliabilityInputChange: (state) => {
                this.replayRuntime.setCanonicalReliabilityInput(state);
            },
            onReliabilityStateChange: (state) => {
                this.tracker.setReliabilityState(state);
            },
            onTemporalStateChange: (state) => {
                this.replayRuntime.setTemporalState(state);
                const trackerState = this.tracker.snapshotState();
                const updatedAtMs = state?.timestamp.mediaTimeMs ?? performance.now();
                this.behaviorState.applySincroMotionPipelineState(
                    mergeMotionDebugBehaviorPipelineFrame(
                        this.behaviorState.getSnapshot(updatedAtMs).sincroMotionPipeline,
                        {
                            face: trackerState.face,
                            pose: trackerState.pose,
                            hand: trackerState.hand,
                            reliability: this.tracker.latestValidReliability(),
                            temporal: state,
                            updatedAtMs,
                        },
                    ),
                );
            },
            onIntentStateChange: (state) => {
                this.replayRuntime.setIntentState(state);
            },
            onPostProcessingStateChange: (state) => {
                this.replayRuntime.setPostProcessingState(state);
            },
            onStateChange: (state) => {
                this.controls.renderRecordingState(state);
            },
        });
    }

    private createMetricsRuntime(
        replay: Pick<
            MotionDebugReplayRuntime,
            "player" | "replayManifest" | "replayFrames" | "createReplayLogText"
        >,
    ): MotionDebugMetricsRuntime {
        return new MotionDebugMetricsRuntime({
            replay,
            setAutoViewerMode: (mode) => {
                this.setAutoViewerMode(mode);
            },
            renderSnapshot: () => {
                this.renderSnapshot();
            },
        });
    }

    private resolveMetricsRuntime(): MotionDebugMetricsRuntime {
        if (this.metricsRuntime instanceof MotionDebugMetricsRuntime) {
            return this.metricsRuntime;
        }
        return this.createMetricsRuntime({
            player: this.replay,
            replayManifest: () => this.replay.replayManifest(),
            replayFrames: () => this.replay.replayFrames(),
            createReplayLogText: (manifest) =>
                [
                    JSON.stringify({ recordType: "manifest", manifest }),
                    ...this.replay
                        .replayFrames()
                        .map((frame) => JSON.stringify({ recordType: "frame", frame })),
                ].join("\n"),
        });
    }

    private async startRuntimeWithStream(input: {
        stream: MediaStream;
        source: "camera" | "fixture";
        performanceProfile: Parameters<MotionDebugTrackerBridge["start"]>[1];
    }): Promise<void> {
        const track = this.camera.activate(input);
        this.behaviorState.setTalkMode("sincro");
        this.behaviorState.setFaceMotionTrackingEnabled(true);
        this.behaviorState.setPoseMotionTrackingEnabled(true);
        await this.tracker.start(track, input.performanceProfile);
        await this.video.play();
        this.setStatus("running", input.source === "camera" ? "カメラ実行中" : "fixture 実行中");
    }

    private stopActiveRuntime(reason: string): void {
        this.replayRuntime.clearTimer();
        if (this.recording.getState().status === "recording") {
            this.recording.stop("source_stopped");
        }
        this.tracker.stop(reason);
        this.camera.stop();
        this.replayRuntime.resetCanonicalState();
        this.tracker.resetReliabilityState();
        this.replayRuntime.resetTemporalState();
        this.recording.resetCanonicalState();
        this.recording.resetReliabilityState();
        this.recording.resetTemporalState();
        this.behaviorState.setFaceMotionTrackingEnabled(false);
        this.behaviorState.setPoseMotionTrackingEnabled(false);
        this.behaviorState.applySincroMotionPipelineState(undefined);
        this.controls.setStatus(this.status, this.message);
    }

    private createLivePhase7Snapshot(): ReturnType<typeof createMotionDebugPhase7Snapshot> {
        return createMotionDebugPhase7Snapshot({
            profile: this.scene.getAvatarMotionProfile(),
            activeCanonicalCalibration: this.replayRuntime.latestValidCanonical()?.calibration,
        });
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

    private setStatus(status: MotionDebugStatus, message: string): void {
        this.status = status;
        this.message = message;
        this.controls.setStatus(status, message);
        this.renderSnapshot();
    }

    private setAutoViewerMode(mode: MotionDebugViewerMode): void {
        if (this.viewerModePinned) {
            return;
        }
        this.viewerMode = mode;
    }

    private renderSnapshot(): void {
        this.scene.markSnapshotRendered();
        this.controls.renderRecordingState(this.recording.getState());
        this.controls.renderSnapshot(this.getSnapshot());
    }
}
