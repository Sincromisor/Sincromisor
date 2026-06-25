import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import {
    type CanonicalUpperBodyState,
    parseCanonicalUpperBodyState,
} from "../../character/canonical/canonicalUpperBodyState";
import type {
    MotionDebugRecorderConfig,
    MotionDebugRecorderResult,
    MotionDebugRecorderState,
} from "../../character/motionEvaluation/motionDebugRecorder";
import {
    calculateMotionMetricSummary,
    type MotionMetricConfig,
    type MotionMetricSummary,
} from "../../character/motionEvaluation/motionMetrics";
import type { MotionReplayApplyContext } from "../../character/motionEvaluation/motionReplayPlayer";
import { MotionReplayPlayer } from "../../character/motionEvaluation/motionReplayPlayer";
import { createPoseReliabilityMap } from "../../character/reliability/poseReliabilityEstimator";
import {
    parseReliabilityMap,
    type ReliabilityMap,
} from "../../character/reliability/reliabilityMap";
import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    type SincroPoseRetargetConfig,
} from "../../character/retargeting/sincroPoseRetargeter";
import { VRMScene } from "../../character/scene/vrmScene";
import { TemporalStateEstimator } from "../../character/temporal/temporalStateEstimator";
import { parseTemporalUpperBodyState } from "../../character/temporal/temporalUpperBodyState";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    type CameraQualityPoseSample,
    type CameraQualityScore,
    createCameraQualityScore,
} from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { SincroTrackerWorkerStats } from "../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import { TrackerRuntime } from "../../features/gaze/trackingRuntime/trackerRuntime";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import { frontendLogger } from "../../shared/logging/appLogger";
import { formatError, requireElement } from "./dom";
import { requestMotionDebugCameraStream } from "./motionDebugCameraStream";
import {
    createMotionDebugCanonicalReliabilityInput,
    createMotionDebugCanonicalState,
} from "./motionDebugCanonicalState";
import { MotionDebugControls } from "./motionDebugControls";
import { MotionDebugFrameCapture } from "./motionDebugFrameCapture";
import { createMotionDebugLiveFinalPoseSnapshot } from "./motionDebugPhase6Snapshots";
import { MotionDebugRecordingController } from "./motionDebugRecordingController";
import { createFixtureVideoStream } from "./motionDebugVideoSource";
import { createMotionDebugViewerSnapshot } from "./motionDebugViewerModel";
import { MotionDebugPoseOverlayRenderer } from "./poseOverlayRenderer";
import type {
    MotionDebugApi,
    MotionDebugCameraState,
    MotionDebugLayerKey,
    MotionDebugRecordingDownloadResult,
    MotionDebugRenderMetrics,
    MotionDebugReplayFrameResult,
    MotionDebugReplayLoadResult,
    MotionDebugReplayMetricsResult,
    MotionDebugReplayState,
    MotionDebugRetargetUiConfig,
    MotionDebugSnapshot,
    MotionDebugStatus,
    MotionDebugViewerMode,
} from "./types";

const DEFAULT_VRM_URL = "/characters/default.vrm";
const VRM_URL_QUERY_PARAM = "vrm";
const POSE_TARGET_INFERENCE_FPS = 12;
const SNAPSHOT_RENDER_INTERVAL_MS = 180;
const DEFAULT_WAIT_FOR_POSE_TIMEOUT_MS = 10000;
const CAMERA_QUALITY_TIMING_HISTORY_LIMIT = 30;
const CAMERA_QUALITY_POSE_SAMPLE_LIMIT = 10;

function getMotionDebugVrmUrl(): string {
    const requestedUrl = new URLSearchParams(window.location.search).get(VRM_URL_QUERY_PARAM);
    if (!requestedUrl) {
        return DEFAULT_VRM_URL;
    }

    try {
        const resolvedUrl = new URL(requestedUrl, window.location.origin);
        if (resolvedUrl.origin !== window.location.origin) {
            frontendLogger.warn("Ignored cross-origin motion-debug VRM URL.", {
                requestedUrl,
            });
            return DEFAULT_VRM_URL;
        }
        if (!resolvedUrl.pathname.startsWith("/characters/")) {
            frontendLogger.warn("Ignored motion-debug VRM URL outside /characters/.", {
                requestedUrl,
            });
            return DEFAULT_VRM_URL;
        }
        return `${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`;
    } catch (error) {
        frontendLogger.warn("Ignored invalid motion-debug VRM URL.", {
            error: formatError(error),
            requestedUrl,
        });
        return DEFAULT_VRM_URL;
    }
}

