import { describe, expect, it } from "vitest";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../../../character/canonical/canonicalUpperBodyState";
import {
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugLogManifest,
} from "../../../character/motionEvaluation/motionDebugLogSchema";
import { calculateMotionMetricSummary } from "../../../character/motionEvaluation/motionMetrics";
import { MotionReplayPlayer } from "../../../character/motionEvaluation/motionReplayPlayer";
import { createDefaultSnapshot } from "../../../features/debug/model/debugConsoleSnapshot";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import { createMotionDebugViewerSnapshot } from "../motionDebugViewerModel";
import type { MotionDebugSnapshot } from "../types";

function createManifest(): SincroMotionDebugLogManifest {
    return {
        schemaVersion: SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
        createdAtIso: "2026-06-23T12:00:00.000Z",
        source: {
            kind: "video-fixture",
            fixtureId: "minimal-valid-log",
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
            configHash: "motion-debug-viewer-test",
        },
        camera: {
            requestedConstraints: {
                fixtureUrl: "/fixtures/minimal.mp4",
            },
            actualSettings: {
                width: 1280,
                height: 720,
                frameRate: 30,
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

function createPoseSnapshot(mediaTimeMs: number): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.86,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.48,
            shoulderWidth: 0.42,
            hipCenterTracked: true,
        },
        leftArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.82,
            targets: {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets,
                wrist: {
                    ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets.wrist,
                    cameraX: 0.36,
                    cameraY: 0.58,
                    confidence: 0.82,
                },
            },
        },
        rightArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.8,
            targets: {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets,
                wrist: {
                    ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets.wrist,
                    cameraX: 0.64,
                    cameraY: 0.56,
                    confidence: 0.8,
                },
            },
        },
        lowerBodyTargets: DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
        inferenceTimeMs: 8,
        inferenceFps: 12,
        consecutiveFailures: 0,
        degradedToFaceOnly: false,
        lastUpdatedAtMs: mediaTimeMs,
    });
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
        reach: 0.52,
        elevationRad: 0.12,
        openness: 0.24,
        forwardness: 0.7,
        elbowFlexionRad: 1.05,
        classification: "front",
        bodyLocalWrist: [0.12, 0.2, 0.4],
        bodyLocalElbow: [0.08, 0.12, 0.22],
        ...overrides,
    };
}

function createCanonicalState(mediaTimeMs: number): CanonicalUpperBodyState {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs,
            poseLastUpdatedAtMs: mediaTimeMs - 10,
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
            left: createCanonicalArmState({
                source: "mixed",
                warnings: ["missing_world_coordinates"],
                outOfRangeFields: [
                    {
                        path: "reach",
                        value: 1.3,
                        max: 1.15,
                        clampedValue: 1.15,
                    },
                ],
            }),
            right: createCanonicalArmState({
                source: "pose",
                classification: "side",
                openness: 0.8,
                forwardness: 0.2,
            }),
        },
        calibration: {
            ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
            id: `calibration-${mediaTimeMs}`,
        },
        warnings: ["missing_world_coordinates"],
    };
}

function createLiveSnapshot(
    options: Pick<MotionDebugSnapshot, "canonical"> = {},
): MotionDebugSnapshot {
    const debugSnapshot = createDefaultSnapshot().sincroMotion;
    return {
        status: "running",
        message: "test",
        camera: {
            source: "fixture",
            width: 1280,
            height: 720,
            readyState: 4,
        },
        recording: {
            status: "stopped",
            frameCount: 2,
            durationMs: 120,
            compression: "gzip",
        },
        pose: createPoseSnapshot(120),
        canonical: options.canonical,
        tracker: debugSnapshot.tracker,
        poseRetarget: debugSnapshot.poseRetarget,
        poseRetargetRuntime: debugSnapshot.poseRetargetRuntime,
        render: {
            renderFps: 60,
        },
    };
}

