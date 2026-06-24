import { describe, expect, it } from "vitest";

import {
    parseMotionDebugLogLines,
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugLogParseErrorCode,
    type SincroMotionDebugLogParseResult,
} from "../motionDebugLogSchema";

function createValidManifest() {
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
            gitCommit: "abc1234",
            packageVersions: {
                three: "0.182.0",
                optionalPackage: undefined,
            },
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
                deviceIdHash: "device-hash",
                groupIdHash: "group-hash",
            },
        },
        pipeline: {
            tracker: "mediapipe",
        },
        avatar: {
            avatarProfileId: "default",
            vrmMetaHash: "vrm-hash",
            boneCapabilities: {
                leftUpperArm: true,
                rightUpperArm: true,
            },
            restMetrics: {
                shoulderWidth: 0.4,
            },
            motionProfile: {
                profile: "default",
            },
        },
        metricSummary: {
            droppedFrames: 0,
        },
    };
}

function createValidFrame(frameIndex = 0) {
    return {
        frameIndex,
        timestamp: {
            mediaTimeMs: 120,
        },
        video: {
            width: 1280,
            height: 720,
        },
        poseSnapshot: {
            detected: true,
        },
        solver: {
            mode: "world_3d_ik",
        },
    };
}

function createLogLines(manifest: unknown, frames: unknown[]) {
    return [
        JSON.stringify({ recordType: "manifest", manifest }),
        ...frames.map((frame) => JSON.stringify({ recordType: "frame", frame })),
    ];
}

function expectErrorCode(
    result: SincroMotionDebugLogParseResult,
    code: SincroMotionDebugLogParseErrorCode,
) {
    expect(result.ok).toBe(false);
    if (result.ok) {
        return;
    }
    expect(result.errors[0]?.code).toBe(code);
}

describe("parseMotionDebugLogLines", () => {
    it("accepts a valid motion debug log", () => {
        const result = parseMotionDebugLogLines(
            createLogLines(createValidManifest(), [createValidFrame(0)]),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.manifest.schemaVersion).toBe(SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION);
        expect(result.frames).toHaveLength(1);
        expect(result.frames[0]?.poseSnapshot).toEqual({ detected: true });
    });

    it("accepts legacy v1 frames with only timestamp.mediaTimeMs", () => {
        const result = parseMotionDebugLogLines(
            createLogLines(createValidManifest(), [createValidFrame(0)]),
        );

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.frames[0]?.timestamp).toEqual({ mediaTimeMs: 120 });
    });

    it("accepts legacy tracker stats without performance budget", () => {
        const frame = {
            ...createValidFrame(0),
            metrics: {
                tracker: {
                    mode: "main-thread",
                    status: "running",
                    transferTimeMs: 0,
                    workerRoundTripMs: 0,
                    loadTimeMs: 0,
                    droppedFrames: 0,
                },
            },
        };

        const result = parseMotionDebugLogLines(createLogLines(createValidManifest(), [frame]));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.frames[0]?.metrics).toEqual(frame.metrics);
    });

    it("accepts tracker stats with performance budget in frame metrics", () => {
        const frame = {
            ...createValidFrame(0),
            metrics: {
                tracker: {
                    mode: "worker",
                    status: "running",
                    transferTimeMs: 3,
                    workerRoundTripMs: 70,
                    workerTimeMs: 58,
                    loadTimeMs: 120,
                    droppedFrames: 1,
                    budget: {
                        schemaVersion: "sincro.tracker-performance-budget.v1",
                        target: {
                            faceTargetFps: 15,
                            poseTargetFps: 12,
                            frameBudgetMs: 66.66666666666667,
                            poseBudgetMs: 83.33333333333333,
                        },
                        observed: {
                            clockSource: "request-video-frame-callback",
                            transferTimeMs: 3,
                            workerRoundTripMs: 70,
                            workerTimeMs: 58,
                            poseInferenceTimeMs: 76,
                            droppedFrames: 1,
                            effectiveFaceFps: 15,
                            effectivePoseFps: 12,
                        },
                        budgetStatus: "warn",
                        degradation: {
                            state: "full",
                        },
                        reasonCodes: [
                            "worker_round_trip_warn",
                            "pose_inference_warn",
                            "worker_pending_frame_dropped",
                        ],
                    },
                },
            },
        };

        const result = parseMotionDebugLogLines(createLogLines(createValidManifest(), [frame]));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.frames[0]?.metrics).toEqual(frame.metrics);
    });

    it("accepts video frame clock timestamp fields", () => {
        const frame = {
            ...createValidFrame(0),
            timestamp: {
                mediaTimeMs: 120,
                presentationTimeMs: 122,
                expectedDisplayTimeMs: 138,
                presentedFrames: 14,
                droppedPresentedFrames: 2,
                clockSource: "request-video-frame-callback",
            },
        };

        const result = parseMotionDebugLogLines(createLogLines(createValidManifest(), [frame]));

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.frames[0]?.timestamp).toEqual(frame.timestamp);
    });

    it("rejects empty input with a deterministic error code", () => {
        expectErrorCode(parseMotionDebugLogLines([]), "empty_input");
    });

    it("rejects input whose first record is not a manifest", () => {
        expectErrorCode(
            parseMotionDebugLogLines([
                JSON.stringify({ recordType: "metadata", manifest: createValidManifest() }),
            ]),
            "missing_manifest",
        );
    });

    it("rejects frame records before the manifest", () => {
        expectErrorCode(
            parseMotionDebugLogLines([
                JSON.stringify({ recordType: "frame", frame: createValidFrame() }),
            ]),
            "frame_before_manifest",
        );
    });

    it("rejects raw camera device identifiers", () => {
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

        expectErrorCode(
            parseMotionDebugLogLines(createLogLines(manifestWithRawDeviceId, [createValidFrame()])),
            "invalid_record",
        );
    });

    it("rejects raw camera group identifiers", () => {
        const manifest = createValidManifest();
        const manifestWithRawGroupId = {
            ...manifest,
            camera: {
                ...manifest.camera,
                actualSettings: {
                    ...manifest.camera.actualSettings,
                    groupId: "raw-group-id",
                },
            },
        };

        expectErrorCode(
            parseMotionDebugLogLines(createLogLines(manifestWithRawGroupId, [createValidFrame()])),
            "invalid_record",
        );
    });

    it("rejects unknown schema versions", () => {
        const manifest = {
            ...createValidManifest(),
            schemaVersion: "sincro.motion-debug-log.v2",
        };

        expectErrorCode(
            parseMotionDebugLogLines(createLogLines(manifest, [createValidFrame()])),
            "unknown_schema_version",
        );
    });

    it("accepts zero frameIndex and rejects negative frameIndex", () => {
        const validResult = parseMotionDebugLogLines(
            createLogLines(createValidManifest(), [createValidFrame(0)]),
        );
        expect(validResult.ok).toBe(true);

        expectErrorCode(
            parseMotionDebugLogLines(createLogLines(createValidManifest(), [createValidFrame(-1)])),
            "invalid_frame_index",
        );
    });

    it("rejects frames without timestamp.mediaTimeMs", () => {
        const frame = {
            ...createValidFrame(),
            timestamp: {},
        };

        expectErrorCode(
            parseMotionDebugLogLines(createLogLines(createValidManifest(), [frame])),
            "missing_timestamp",
        );
    });

    it("rejects invalid JSON without throwing", () => {
        expectErrorCode(parseMotionDebugLogLines(["{"]), "invalid_json");
    });
});
