import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
    parseCanonicalUpperBodyState,
} from "../../canonical/canonicalUpperBodyState";
import {
    parseMotionDebugLogLines,
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugLogManifest,
} from "../motionDebugLogSchema";
import { MotionDebugRecorder, type MotionDebugRecorderFrameInput } from "../motionDebugRecorder";

function createValidManifest(): SincroMotionDebugLogManifest {
    return {
        schemaVersion: SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
        createdAtIso: "2026-06-23T12:00:00.000Z",
        source: {
            kind: "live-camera",
        },
        environment: {
            userAgent: "vitest",
            devicePixelRatio: 2,
            viewport: {
                width: 1280,
                height: 720,
            },
            timeOriginMs: 1000,
        },
        build: {
            appVersion: "0.0.0",
            packageVersions: {},
            configHash: "config-hash",
        },
        camera: {
            requestedConstraints: {
                video: true,
            },
            actualSettings: {
                width: 1280,
                height: 720,
                frameRate: 30,
                facingMode: "user",
            },
        },
        pipeline: {
            tracker: "mediapipe",
        },
        avatar: {
            avatarProfileId: "default",
            boneCapabilities: {},
        },
    };
}

const BASE_CANONICAL_META: CanonicalPartMeta = {
    confidence: 1,
    source: "pose",
    warnings: [],
    outOfRangeFields: [],
};

function createCanonicalArmState(overrides: Partial<CanonicalArmState> = {}): CanonicalArmState {
    return {
        ...BASE_CANONICAL_META,
        reach: 0.42,
        elevationRad: 0.1,
        openness: 0.2,
        forwardness: 0.64,
        elbowFlexionRad: 1.2,
        classification: "front",
        bodyLocalWrist: [0.1, 0.2, 0.3],
        bodyLocalElbow: [0.08, 0.16, 0.24],
        ...overrides,
    };
}

function createCanonicalState(mediaTimeMs: number): CanonicalUpperBodyState {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs,
            poseLastUpdatedAtMs: 300,
        },
        torso: {
            ...BASE_CANONICAL_META,
            coordinateSystem: "body_local",
            shoulderCenter: [0, 1, 0],
            hipCenter: [0, 0, 0],
            bodyRight: [1, 0, 0],
            bodyUp: [0, 1, 0],
            bodyFront: [0, 0, 1],
            shoulderWidth: 1,
            torsoScale: 1,
            yawRad: 0,
        },
        arms: {
            left: createCanonicalArmState(),
            right: createCanonicalArmState({ classification: "side", forwardness: 0.2 }),
        },
        calibration: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        warnings: [],
    };
}