function createFrameLine(frameIndex: number, mediaTimeMs: number): string {
    const debugSnapshot = createDefaultSnapshot().sincroMotion;
    return JSON.stringify({
        recordType: "frame",
        frame: {
            frameIndex,
            timestamp: {
                mediaTimeMs,
            },
            video: {
                width: 1280,
                height: 720,
            },
            poseSnapshot: createPoseSnapshot(mediaTimeMs),
            solver: {
                poseRetarget: debugSnapshot.poseRetargetRuntime,
            },
        },
    });
}

function createMinimalLogText(): string {
    return [
        JSON.stringify({ recordType: "manifest", manifest: createManifest() }),
        createFrameLine(0, 120),
        createFrameLine(1, 240),
    ].join("\n");
}

describe("createMotionDebugViewerSnapshot", () => {
    it("projects minimal replay log state and calculated metrics into viewer fields", () => {
        const liveSnapshot = createLiveSnapshot();
        const player = new MotionReplayPlayer<MotionDebugSnapshot>({
            applyPoseSnapshot: (snapshot) => ({
                ...liveSnapshot,
                pose: snapshot,
            }),
            readSnapshot: () => liveSnapshot,
        });
        expect(player.loadRecordingText(createMinimalLogText()).ok).toBe(true);
        expect(player.startReplay({ mode: "pose-snapshot" }).ok).toBe(true);
        const summary = calculateMotionMetricSummary(player.replayFrames(), {
            generatedAtIso: "2026-06-23T12:01:00.000Z",
            thresholdVersion: "initial-v1",
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "metrics",
            selectedLayer: "metrics",
            liveSnapshot,
            replayState: player.getReplayState(),
            replayManifest: player.replayManifest(),
            replayFrame: player.replayFrame(),
            metrics: summary,
        });

        expect(viewer.replay).toMatchObject({
            status: "paused",
            mode: "pose-snapshot",
            frameCount: 2,
            currentFrameIndex: 0,
        });
        expect(viewer.layers.metrics.status).toBe("available");
        expect(viewer.layers.camera.status).toBe("available");
        expect(viewer.layers.canonical.status).toBe("not_implemented");
        expect(viewer.metrics?.metrics.elbowFlipCount.key).toBe("elbowFlipCount");
        expect(viewer.metrics?.metrics.neutralJitter.status).toBe("not_available");
    });

    it("does not mark empty recorded layer objects as available", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 120,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                solver: {},
            },
        });

        expect(viewer.layers.solver.status).toBe("not_recorded");
    });

    it("uses live snapshot canonical as the canonical layer fallback", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "canonical",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: 120,
            },
            arms: {
                left: {
                    reach: 0.52,
                    elevationRad: 0.12,
                    openness: 0.24,
                    forwardness: 0.7,
                    elbowFlexionRad: 1.05,
                    classification: "front",
                    source: "mixed",
                    warnings: ["missing_world_coordinates"],
                    outOfRangeFields: [
                        {
                            path: "reach",
                            clampedValue: 1.15,
                        },
                    ],
                },
                right: {
                    classification: "side",
                },
            },
            calibration: {
                id: "calibration-120",
            },
        });
    });

    it("prefers replay frame canonical over live snapshot canonical", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "canonical",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                canonical: createCanonicalState(240),
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            timestamp: {
                mediaTimeMs: 240,
            },
            calibration: {
                id: "calibration-240",
            },
        });
    });

    it("shows invalid replay canonical as an available parse error summary", () => {
        const liveSnapshot = createLiveSnapshot({
            canonical: createCanonicalState(120),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "canonical",
            liveSnapshot,
            replayState: {
                status: "paused",
                mode: "pose-snapshot",
                frameCount: 1,
                currentFrameIndex: 0,
            },
            replayFrame: {
                frameIndex: 0,
                timestamp: {
                    mediaTimeMs: 240,
                },
                video: {
                    width: 1280,
                    height: 720,
                },
                canonical: {
                    schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
                    timestamp: {
                        mediaTimeMs: 240,
                    },
                },
            },
        });

        expect(viewer.layers.canonical.status).toBe("available");
        expect(viewer.layers.canonical.value).toMatchObject({
            parseStatus: "invalid",
            errors: expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                }),
            ]),
            raw: {
                schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
            },
        });
    });
});
