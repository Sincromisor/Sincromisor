/**
 * Tracker Worker 内で Face / Pose / Hand tracker を所有し、detect message を低次元 snapshot へ変換する境界。
 * Worker は MediaPipe instance と最新 pose だけを保持し、UI 更新、VRM 適用、motion-debug recorder の責務を持たない。
 */
import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
import type { SincroGestureMotionSnapshot } from "../gestureTracking/sincroGestureMotionSnapshot";
import { createSincroGestureFallbackSnapshot } from "../gestureTracking/sincroGestureMotionSnapshot";
import type { SincroGestureTracker } from "../gestureTracking/sincroGestureTracker";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import { createSincroHandFallbackSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroHandTracker } from "../handTracking/sincroHandTracker";
import { DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT } from "../poseTracking/sincroPoseMotionSnapshot";
import type { SincroPoseTracker } from "../poseTracking/sincroPoseTracker";
import { createTrackerRuntimeMediaPipeRawResult } from "./mediaPipeRawResultSerializer";
import type {
    SincroTrackerWorkerDetectMessage,
    SincroTrackerWorkerInputMessage,
    SincroTrackerWorkerOutputMessage,
    SincroTrackerWorkerStatus,
} from "./sincroTrackerWorkerTypes";
import {
    createWorkerGestureDurationFields,
    measureWorkerTrackerFrame,
} from "./trackerRuntimeDurationMeasurement";

type MediaPipeWorkerGlobal = typeof self & {
    import?: (path: string) => Promise<unknown>;
};

const mediaPipeWorkerGlobal: MediaPipeWorkerGlobal = self;

// MediaPipe Tasks Vision の wasm loader は Worker global の `import()` hook を参照する。
// module Worker では `self.import` が標準提供されないため、MediaPipe を読み込む前に dynamic import へ橋渡しする。
mediaPipeWorkerGlobal.import ??= async (path: string) => {
    const response = await fetch(normalizeMediaPipeImportPath(path));
    if (!response.ok) {
        throw new Error(
            `Failed to fetch MediaPipe wasm loader: ${response.status} ${response.statusText}`,
        );
    }
    // MediaPipe's fallback path expects the classic Emscripten loader to publish
    // `ModuleFactory` on the Worker global. Module workers cannot use importScripts(),
    // so we fetch the public loader and evaluate it in the Worker global scope.
    const code = await response.text();
    new Function(
        "self",
        `${code}\n;self.ModuleFactory = typeof ModuleFactory !== "undefined" ? ModuleFactory : self.ModuleFactory;`,
    )(self);
};

let faceTracker: SincroFaceTracker | undefined;
let poseTracker: SincroPoseTracker | undefined;
let handTracker: SincroHandTracker | undefined;
let gestureTracker: SincroGestureTracker | undefined;

let poseInitialized = false;
let handInitialized = false;
let handInitializationFailureReason: string | undefined;
let gestureInitialized = false;
let gestureInitializationFailureReason: string | undefined;
let initializing: Promise<void> | undefined;
let latestPose: ReturnType<SincroPoseTracker["detect"]> | undefined;

function post(message: SincroTrackerWorkerOutputMessage): void {
    self.postMessage(message);
}

function postStatus(status: SincroTrackerWorkerStatus, message = "", loadTimeMs?: number): void {
    post({
        type: "status",
        status,
        message,
        loadTimeMs,
    });
}

