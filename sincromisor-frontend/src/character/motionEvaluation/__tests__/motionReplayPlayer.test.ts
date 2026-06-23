import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import {
    SincroPoseRetargeter,
    type SincroPoseRetargetFrame,
} from "../../retargeting/sincroPoseRetargeter";
import {
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugLogManifest,
} from "../motionDebugLogSchema";
import { MotionReplayPlayer } from "../motionReplayPlayer";

type HarnessSnapshot = {
    poseRetarget: SincroPoseRetargetFrame;
};

function createValidManifest(): SincroMotionDebugLogManifest {
    return {
        schemaVersion: SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
        createdAtIso: "2026-06-23T12:00:00.000Z",
        source: {
            kind: "video-fixture",
            fixtureId: "unit-test",
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

function createPoseSnapshot(mediaTimeMs = 120): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.82,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderRoll: 0.1,
            torsoLean: -0.06,
            shoulderWidth: 0.42,
            shoulderCenterX: 0.48,
            shoulderCenterY: 0.51,
            hipCenterTracked: true,
        },
        leftArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.8,
            upperArmLift: 0.2,
            upperArmOpen: 0.1,
            lowerArmFlex: 0.18,
        },
        rightArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.76,
            upperArmLift: -0.08,
            upperArmOpen: 0.14,
            lowerArmFlex: 0.11,
        },
        lowerBodyTargets: DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
        inferenceTimeMs: 8,
        inferenceFps: 12,
        consecutiveFailures: 0,
        degradedToFaceOnly: false,
        lastUpdatedAtMs: mediaTimeMs,
    });
}

function createFrameRecord(options: {
    frameIndex: number;
    mediaTimeMs: number;
    poseSnapshot?: unknown;
    finalPose?: unknown;
}): string {
    const frame: Record<string, unknown> = {
        frameIndex: options.frameIndex,
        timestamp: {
            mediaTimeMs: options.mediaTimeMs,
        },
        video: {
            width: 1280,
            height: 720,
        },
    };
    if (options.poseSnapshot !== undefined) {
        frame.poseSnapshot = options.poseSnapshot;
    }
    if (options.finalPose !== undefined) {
        frame.finalPose = options.finalPose;
    }
    return JSON.stringify({ recordType: "frame", frame });
}

function createLogText(frameLines: string[]): string {
    return [
        JSON.stringify({ recordType: "manifest", manifest: createValidManifest() }),
        ...frameLines,
    ].join("\n");
}

function createHarnessPlayer(): MotionReplayPlayer<HarnessSnapshot> {
    const retargeter = new SincroPoseRetargeter({
        armIkMode: "feature_only",
        smoothingMs: 40,
        returnToNeutralMs: 80,
    });
    return new MotionReplayPlayer<HarnessSnapshot>({
        applyPoseSnapshot: (snapshot, context) => ({
            poseRetarget: retargeter.retarget(snapshot, context.mediaTimeMs),
        }),
        readSnapshot: () => ({
            poseRetarget: retargeter.retarget(createPoseSnapshot(0), 0),
        }),
    });
}

describe("MotionReplayPlayer", () => {
    it("replays the same pose snapshots deterministically through the retargeter", () => {
        const logText = createLogText([
            createFrameRecord({
                frameIndex: 0,
                mediaTimeMs: 120,
                poseSnapshot: createPoseSnapshot(120),
            }),
            createFrameRecord({
                frameIndex: 1,
                mediaTimeMs: 220,
                poseSnapshot: createPoseSnapshot(220),
            }),
        ]);

        const first = createHarnessPlayer();
        const second = createHarnessPlayer();
        expect(first.loadRecordingText(logText).ok).toBe(true);
        expect(second.loadRecordingText(logText).ok).toBe(true);
        expect(first.startReplay({ mode: "pose-snapshot" }).ok).toBe(true);
        expect(second.startReplay({ mode: "pose-snapshot" }).ok).toBe(true);
        const firstStep = first.stepReplay(1);
        const secondStep = second.stepReplay(1);

        expect(firstStep.ok).toBe(true);
        expect(secondStep.ok).toBe(true);
        if (!firstStep.ok || !secondStep.ok) {
            return;
        }
        expect(JSON.stringify(firstStep.snapshot.poseRetarget)).toBe(
            JSON.stringify(secondStep.snapshot.poseRetarget),
        );
    });

    it("returns deterministic error codes for reserved or missing replay inputs", () => {
        const logText = createLogText([
            createFrameRecord({
                frameIndex: 0,
                mediaTimeMs: 120,
            }),
        ]);
        const player = createHarnessPlayer();
        expect(player.startReplay({ mode: "pose-snapshot" })).toMatchObject({
            ok: false,
            code: "no_recording_loaded",
        });
        expect(player.loadRecordingText(logText).ok).toBe(true);
        expect(player.startReplay({ mode: "mediapipe-raw-result" })).toMatchObject({
            ok: false,
            code: "unsupported_mode",
        });
        expect(player.startReplay({ mode: "pose-snapshot" })).toMatchObject({
            ok: false,
            code: "missing_pose_snapshot",
        });
        expect(player.startReplay({ mode: "final-pose-playback" })).toMatchObject({
            ok: false,
            code: "missing_final_pose",
        });
        expect(player.stepReplay(99)).toMatchObject({
            ok: false,
            code: "frame_index_out_of_range",
        });
    });

    it("reports parse_error for invalid log text and invalid pose snapshots", () => {
        const invalidPoseLog = createLogText([
            createFrameRecord({
                frameIndex: 0,
                mediaTimeMs: 120,
                poseSnapshot: {
                    detected: true,
                },
            }),
        ]);
        const player = createHarnessPlayer();

        expect(player.loadRecordingText("{")).toMatchObject({
            ok: false,
            code: "parse_error",
        });
        expect(player.loadRecordingText(invalidPoseLog).ok).toBe(true);
        expect(player.startReplay({ mode: "pose-snapshot" })).toMatchObject({
            ok: false,
            code: "parse_error",
        });
    });
});