function resolvePoseReliabilityMediaTimeMs(
    snapshot: SincroPoseMotionSnapshot,
    timing?: TrackerVideoFrameTiming,
): number {
    return timing?.mediaTimeMs ?? snapshot.lastUpdatedAtMs ?? 0;
}

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
    private readonly temporalEstimator = new TemporalStateEstimator();
    private readonly recording: MotionDebugRecordingController;
    private readonly replay = new MotionReplayPlayer<MotionDebugSnapshot>({
        applyPoseSnapshot: (snapshot, context) => this.applyReplayPoseSnapshot(snapshot, context),
        readSnapshot: () => this.getSnapshot(),
    });
    private readonly scene: VRMScene;
    private activeStream?: MediaStream;
    private activeFixtureVideo?: HTMLVideoElement;
    private activeFixtureUrl?: string;
    private replayTimerId?: number;
    private cameraSource: MotionDebugCameraState["source"] = "none";
    private status: MotionDebugStatus = "idle";
    private message = "待機中";
    private latestFaceSnapshot: SincroFaceMotionSnapshot =
        this.debugConsole.getSnapshot().sincroMotion.face;
    private latestPoseSnapshot: SincroPoseMotionSnapshot = DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT;
    private latestCanonical?: MotionDebugSnapshot["canonical"];
    private latestTemporal?: MotionDebugSnapshot["temporal"];
    private latestCanonicalReliabilityInput?: MotionDebugSnapshot["canonicalReliabilityInput"];
    private latestReliability?: MotionDebugSnapshot["reliability"];
    private latestTrackerStats: SincroTrackerWorkerStats =
        this.debugConsole.getSnapshot().sincroMotion.tracker;
    private latestFrameTiming?: TrackerVideoFrameTiming;
    private latestCameraQuality?: CameraQualityScore;
    private frameTimingHistory: TrackerVideoFrameTiming[] = [];
    private poseQualitySamples: CameraQualityPoseSample[] = [];
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
    private viewerMode: MotionDebugViewerMode = "live";
    private selectedLayer: MotionDebugLayerKey = "poseSnapshot";
    private viewerModePinned = false;
    private latestMetricSummary?: MotionMetricSummary;

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
        this.recording = new MotionDebugRecordingController({
            video: this.video,
            getActiveStream: () => this.activeStream,
            getCameraSource: () => this.cameraSource,
            getActiveFixtureUrl: () => this.activeFixtureUrl,
            getRetargetConfig: () => this.retargetConfig,
            getTrackerStats: () => this.latestTrackerStats,
            getDebugSnapshot: () => this.debugConsole.getSnapshot().sincroMotion,
            getFaceSnapshot: () => this.latestFaceSnapshot,
            getVrmUrl: () => getMotionDebugVrmUrl(),
            poseTargetInferenceFps: POSE_TARGET_INFERENCE_FPS,
            onCanonicalStateChange: (state) => {
                this.latestCanonical = state;
            },
            onCanonicalReliabilityInputChange: (state) => {
                this.latestCanonicalReliabilityInput = state;
            },
            onReliabilityStateChange: (state) => {
                this.latestReliability = state;
            },
            onTemporalStateChange: (state) => {
                this.latestTemporal = state;
            },
            onStateChange: (state) => {
                this.controls.renderRecordingState(state);
            },
        });
        this.scene = new VRMScene({
            canvasRoot: characterRoot,
            characterControlLayer,
            vrmUrl: getMotionDebugVrmUrl(),
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
        this.controls.renderRecordingState(this.recording.getState());
        window.addEventListener("beforeunload", () => {
            this.stopActiveRuntime("motion_debug_page_unload");
        });
    }

    async startCamera(): Promise<MotionDebugSnapshot> {
        this.setStatus("loading", "カメラ起動中");
        this.stopActiveRuntime("motion_debug_camera_restarting");
        this.activeFixtureUrl = undefined;
        const stream = await requestMotionDebugCameraStream();
        await this.startRuntimeWithStream(stream, "camera");
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
        const liveSnapshot: Omit<MotionDebugSnapshot, "viewer"> = {
            status: this.status,
            message: this.message,
            camera: this.cameraState(),
            recording: this.recording.getState(),
            pose: this.latestPoseSnapshot,
            reliability: this.latestReliability,
            canonical: this.latestCanonical,
            temporal: this.latestTemporal,
            canonicalReliabilityInput: this.latestCanonicalReliabilityInput,
            tracker: this.latestTrackerStats,
            poseRetarget: debugSnapshot.poseRetarget,
            poseRetargetRuntime: debugSnapshot.poseRetargetRuntime,
            finalPose: createMotionDebugLiveFinalPoseSnapshot(debugSnapshot.poseRetargetRuntime),
            render: this.renderMetrics(),
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
                metrics: this.latestMetricSummary,
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
        this.activeFixtureUrl = url;
        await this.startRuntimeWithStream(stream, "fixture");
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
        this.renderSnapshot();
        return result;
    }

    async downloadRecording(options?: {
        compression?: MotionDebugRecorderConfig["compression"];
    }): Promise<MotionDebugRecordingDownloadResult> {
        const result = await this.recording.download(options);
        this.controls.renderRecordingDownload(result);
        this.renderSnapshot();
        return result;
    }

    getRecordingState(): MotionDebugRecorderState {
        return this.recording.getState();
    }

    async loadRecording(fileOrText: unknown): Promise<MotionDebugReplayLoadResult> {
        this.clearReplayTimer();
        const textInput = await this.readReplayText(fileOrText);
        if (!textInput.ok) {
            return textInput;
        }

        const result = this.replay.loadRecordingText(textInput.text);
        this.resetCanonicalState();
        this.resetReliabilityState();
        this.resetTemporalState();
        if (result.ok) {
            this.stopActiveRuntime("motion_debug_replay_loaded");
            this.setStatus("stopped", "replay 読み込み済み");
        } else {
            this.setStatus("error", result.message);
        }
        this.renderSnapshot();
        return result;
    }

    startReplay(options: {
        mode: NonNullable<MotionDebugReplayState["mode"]>;
        autoplay?: boolean;
    }): MotionDebugReplayFrameResult {
        this.clearReplayTimer();
        this.stopActiveRuntime("motion_debug_replay_started");
        this.behaviorState.setTalkMode("sincro");
        const result = this.replay.startReplay({
            mode: options.mode,
            autoplay: options.autoplay,
        });
        if (result.ok) {
            this.setAutoViewerMode("replay");
        }
        this.updateReplayStatus(result, options.autoplay === true);
        if (result.ok && options.autoplay === true) {
            this.scheduleNextReplayFrame(result.frameIndex);
        }
        this.renderSnapshot();
        return result;
    }

    stepReplay(frameIndex: number): MotionDebugReplayFrameResult {
        this.clearReplayTimer();
        const result = this.replay.stepReplay(frameIndex);
        this.updateReplayStatus(result, false);
        this.renderSnapshot();
        return result;
    }

    stopReplay(): MotionDebugReplayState {
        this.clearReplayTimer();
        const state = this.replay.stopReplay();
        this.resetTemporalState();
        this.setStatus("stopped", "replay 停止中");
        this.renderSnapshot();
        return state;
    }

    getReplayState(): MotionDebugReplayState {
        return this.replay.getReplayState();
    }

    calculateReplayMetrics(config: MotionMetricConfig): MotionDebugReplayMetricsResult {
        if (!this.replay.hasLoadedRecording()) {
            return {
                ok: false,
                code: "no_recording_loaded",
                message: "Motion replay has no loaded recording.",
            };
        }
        const summary = calculateMotionMetricSummary(this.replay.replayFrames(), config);
        const result: MotionDebugReplayMetricsResult = {
            ok: true,
            summary,
        };
        this.latestMetricSummary = summary;
        this.setAutoViewerMode("metrics");
        this.renderSnapshot();
        return result;
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
                onFaceMotion: (snapshot, timing) => {
                    this.handleFaceMotion(snapshot, timing);
                },
                onPoseMotion: (snapshot, timing) => {
                    this.handlePoseMotion(snapshot, timing);
                },
                onPoseFallback: (snapshot, timing) => {
                    this.handlePoseFallback(snapshot, timing);
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
        this.clearReplayTimer();
        if (this.recording.getState().status === "recording") {
            this.recording.stop("source_stopped");
        }
        this.trackerRuntime.stopFaceTracking(reason);
        this.activeStream?.getTracks().forEach((track) => {
            track.stop();
        });
        this.activeFixtureVideo?.pause();
        this.activeFixtureVideo = undefined;
        this.activeFixtureUrl = undefined;
        this.activeStream = undefined;
        this.cameraSource = "none";
        this.latestFrameTiming = undefined;
        this.latestCameraQuality = undefined;
        this.frameTimingHistory = [];
        this.poseQualitySamples = [];
        this.resetCanonicalState();
        this.resetReliabilityState();
        this.resetTemporalState();
        this.behaviorState.setFaceMotionTrackingEnabled(false);
        this.behaviorState.setPoseMotionTrackingEnabled(false);
        this.controls.setStatus(this.status, this.message);
    }

    private async readReplayText(
        fileOrText: unknown,
    ): Promise<
        { ok: true; text: string } | { ok: false; code: "unsupported_input"; message: string }
    > {
        if (typeof fileOrText === "string") {
            return { ok: true, text: fileOrText };
        }
        if (typeof File !== "undefined" && fileOrText instanceof File) {
            return { ok: true, text: await fileOrText.text() };
        }
        return {
            ok: false,
            code: "unsupported_input",
            message: "Motion replay accepts only plain NDJSON string or File inputs.",
        };
    }

    private recordPoseFrame(
        snapshot: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const result = this.recording.recordPoseFrame(
            snapshot,
            timing,
            this.latestCameraQuality,
            this.latestValidReliability(),
        );
        if (result !== undefined && !result.ok) {
            frontendLogger.warn("Motion debug frame was not recorded.", {
                code: result.code,
                message: result.message,
            });
        }
    }

    private handleFaceMotion(
        snapshot: SincroFaceMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        this.latestFrameTiming = timing;
        this.latestFaceSnapshot = snapshot;
        this.behaviorState.applyFaceMotion(snapshot);
        this.debugConsole.updateSincroFaceMotion(snapshot);
    }

    private handlePoseMotion(
        snapshot: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const previousPose = this.latestPoseSnapshot;
        this.latestFrameTiming = timing;
        this.latestPoseSnapshot = snapshot;
        this.updateCameraQuality(snapshot, timing);
        this.updatePoseReliability(snapshot, previousPose, timing);
        this.behaviorState.applyPoseMotion(snapshot);
        this.debugConsole.updateSincroPoseMotion(snapshot);
        this.recordPoseFrame(snapshot, timing);
        this.overlayRenderer.render(snapshot, this.video);
    }

    private handlePoseFallback(
        snapshot: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const previousPose = this.latestPoseSnapshot;
        this.latestFrameTiming = timing;
        this.latestPoseSnapshot = snapshot;
        this.updateCameraQuality(snapshot, timing);
        this.updatePoseReliability(snapshot, previousPose, timing);
        this.behaviorState.applyPoseMotion(snapshot);
        this.debugConsole.updateSincroPoseMotion(snapshot);
        this.recordPoseFrame(snapshot, timing);
    }

    private applyReplayPoseSnapshot(
        snapshot: SincroPoseMotionSnapshot,
        context: MotionReplayApplyContext,
    ): MotionDebugSnapshot {
        const previousPose = this.latestPoseSnapshot;
        this.latestPoseSnapshot = snapshot;
        this.updateReplayReliability(snapshot, previousPose, context);
        this.updateReplayCanonical(snapshot, context);
        this.updateReplayTemporal(context);
        this.behaviorState.applyPoseMotion(snapshot, context.mediaTimeMs);
        this.debugConsole.updateSincroPoseMotion(snapshot);
        this.overlayRenderer.render(snapshot, this.video);
        this.scene.renderOnce(context.mediaTimeMs);
        return this.getSnapshot();
    }

    private updateReplayCanonical(
        snapshot: SincroPoseMotionSnapshot,
        context: MotionReplayApplyContext,
    ): void {
        if (context.frame.canonical !== undefined) {
            const parsed = parseCanonicalUpperBodyState(context.frame.canonical);
            this.latestCanonical = parsed.ok
                ? parsed.state
                : {
                      parseStatus: "invalid",
                      errors: parsed.errors,
                      raw: context.frame.canonical,
                  };
            this.latestCanonicalReliabilityInput = createMotionDebugCanonicalReliabilityInput(
                this.latestValidReliability(),
            );
            return;
        }

        const reliability = this.latestValidReliability();
        this.latestCanonical = createMotionDebugCanonicalState({
            pose: snapshot,
            face: this.latestFaceSnapshot,
            previous: this.latestValidCanonical(),
            mediaTimeMs: context.mediaTimeMs,
            reliability,
        });
        this.latestCanonicalReliabilityInput =
            createMotionDebugCanonicalReliabilityInput(reliability);
    }

    private latestValidCanonical(): CanonicalUpperBodyState | undefined {
        const canonical = this.latestCanonical;
        if (canonical === undefined || "parseStatus" in canonical) {
            return undefined;
        }
        return canonical;
    }

    private updateReplayTemporal(context: MotionReplayApplyContext): void {
        if (context.frame.temporal !== undefined) {
            const parsed = parseTemporalUpperBodyState(context.frame.temporal);
            this.latestTemporal = parsed.ok
                ? parsed.state
                : {
                      parseStatus: "invalid",
                      errors: parsed.errors,
                      raw: context.frame.temporal,
                  };
            return;
        }

        const canonical = this.latestValidCanonical();
        if (canonical === undefined) {
            this.latestTemporal = undefined;
            return;
        }
        this.latestTemporal = this.temporalEstimator.update({
            canonical,
            reliability: this.latestValidReliability(),
            mediaTimeMs: context.mediaTimeMs,
        });
    }

    private updatePoseReliability(
        snapshot: SincroPoseMotionSnapshot,
        previousPose: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const previousReliability = this.latestValidReliability();
        this.latestReliability = createPoseReliabilityMap({
            pose: snapshot,
            cameraQuality: this.latestCameraQuality,
            previous:
                previousReliability === undefined
                    ? undefined
                    : {
                          pose: previousPose,
                          mediaTimeMs: previousReliability.timestamp.mediaTimeMs,
                          reliability: previousReliability,
                      },
            mediaTimeMs: resolvePoseReliabilityMediaTimeMs(snapshot, timing),
            video: {
                width: this.video.videoWidth,
                height: this.video.videoHeight,
            },
        });
    }

    private updateReplayReliability(
        snapshot: SincroPoseMotionSnapshot,
        previousPose: SincroPoseMotionSnapshot,
        context: MotionReplayApplyContext,
    ): void {
        if (context.frame.reliability !== undefined) {
            const parsed = parseReliabilityMap(context.frame.reliability);
            this.latestReliability = parsed.ok
                ? parsed.map
                : {
                      parseStatus: "invalid",
                      errors: parsed.errors,
                      raw: context.frame.reliability,
                  };
            return;
        }

        const previousReliability = this.latestValidReliability();
        this.latestReliability = createPoseReliabilityMap({
            pose: snapshot,
            previous:
                previousReliability === undefined
                    ? undefined
                    : {
                          pose: previousPose,
                          mediaTimeMs: previousReliability.timestamp.mediaTimeMs,
                          reliability: previousReliability,
                      },
            mediaTimeMs: context.mediaTimeMs,
            video: context.frame.video,
        });
    }

    private latestValidReliability(): ReliabilityMap | undefined {
        const reliability = this.latestReliability;
        if (reliability === undefined || "parseStatus" in reliability) {
            return undefined;
        }
        return reliability;
    }

    private resetCanonicalState(): void {
        this.latestCanonical = undefined;
        this.latestCanonicalReliabilityInput = undefined;
        this.recording.resetCanonicalState();
    }

    private resetReliabilityState(): void {
        this.latestReliability = undefined;
        this.recording.resetReliabilityState();
    }

    private resetTemporalState(): void {
        this.latestTemporal = undefined;
        this.temporalEstimator.reset();
        this.recording.resetTemporalState();
    }

    private updateCameraQuality(
        snapshot: SincroPoseMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        if (timing !== undefined) {
            this.frameTimingHistory = [...this.frameTimingHistory, timing].slice(
                -CAMERA_QUALITY_TIMING_HISTORY_LIMIT,
            );
        }
        this.poseQualitySamples = [
            ...this.poseQualitySamples,
            {
                poseDetected: snapshot.detected,
                poseConfidence: snapshot.confidence,
            },
        ].slice(-CAMERA_QUALITY_POSE_SAMPLE_LIMIT);

        const [track] = this.activeStream?.getVideoTracks() ?? [];
        if (this.cameraSource === "none") {
            this.latestCameraQuality = undefined;
            return;
        }
        this.latestCameraQuality = createCameraQualityScore({
            source: this.cameraSource,
            trackSettings: track?.getSettings(),
            trackReadyState: track?.readyState,
            videoWidth: this.video.videoWidth,
            videoHeight: this.video.videoHeight,
            pose: snapshot,
            timing,
            timingHistory: this.frameTimingHistory,
            poseSamples: this.poseQualitySamples,
        });
    }

    private scheduleNextReplayFrame(currentFrameIndex: number): void {
        const nextFrameIndex = currentFrameIndex + 1;
        if (nextFrameIndex >= this.replay.frameCount()) {
            this.stopReplay();
            return;
        }

        const currentMediaTimeMs = this.replay.frameMediaTimeMs(currentFrameIndex);
        const nextMediaTimeMs = this.replay.frameMediaTimeMs(nextFrameIndex);
        const delayMs =
            currentMediaTimeMs === undefined || nextMediaTimeMs === undefined
                ? 0
                : Math.max(0, nextMediaTimeMs - currentMediaTimeMs);
        this.replayTimerId = window.setTimeout(() => {
            const result = this.replay.stepReplay(nextFrameIndex, { autoplay: true });
            this.updateReplayStatus(result, true);
            this.renderSnapshot();
            if (result.ok) {
                this.scheduleNextReplayFrame(result.frameIndex);
            }
        }, delayMs);
    }

    private clearReplayTimer(): void {
        if (this.replayTimerId === undefined) {
            return;
        }
        window.clearTimeout(this.replayTimerId);
        this.replayTimerId = undefined;
    }

    private updateReplayStatus(result: MotionDebugReplayFrameResult, autoplay: boolean): void {
        if (!result.ok) {
            this.setStatus("error", result.message);
            return;
        }
        this.setStatus(
            "running",
            autoplay
                ? `replay 再生中 ${result.frameIndex + 1}/${this.replay.frameCount()}`
                : `replay frame ${result.frameIndex}`,
        );
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
            startRecording: (config) => this.startRecording(config),
            stopRecording: () => this.stopRecording(),
            downloadRecording: (options) => this.downloadRecording(options),
            getRecordingState: () => this.getRecordingState(),
            loadRecording: (fileOrText) => this.loadRecording(fileOrText),
            startReplay: (options) => this.startReplay(options),
            stepReplay: (frameIndex) => this.stepReplay(frameIndex),
            stopReplay: () => this.stopReplay(),
            getReplayState: () => this.getReplayState(),
            calculateReplayMetrics: (config) => this.calculateReplayMetrics(config),
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

    private setAutoViewerMode(mode: MotionDebugViewerMode): void {
        if (this.viewerModePinned) {
            return;
        }
        this.viewerMode = mode;
    }

    private renderSnapshot(): void {
        this.lastSnapshotRenderedAtMs = performance.now();
        this.controls.renderRecordingState(this.recording.getState());
        this.controls.renderSnapshot(this.getSnapshot());
    }

    private cameraState(): MotionDebugCameraState {
        return {
            source: this.cameraSource,
            width: this.video.videoWidth,
            height: this.video.videoHeight,
            readyState: this.video.readyState,
            frameTiming: this.latestFrameTiming,
            quality: this.latestCameraQuality,
        };
    }

    private renderMetrics(): MotionDebugRenderMetrics {
        return {
            renderFps: this.renderFps,
            lastFrameCapturedAtMs: this.frameCapture.lastFrameCapturedAtMs(),
        };
    }
}