async function initialize(
    poseEnabled: boolean,
    handEnabled: boolean,
    gestureEnabled: boolean,
    faceRoiEnabled: boolean,
): Promise<void> {
    await ensureTrackers();
    if (initializing) {
        await initializing;
        if ((poseEnabled || faceRoiEnabled || handEnabled || gestureEnabled) && !poseInitialized) {
            await initializePose();
        }
        if (handEnabled && !handInitialized) {
            await initializeHand();
        }
        if (gestureEnabled && !gestureInitialized) {
            await initializeGesture();
        }
        return;
    }
    const startedAtMs = performance.now();
    postStatus("loading", loadingMessage(poseEnabled, handEnabled, gestureEnabled, faceRoiEnabled));
    const currentFaceTracker = faceTracker;
    if (!currentFaceTracker) {
        throw new Error("SincroFaceTracker is not loaded.");
    }
    initializing = (async () => {
        await currentFaceTracker.initVision();
        if (poseEnabled || faceRoiEnabled || handEnabled || gestureEnabled) {
            await initializePose();
        }
        if (handEnabled) {
            await initializeHand();
        }
        if (gestureEnabled) {
            await initializeGesture();
        }
    })();
    try {
        await initializing;
        postStatus("ready", "Sincro tracker worker ready", performance.now() - startedAtMs);
    } catch (error) {
        initializing = undefined;
        postStatus("unavailable", formatErrorDetail(error), performance.now() - startedAtMs);
        throw error;
    }
}

async function initializePose(): Promise<void> {
    if (!poseTracker) {
        throw new Error("SincroPoseTracker is not loaded.");
    }
    await poseTracker.initVision();
    poseInitialized = true;
}

async function initializeHand(): Promise<void> {
    if (!handTracker) {
        handInitializationFailureReason = "SincroHandTracker is not loaded.";
        return;
    }
    try {
        await handTracker.initVision();
        handInitialized = true;
        handInitializationFailureReason = undefined;
    } catch (error) {
        handInitialized = false;
        handInitializationFailureReason = formatErrorDetail(error);
    }
}

async function initializeGesture(): Promise<void> {
    if (!gestureTracker) {
        gestureInitializationFailureReason = "SincroGestureTracker is not loaded.";
        return;
    }
    try {
        await gestureTracker.initVision();
        gestureInitialized = true;
        gestureInitializationFailureReason = undefined;
    } catch (error) {
        gestureInitialized = false;
        gestureInitializationFailureReason = formatErrorDetail(error);
    }
}

async function ensureTrackers(): Promise<void> {
    if (faceTracker && poseTracker && handTracker && gestureTracker) {
        return;
    }
    const [
        { SincroFaceTracker: FaceTracker },
        { SincroPoseTracker: PoseTracker },
        { SincroHandTracker: HandTracker },
        { SincroGestureTracker: GestureTracker },
    ] = await Promise.all([
        import("../faceTracking/sincroFaceTracker"),
        import("../poseTracking/sincroPoseTracker"),
        import("../handTracking/sincroHandTracker"),
        import("../gestureTracking/sincroGestureTracker"),
    ]);
    faceTracker = new FaceTracker();
    poseTracker = new PoseTracker();
    handTracker = new HandTracker();
    gestureTracker = new GestureTracker();
}

async function detect(message: SincroTrackerWorkerDetectMessage): Promise<void> {
    try {
        const measured = await measureWorkerTrackerFrame({
            initialize: () =>
                initialize(
                    message.poseEnabled,
                    message.handEnabled,
                    message.gestureEnabled,
                    message.faceRoiEnabled,
                ),
            detect: () => detectInitializedFrame(message),
        });
        const { face, faceRoi, pose, hand, gesture, mediapipe } = measured.result;
        post({
            type: "result",
            requestId: message.requestId,
            face,
            faceRoi,
            pose,
            hand,
            gesture,
            ...(mediapipe === undefined ? {} : { mediapipe }),
            ...createWorkerGestureDurationFields(gesture),
            workerTimeMs: measured.workerTimeMs,
        });
    } finally {
        // ImageBitmap ownership is transferred to the Worker. Closing it here keeps camera frame
        // transfer from accumulating GPU-backed resources during long sincro sessions.
        message.frame.close();
    }
}

