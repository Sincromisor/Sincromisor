import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import { createSincroHandFallbackSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroHandTracker } from "../handTracking/sincroHandTracker";
import { DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT } from "../poseTracking/sincroPoseMotionSnapshot";
import type { SincroPoseTracker } from "../poseTracking/sincroPoseTracker";
import type {
    SincroTrackerWorkerDetectMessage,
    SincroTrackerWorkerInputMessage,
    SincroTrackerWorkerOutputMessage,
    SincroTrackerWorkerStatus,
} from "./sincroTrackerWorkerTypes";

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

let poseInitialized = false;
let handInitialized = false;
let handInitializationFailureReason: string | undefined;
let initializing: Promise<void> | undefined;

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

async function initialize(poseEnabled: boolean, handEnabled: boolean): Promise<void> {
    await ensureTrackers();
    if (initializing) {
        await initializing;
        if (poseEnabled && !poseInitialized) {
            await initializePose();
        }
        if (poseEnabled && handEnabled && !handInitialized) {
            await initializeHand();
        }
        return;
    }
    const startedAtMs = performance.now();
    postStatus("loading", loadingMessage(poseEnabled, handEnabled));
    const currentFaceTracker = faceTracker;
    if (!currentFaceTracker) {
        throw new Error("SincroFaceTracker is not loaded.");
    }
    initializing = (async () => {
        await currentFaceTracker.initVision();
        if (poseEnabled) {
            await initializePose();
        }
        if (poseEnabled && handEnabled) {
            await initializeHand();
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

async function ensureTrackers(): Promise<void> {
    if (faceTracker && poseTracker && handTracker) {
        return;
    }
    const [
        { SincroFaceTracker: FaceTracker },
        { SincroPoseTracker: PoseTracker },
        { SincroHandTracker: HandTracker },
    ] = await Promise.all([
        import("../faceTracking/sincroFaceTracker"),
        import("../poseTracking/sincroPoseTracker"),
        import("../handTracking/sincroHandTracker"),
    ]);
    faceTracker = new FaceTracker();
    poseTracker = new PoseTracker();
    handTracker = new HandTracker();
}

async function detect(message: SincroTrackerWorkerDetectMessage): Promise<void> {
    const startedAtMs = performance.now();
    try {
        await initialize(message.poseEnabled, message.handEnabled);
        if (!faceTracker || !poseTracker || !handTracker) {
            throw new Error("Sincro tracker worker is not initialized.");
        }
        postStatus("running");
        const pose =
            message.poseEnabled && poseInitialized
                ? poseTracker.detect(message.frame, message.timestampMs)
                : undefined;
        const face =
            pose && !pose.degradedToFaceOnly
                ? faceTracker.detectWithRoi(message.frame, pose, message.timestampMs)
                : faceTracker.detect(message.frame, message.timestampMs);
        const hand = detectHand(message, pose);
        post({
            type: "result",
            requestId: message.requestId,
            face,
            pose,
            hand,
            workerTimeMs: performance.now() - startedAtMs,
        });
    } finally {
        // ImageBitmap ownership is transferred to the Worker. Closing it here keeps camera frame
        // transfer from accumulating GPU-backed resources during long sincro sessions.
        message.frame.close();
    }
}

self.onmessage = (event: MessageEvent<SincroTrackerWorkerInputMessage>) => {
    const data = event.data;
    if (!data?.type) {
        return;
    }
    if (data.type === "init") {
        initialize(data.poseEnabled, data.handEnabled).catch((error) => {
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
        });
        return;
    }
    if (data.type === "dispose") {
        faceTracker?.dispose();
        poseTracker?.dispose();
        handTracker?.dispose();
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
    if (!message.poseEnabled || pose === undefined) {
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

function formatErrorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function normalizeMediaPipeImportPath(path: string): string {
    return path.replace("?import&", "?").replace("&import", "");
}

function loadingMessage(poseEnabled: boolean, handEnabled: boolean): string {
    if (poseEnabled && handEnabled) {
        return "Loading FaceLandmarker, PoseLandmarker and HandLandmarker";
    }
    return poseEnabled ? "Loading FaceLandmarker and PoseLandmarker" : "Loading FaceLandmarker";
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