function createValidFrameInput(mediaTimeMs = 120): MotionDebugRecorderFrameInput {
    return {
        timestamp: {
            mediaTimeMs,
        },
        video: {
            width: 1280,
            height: 720,
        },
        poseSnapshot: {
            detected: true,
            lastUpdatedAtMs: 300,
        },
        canonical: createCanonicalState(mediaTimeMs),
        solver: {
            poseRetarget: {
                armIkMode: "world_3d_ik",
            },
            poseRetargetRuntime: {
                active: true,
            },
        },
        metrics: {
            receivedAtPerformanceMs: 456,
            tracker: {
                mode: "main-thread",
            },
        },
        dedupeKey: {
            mediaTimeMs,
            poseLastUpdatedAtMs: 300,
        },
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("MotionDebugRecorder", () => {
    it("exports schema-valid manifest and frame records", () => {
        const recorder = new MotionDebugRecorder({ compression: "none" });
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        const recordResult = recorder.recordFrame(createValidFrameInput());

        expect(recordResult.ok).toBe(true);
        if (!recordResult.ok || !recordResult.recorded) {
            return;
        }
        expect(recordResult.frameIndex).toBe(0);
        expect(recorder.stop().ok).toBe(true);

        const exportResult = recorder.exportNdjson();
        expect(exportResult.ok).toBe(true);
        if (!exportResult.ok) {
            return;
        }
        const parsed = parseMotionDebugLogLines(exportResult.ndjson.trimEnd().split("\n"));
        expect(parsed.ok).toBe(true);
        if (!parsed.ok) {
            return;
        }
        expect(parsed.frames[0]?.metrics).toEqual({
            receivedAtPerformanceMs: 456,
            tracker: {
                mode: "main-thread",
            },
        });
        expect(parsed.frames[0]?.timestamp).toEqual({ mediaTimeMs: 120 });
        const canonical = parsed.frames[0]?.canonical;
        expect(canonical).toBeDefined();
        const canonicalParse = parseCanonicalUpperBodyState(canonical);
        expect(canonicalParse.ok).toBe(true);
        if (!canonicalParse.ok) {
            return;
        }
        expect(canonicalParse.state.schemaVersion).toBe(CANONICAL_UPPER_BODY_SCHEMA_VERSION);
        expect(canonicalParse.state.arms.left.classification).toBe("front");
    });

    it("rejects invalid manifest and invalid frame payloads", () => {
        const manifest = createValidManifest();
        const manifestWithRawDeviceId = {
            ...manifest,
            camera: {
                ...manifest.camera,
                actualSettings: {
                    ...manifest.camera.actualSettings,
                    deviceId: "raw-device-id",
                },
            },
        };

        const recorder = new MotionDebugRecorder();
        const startResult = recorder.start(manifestWithRawDeviceId);
        expect(startResult.ok).toBe(false);
        if (startResult.ok) {
            return;
        }
        expect(startResult.code).toBe("source_not_ready");

        expect(recorder.start(manifest).ok).toBe(true);
        const frameWithTopLevelTracker = {
            ...createValidFrameInput(),
            tracker: "main-thread",
        };
        const recordResult = recorder.recordFrame(frameWithTopLevelTracker);
        expect(recordResult.ok).toBe(false);
        if (recordResult.ok) {
            return;
        }
        expect(recordResult.code).toBe("invalid_frame");
    });

    it("skips consecutive duplicate frames without entering error state", () => {
        const recorder = new MotionDebugRecorder();
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        const first = recorder.recordFrame(createValidFrameInput());
        const second = recorder.recordFrame(createValidFrameInput());

        expect(first.ok).toBe(true);
        expect(second.ok).toBe(true);
        if (!second.ok) {
            return;
        }
        expect(second.recorded).toBe(false);
        if (second.recorded) {
            return;
        }
        expect(second.skippedReason).toBe("duplicate_frame");
        expect(second.state.status).toBe("recording");
        expect(second.state.frameCount).toBe(1);
    });

    it("stops when maxFrames is reached", () => {
        const recorder = new MotionDebugRecorder({ maxFrames: 1 });
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        const result = recorder.recordFrame(createValidFrameInput());

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.state.status).toBe("stopped");
        expect(result.state.stopReason).toBe("max_frames");
    });

    it("stops before recording a frame when maxDurationMs is exceeded", () => {
        const recorder = new MotionDebugRecorder({ maxDurationMs: 0 });
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        const result = recorder.recordFrame(createValidFrameInput());

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.code).toBe("max_duration");
        expect(result.state.status).toBe("stopped");
        expect(result.state.stopReason).toBe("max_duration");
    });

    it("returns not_stopped and no_frames export errors deterministically", () => {
        const recorder = new MotionDebugRecorder();
        expect(recorder.exportNdjson().ok).toBe(false);
        const notStopped = recorder.exportNdjson();
        expect(notStopped.ok).toBe(false);
        if (notStopped.ok) {
            return;
        }
        expect(notStopped.code).toBe("not_stopped");

        expect(recorder.start(createValidManifest()).ok).toBe(true);
        expect(recorder.stop().ok).toBe(true);
        const noFrames = recorder.exportNdjson();
        expect(noFrames.ok).toBe(false);
        if (noFrames.ok) {
            return;
        }
        expect(noFrames.code).toBe("no_frames");
    });

    it("falls back to plain NDJSON when CompressionStream is unavailable", async () => {
        vi.stubGlobal("CompressionStream", undefined);
        const recorder = new MotionDebugRecorder({ compression: "gzip" });
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        expect(recorder.recordFrame(createValidFrameInput()).ok).toBe(true);
        expect(recorder.stop().ok).toBe(true);

        const result = await recorder.exportBlob();
        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.compression).toBe("none");
        expect(result.fileExtension).toBe(".ndjson");
        expect(result.state.compressionFallbackReason).toBe("compression_stream_not_supported");
    });

    it("falls back to plain NDJSON for Brotli requests and records the reason", async () => {
        const recorder = new MotionDebugRecorder();
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        expect(recorder.recordFrame(createValidFrameInput()).ok).toBe(true);
        expect(recorder.stop().ok).toBe(true);

        const result = await recorder.exportBlob({ compression: "brotli" });
        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.compression).toBe("none");
        expect(result.fileExtension).toBe(".ndjson");
        expect(result.state.compressionFallbackReason).toBe("brotli_compression_not_supported");
    });
});
