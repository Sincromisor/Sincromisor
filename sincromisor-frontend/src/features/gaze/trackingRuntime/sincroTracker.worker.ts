import type { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
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

let poseInitialized = false;
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

async function initialize(poseEnabled: boolean): Promise<void> {
    await ensureTrackers();
    if (initializing) {
        await initializing;
        if (poseEnabled && !poseInitialized) {
            await initializePose();
        }
        return;
    }
    const startedAtMs = performance.now();
    postStatus(
        "loading",
        poseEnabled ? "Loading FaceLandmarker and PoseLandmarker" : "Loading FaceLandmarker",
    );
    const currentFaceTracker = faceTracker;
    if (!currentFaceTracker) {
        throw new Error("SincroFaceTracker is not loaded.");
    }
    initializing = (async () => {
        await currentFaceTracker.initVision();
        if (poseEnabled) {
            await initializePose();
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

async function ensureTrackers(): Promise<void> {
    if (faceTracker && poseTracker) {
        return;
    }
    const [{ SincroFaceTracker: FaceTracker }, { SincroPoseTracker: PoseTracker }] =
        await Promise.all([
            import("../faceTracking/sincroFaceTracker"),
            import("../poseTracking/sincroPoseTracker"),
        ]);
    faceTracker = new FaceTracker();
    poseTracker = new PoseTracker();
}

async function detect(message: SincroTrackerWorkerDetectMessage): Promise<void> {
    const startedAtMs = performance.now();
    try {
        await initialize(message.poseEnabled);
        if (!faceTracker || !poseTracker) {
            throw new Error("Sincro tracker worker is not initialized.");
        }
        postStatus("running");
        const face = faceTracker.detect(message.frame, message.timestampMs);
        const pose =
            message.poseEnabled && poseInitialized
                ? poseTracker.detect(message.frame, message.timestampMs)
                : undefined;
        post({
            type: "result",
            requestId: message.requestId,
            face,
            pose,
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
        initialize(data.poseEnabled).catch((error) => {
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
        });
        return;
    }
    if (data.type === "dispose") {
        faceTracker?.dispose();
        poseTracker?.dispose();
        close();
    }
};

function formatErrorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function normalizeMediaPipeImportPath(path: string): string {
    return path.replace("?import&", "?").replace("&import", "");
}

function createStoppedFaceSnapshot(reason: string | undefined, nowMs: number) {
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