function detectInitializedFrame(message: SincroTrackerWorkerDetectMessage) {
    if (!faceTracker || !poseTracker || !handTracker || !gestureTracker) {
        throw new Error("Sincro tracker worker is not initialized.");
    }
    postStatus("running");
    const pose =
        message.poseEnabled && poseInitialized
            ? poseTracker.detect(message.frame, message.timestampMs)
            : undefined;
    if (pose !== undefined) latestPose = pose;
    const roiPose = pose ?? latestPose;
    const face = faceTracker.detect(message.frame, message.timestampMs);
    const faceRoi =
        message.faceRoiEnabled && roiPose !== undefined && !roiPose.degradedToFaceOnly
            ? faceTracker.detectWithRoi(message.frame, roiPose, message.timestampMs)
            : undefined;
    const hand = detectHand(message, roiPose);
    const gesture = detectGesture(message, hand);
    const mediapipe = createTrackerRuntimeMediaPipeRawResult({
        pose: poseTracker.getLastRawResult(),
        hand: handTracker.getLastRawResult(),
        face: faceTracker.getLastRawResult(),
        gesture: gestureTracker.getLastRawResult(),
        timing: {
            mediaTimeMs: message.timestampMs,
            videoWidth: message.frame.width,
            videoHeight: message.frame.height,
        },
    });
    return { face, faceRoi, pose, hand, gesture, mediapipe };
}

self.onmessage = (event: MessageEvent<SincroTrackerWorkerInputMessage>) => {
    const data = event.data;
    if (!data?.type) {
        return;
    }
    if (data.type === "init") {
        initialize(
            data.poseEnabled,
            data.handEnabled,
            data.gestureEnabled,
            data.faceRoiEnabled,
        ).catch((error) => {
            post({
                type: "error",
                message: formatErrorDetail(error),
            });
        });
        return;
    }
    if (data.type === "detect") {
        detect(data).catch((error) => {
            post({
                type: "error",
                requestId: data.requestId,
                message: formatErrorDetail(error),
            });
        });
        return;
    }
    if (data.type === "stop") {
        post({
            type: "stopped",
            face:
                faceTracker?.stop(data.reason, data.nowMs) ??
                createStoppedFaceSnapshot(data.reason, data.nowMs),
            pose:
                poseTracker?.stop(data.reason, data.nowMs) ??
                createStoppedPoseSnapshot(data.reason, data.nowMs),
            hand:
                handTracker?.stop(data.reason, data.nowMs) ??
                createStoppedHandSnapshot(data.reason, data.nowMs),
            gesture:
                gestureTracker?.stop(data.reason, data.nowMs) ??
                createStoppedGestureSnapshot(data.reason, data.nowMs),
        });
        return;
    }
    if (data.type === "dispose") {
        faceTracker?.dispose();
        poseTracker?.dispose();
        handTracker?.dispose();
        gestureTracker?.dispose();
        close();
    }
};

function detectHand(
    message: SincroTrackerWorkerDetectMessage,
    pose: ReturnType<SincroPoseTracker["detect"]> | undefined,
): SincroHandMotionSnapshot | undefined {
    if (!message.handEnabled) {
        return undefined;
    }
    if (pose === undefined) {
        return handTracker?.stop("hand_tracking_requires_pose", message.timestampMs);
    }
    if (!handInitialized) {
        return createSincroHandFallbackSnapshot({
            reason: handInitializationFailureReason ?? "HandLandmarker model is not loaded.",
            nowMs: message.timestampMs,
            warnings: ["model_not_loaded"],
        });
    }
    return handTracker?.detect(message.frame, pose, message.timestampMs);
}

function detectGesture(
    message: SincroTrackerWorkerDetectMessage,
    hand: SincroHandMotionSnapshot | undefined,
): SincroGestureMotionSnapshot | undefined {
    if (!message.gestureEnabled) {
        return undefined;
    }
    if (hand === undefined) {
        return createSincroGestureFallbackSnapshot({
            reason: "gesture_tracking_requires_hand",
            nowMs: message.timestampMs,
            warnings: ["no_hand_detected"],
        });
    }
    if (!gestureInitialized) {
        return createSincroGestureFallbackSnapshot({
            reason: gestureInitializationFailureReason ?? "GestureRecognizer model is not loaded.",
            nowMs: message.timestampMs,
            warnings: ["model_not_loaded"],
        });
    }
    return gestureTracker?.detect(message.frame, hand, message.timestampMs);
}

function formatErrorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function normalizeMediaPipeImportPath(path: string): string {
    return path.replace("?import&", "?").replace("&import", "");
}

function loadingMessage(
    poseEnabled: boolean,
    handEnabled: boolean,
    gestureEnabled: boolean,
    faceRoiEnabled: boolean,
): string {
    if (poseEnabled && handEnabled && gestureEnabled) {
        return "Loading FaceLandmarker, PoseLandmarker, HandLandmarker and GestureRecognizer";
    }
    if (poseEnabled && handEnabled) {
        return "Loading FaceLandmarker, PoseLandmarker and HandLandmarker";
    }
    if (poseEnabled || handEnabled || faceRoiEnabled) {
        return "Loading FaceLandmarker and PoseLandmarker";
    }
    return "Loading FaceLandmarker";
}

function createStoppedGestureSnapshot(
    reason: string | undefined,
    nowMs: number,
): SincroGestureMotionSnapshot {
    return createSincroGestureFallbackSnapshot({
        reason,
        nowMs,
        trackingEnabled: false,
    });
}

function createStoppedFaceSnapshot(
    reason: string | undefined,
    nowMs: number,
): SincroFaceMotionSnapshot {
    return {
        trackingEnabled: false,
        detected: false,
        confidence: 0,
        headPose: {
            yawDeg: 0,
            pitchDeg: 0,
            rollDeg: 0,
        },
        blendshapes: {},
        source: "lost",
        warnings: [],
        inferenceTimeMs: 0,
        inferenceFps: 0,
        lastUpdatedAtMs: nowMs,
        fallbackReason: reason,
    };
}

function createStoppedPoseSnapshot(reason: string | undefined, nowMs: number) {
    return {
        trackingEnabled: false,
        detected: false,
        confidence: 0,
        upperBody: {
            shoulderRoll: 0,
            torsoLean: 0,
            shoulderWidth: 0,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.5,
            hipCenterTracked: false,
        },
        leftArm: {
            tracked: false,
            confidence: 0,
            upperArmLift: 0,
            upperArmOpen: 0,
            lowerArmFlex: 0,
            wristRaise: 0,
            targets: createStoppedArmTargets(),
        },
        rightArm: {
            tracked: false,
            confidence: 0,
            upperArmLift: 0,
            upperArmOpen: 0,
            lowerArmFlex: 0,
            wristRaise: 0,
            targets: createStoppedArmTargets(),
        },
        lowerBodyTargets: {
            leftHip: createStoppedTargetPoint(),
            rightHip: createStoppedTargetPoint(),
            leftKnee: createStoppedTargetPoint(),
            rightKnee: createStoppedTargetPoint(),
            leftAnkle: createStoppedTargetPoint(),
            rightAnkle: createStoppedTargetPoint(),
        },
        inferenceTimeMs: 0,
        inferenceFps: 0,
        consecutiveFailures: 0,
        degradedToFaceOnly: false,
        lastUpdatedAtMs: nowMs,
        fallbackReason: reason,
    };
}

function createStoppedHandSnapshot(
    reason: string | undefined,
    nowMs: number,
): SincroHandMotionSnapshot {
    return createSincroHandFallbackSnapshot({
        reason,
        nowMs,
        trackingEnabled: false,
    });
}

function createStoppedArmTargets() {
    return {
        shoulder: createStoppedTargetPoint(),
        elbow: createStoppedTargetPoint(),
        wrist: createStoppedTargetPoint(),
    };
}

function createStoppedTargetPoint() {
    return {
        ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
        world: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT.world },
    };
}
