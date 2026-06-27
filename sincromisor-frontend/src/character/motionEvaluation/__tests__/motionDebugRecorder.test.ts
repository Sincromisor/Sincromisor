import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityComponent,
    type CameraQualityScore,
} from "../../../features/gaze/trackingRuntime/cameraQualityScore";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
    parseCanonicalUpperBodyState,
} from "../../canonical/canonicalUpperBodyState";
import { createDefaultMotionIntentState } from "../../motionIntent/motionIntentState";
import { createDefaultReliabilityMap, parseReliabilityMap } from "../../reliability/reliabilityMap";
import {
    createDefaultTemporalUpperBodyState,
    parseTemporalUpperBodyState,
} from "../../temporal/temporalUpperBodyState";
import {
    parseMotionDebugLogLines,
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugLogManifest,
} from "../motionDebugLogSchema";
import {
    parseMotionDebugFinalPoseSnapshot,
    parseMotionDebugPhase6SolverSnapshot,
} from "../motionDebugPhase6Snapshot";
import { parseMotionDebugPhase7Snapshot } from "../motionDebugPhase7Snapshot";
import { parseMotionDebugPhase9SemanticSnapshot } from "../motionDebugPhase9Snapshot";
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

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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

function createCameraQuality(mediaTimeMs: number): CameraQualityScore {
    const goodComponent: CameraQualityComponent = { score: 1, status: "good", reasonCodes: [] };
    return {
        schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
        overall: {
            score: 1,
            status: "good",
        },
        components: {
            resolution: goodComponent,
            cadence: goodComponent,
            torsoInFrame: goodComponent,
            handsInFrame: goodComponent,
            borderRisk: goodComponent,
            handSmallRisk: goodComponent,
            motionBlurRisk: goodComponent,
        },
        reasons: [],
        guideMessages: [],
        track: {
            width: 1280,
            height: 720,
            frameRate: 30,
            readyState: "live",
        },
        sample: {
            mediaTimeMs,
            videoWidth: 1280,
            videoHeight: 720,
            poseDetected: true,
            poseConfidence: 0.82,
        },
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
        hand: {
            trackingEnabled: true,
            detected: true,
            leftHand: {
                detected: true,
                assignedSide: "left",
                source: "roi",
                confidence: 0.8,
                handednessScore: 0.9,
                roi: {
                    side: "left",
                    source: "pose-wrist",
                    rect: {
                        centerX: 0.32,
                        centerY: 0.58,
                        width: 0.2,
                        height: 0.2,
                        clamped: false,
                    },
                    confidence: 0.82,
                    referencePoint: [0.36, 0.58],
                    warnings: [],
                },
                fullFrameWrist: [0.36, 0.58],
                features: {
                    palmNormal: [0, 0, 1],
                    palmDirection: [0, -1, 0],
                    fingerCurl: {
                        thumb: 0.2,
                        index: 0.3,
                        middle: 0.32,
                        ring: 0.34,
                        little: 0.36,
                    },
                    fingerSplay: {
                        indexMiddle: 0.1,
                        middleRing: 0.1,
                        ringLittle: 0.1,
                    },
                    thumbOppose: 0.2,
                    openness: "open",
                },
                warnings: [],
            },
        },
        reliability: createDefaultReliabilityMap(mediaTimeMs),
        canonical: createCanonicalState(mediaTimeMs),
        temporal: createDefaultTemporalUpperBodyState(mediaTimeMs),
        intent: createDefaultMotionIntentState(mediaTimeMs),
        solver: {
            poseRetarget: {
                armIkMode: "world_3d_ik",
            },
            poseRetargetRuntime: {
                active: true,
            },
            phase6: createPhase6SolverSnapshot(),
            phase7: createPhase7Snapshot(),
            phase9: createPhase9Snapshot(mediaTimeMs),
        },
        finalPose: {
            schemaVersion: "sincro.vrm-pose-composer-result.v1",
            finalPose: {
                leftUpperArm: { x: 0, y: 0, z: 0, w: 1 },
            },
            ownedBones: ["leftUpperArm"],
            suppressedLayers: [],
            clampedBones: [],
            warnings: [],
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

function createPhase6SolverSnapshot(): unknown {
    return {
        schemaVersion: "sincro.phase6-solver.v1",
        profile: {
            schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
            optionalBones: {
                leftHand: true,
                rightHand: true,
            },
            measurements: {
                shoulderWidth: 0.42,
            },
            solverDefaults: {
                defaultReachScale: 1,
                depthCompression: 0.55,
                lateralScale: 1,
                verticalScale: 0.92,
                shoulderDamping: 0.65,
                wristRollInfluence: 0.25,
            },
            warnings: [],
        },
        arms: {
            left: {
                ik: {
                    active: true,
                    targetClamped: false,
                    weight: 0.8,
                    poleState: "stable",
                    constraintReasonCodes: [],
                },
            },
            right: {
                ik: {
                    active: true,
                    targetClamped: false,
                    weight: 0.8,
                    poleState: "stable",
                    constraintReasonCodes: [],
                },
            },
        },
        warnings: [],
    };
}

function createPhase7Snapshot(): unknown {
    return {
        schemaVersion: "sincro.phase7-profile-calibration.v1",
        activeCanonicalCalibration: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        warnings: [],
    };
}

function createPhase9Snapshot(mediaTimeMs: number): unknown {
    const intent = createDefaultMotionIntentState(mediaTimeMs);
    return {
        schemaVersion: "sincro.phase9-semantic-motion.v1",
        timestamp: { mediaTimeMs },
        intent,
        semantic: {
            schemaVersion: "sincro.phase9-semantic-motion.v1",
            timestamp: { mediaTimeMs },
            presets: [],
            warnings: [],
        },
        finger: {},
        layers: [],
        warnings: [],
    };
}

function createFrameInputWithClockTiming(
    mediaTimeMs: number,
    presentedFrames: number,
    droppedPresentedFrames: number,
): MotionDebugRecorderFrameInput {
    return {
        ...createValidFrameInput(mediaTimeMs),
        timestamp: {
            mediaTimeMs,
            presentationTimeMs: mediaTimeMs + 1,
            expectedDisplayTimeMs: mediaTimeMs + 16,
            presentedFrames,
            droppedPresentedFrames,
            clockSource: "request-video-frame-callback",
        },
        dedupeKey: {
            mediaTimeMs,
            poseLastUpdatedAtMs: 300,
            presentedFrames,
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
        expect(parsed.frames[0]?.hand).toMatchObject({
            detected: true,
            leftHand: {
                source: "roi",
                roi: {
                    source: "pose-wrist",
                },
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
        const reliability = parsed.frames[0]?.reliability;
        expect(reliability).toBeDefined();
        const reliabilityParse = parseReliabilityMap(reliability);
        expect(reliabilityParse.ok).toBe(true);
        if (!reliabilityParse.ok) {
            return;
        }
        expect(reliabilityParse.map.timestamp.mediaTimeMs).toBe(120);
        const temporal = parsed.frames[0]?.temporal;
        expect(temporal).toBeDefined();
        const temporalParse = parseTemporalUpperBodyState(temporal);
        expect(temporalParse.ok).toBe(true);
        if (!temporalParse.ok) {
            return;
        }
        expect(temporalParse.state.timestamp.mediaTimeMs).toBe(120);
        expect(parsed.frames[0]?.intent).toMatchObject({
            schemaVersion: "sincro.motion-intent.v1",
            timestamp: { mediaTimeMs: 120 },
        });
        const solver = parsed.frames[0]?.solver;
        expect(solver).toMatchObject({
            phase6: {
                profile: {
                    schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
                },
            },
        });
        const phase6Parse = parseMotionDebugPhase6SolverSnapshot(
            isRecord(solver) ? solver.phase6 : undefined,
        );
        expect(phase6Parse.ok).toBe(true);
        const phase7Parse = parseMotionDebugPhase7Snapshot(
            isRecord(solver) ? solver.phase7 : undefined,
        );
        expect(phase7Parse.ok).toBe(true);
        const phase9Parse = parseMotionDebugPhase9SemanticSnapshot(
            isRecord(solver) ? solver.phase9 : undefined,
        );
        expect(phase9Parse.ok).toBe(true);
        if (!phase9Parse.ok) {
            return;
        }
        expect(phase9Parse.snapshot).toMatchObject({
            schemaVersion: "sincro.phase9-semantic-motion.v1",
            timestamp: { mediaTimeMs: 120 },
            intent: {
                schemaVersion: "sincro.motion-intent.v1",
            },
        });
        const finalPoseParse = parseMotionDebugFinalPoseSnapshot(parsed.frames[0]?.finalPose);
        expect(finalPoseParse.ok).toBe(true);
        if (!finalPoseParse.ok) {
            return;
        }
        expect(finalPoseParse.snapshot.ownedBones).toEqual(["leftUpperArm"]);
    });

    it("exports camera quality only under frame metrics", () => {
        const recorder = new MotionDebugRecorder({ compression: "none" });
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        const frameInput = createValidFrameInput();
        expect(
            recorder.recordFrame({
                ...frameInput,
                metrics: {
                    receivedAtPerformanceMs: 456,
                    tracker: {
                        mode: "main-thread",
                    },
                    cameraQuality: createCameraQuality(120),
                },
            }).ok,
        ).toBe(true);
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
        expect(parsed.frames[0]?.metrics).toMatchObject({
            cameraQuality: {
                schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
                sample: {
                    mediaTimeMs: 120,
                },
            },
        });
        expect(parsed.frames[0]).not.toHaveProperty("cameraQuality");
    });

    it("exports video frame clock timestamp fields without moving receivedAt into timestamp", () => {
        const recorder = new MotionDebugRecorder({ compression: "none" });
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        expect(recorder.recordFrame(createFrameInputWithClockTiming(120, 10, 0)).ok).toBe(true);
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
        expect(parsed.frames[0]?.timestamp).toEqual({
            mediaTimeMs: 120,
            presentationTimeMs: 121,
            expectedDisplayTimeMs: 136,
            presentedFrames: 10,
            droppedPresentedFrames: 0,
            clockSource: "request-video-frame-callback",
        });
        expect(parsed.frames[0]?.metrics).toEqual({
            receivedAtPerformanceMs: 456,
            tracker: {
                mode: "main-thread",
            },
        });
    });

    it("dedupes consecutive rVFC frames with the same presentedFrames", () => {
        const recorder = new MotionDebugRecorder();
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        const first = recorder.recordFrame(createFrameInputWithClockTiming(120, 10, 0));
        const duplicate = recorder.recordFrame(createFrameInputWithClockTiming(153, 10, 0));
        const next = recorder.recordFrame(createFrameInputWithClockTiming(186, 13, 2));

        expect(first.ok).toBe(true);
        expect(duplicate.ok).toBe(true);
        expect(next.ok).toBe(true);
        if (!duplicate.ok || duplicate.recorded) {
            return;
        }
        expect(duplicate.skippedReason).toBe("duplicate_frame");
        expect(duplicate.state.frameCount).toBe(1);
        expect(next.state.frameCount).toBe(2);
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

        const frameWithTopLevelCameraQuality = {
            ...createValidFrameInput(240),
            cameraQuality: createCameraQuality(240),
        };
        const topLevelCameraQuality = recorder.recordFrame(frameWithTopLevelCameraQuality);
        expect(topLevelCameraQuality.ok).toBe(false);
        if (topLevelCameraQuality.ok) {
            return;
        }
        expect(topLevelCameraQuality.code).toBe("invalid_frame");
    });

    it("allows Phase 7 solver payload validation to stay in the layer parser", () => {
        const recorder = new MotionDebugRecorder({ compression: "none" });
        expect(recorder.start(createValidManifest()).ok).toBe(true);
        const frameInput = createValidFrameInput();
        const recordResult = recorder.recordFrame({
            ...frameInput,
            solver: {
                phase6: createPhase6SolverSnapshot(),
                phase7: {
                    schemaVersion: "sincro.phase7-profile-calibration.v1",
                    activeCanonicalCalibration: {
                        ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
                        shoulderWidth: -1,
                    },
                    warnings: [],
                },
            },
        });

        expect(recordResult.ok).toBe(true);
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
        const solver = parsed.frames[0]?.solver;
        const phase7Parse = parseMotionDebugPhase7Snapshot(
            isRecord(solver) ? solver.phase7 : undefined,
        );
        expect(phase7Parse.ok).toBe(false);
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
