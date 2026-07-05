import { describe, expect, it } from "vitest";
import { AVATAR_MOTION_PROFILE_SCHEMA_VERSION } from "../../../character/avatarProfile/avatarMotionProfile";
import { MOTION_DEBUG_PHASE7_SCHEMA_VERSION } from "../../../character/motionEvaluation/motionDebugPhase7Snapshot";
import { createDefaultMotionIntentState } from "../../../character/motionIntent/motionIntentState";
import { createDefaultSnapshot } from "../../../features/debug/model/debugConsoleSnapshot";
import { createMotionDebugViewerSnapshot } from "../motionDebugViewerModel";
import {
    createAvatarMotionProfile,
    createFinalPose,
    createLiveSnapshot,
    createPhase6Solver,
    createPhase7Snapshot,
    createPhase9Snapshot,
} from "./motionDebugViewerTestFixtures";

describe("motion-debug viewer solver layer", () => {
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

    it("marks legacy solver logs without phase6 as not recorded", () => {
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
                solver: {
                    poseRetarget: createDefaultSnapshot().sincroMotion.poseRetargetRuntime,
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("not_recorded");
    });

    it("shows live Phase 6 solver snapshot when avatar profile is available", () => {
        const liveSnapshot = createLiveSnapshot();
        liveSnapshot.poseRetargetRuntime.avatarMotionProfile = createAvatarMotionProfile();
        liveSnapshot.poseRetargetRuntime.leftArm.constraint = {
            ...liveSnapshot.poseRetargetRuntime.leftArm.constraint,
            poleState: "uncertain",
            reasonCodes: ["pole_flip_rejected"],
        };

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
                value: {
                    schemaVersion: "sincro.phase6-solver.v1",
                    profile: {
                        schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
                        measurements: {
                            shoulderWidth: 0.4,
                        },
                    },
                    arms: {
                        left: {
                            ik: {
                                poleState: "uncertain",
                                constraintReasonCodes: ["pole_flip_rejected"],
                            },
                        },
                    },
                },
            },
            phase7: {
                status: "not_recorded",
            },
            phase9: {
                status: "not_recorded",
            },
        });
    });

    it("shows invalid solver sublayers without failing finalPose invalid handling", () => {
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
                solver: {
                    phase6: {
                        schemaVersion: "sincro.phase6-solver.v1",
                        profile: {
                            schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
                        },
                    },
                },
                finalPose: {
                    schemaVersion: "sincro.vrm-pose-composer-result.v1",
                    ownedBones: ["leftUpperArm"],
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "invalid",
                value: {
                    parseStatus: "invalid",
                    raw: {
                        schemaVersion: "sincro.phase6-solver.v1",
                    },
                },
            },
            phase7: {
                status: "not_recorded",
            },
        });
        expect(viewer.layers.finalPose.status).toBe("invalid");
    });

    it("shows saved Phase 6 solver and finalPose replay layers as available", () => {
        const liveSnapshot = createLiveSnapshot();
        const viewer = createMotionDebugViewerSnapshot({
            mode: "replay",
            selectedLayer: "finalPose",
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
                solver: {
                    phase6: createPhase6Solver(),
                },
                finalPose: createFinalPose(),
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
                value: {
                    arms: {
                        left: {
                            ik: {
                                poleState: "uncertain",
                            },
                        },
                    },
                },
            },
            phase7: {
                status: "not_recorded",
            },
        });
        expect(viewer.layers.finalPose.status).toBe("available");
        expect(viewer.layers.finalPose.value).toMatchObject({
            schemaVersion: "sincro.vrm-pose-composer-result.v1",
            ownedBones: ["leftUpperArm"],
        });
    });

    it("shows saved Phase 7 replay sublayer next to Phase 6", () => {
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
                solver: {
                    phase6: createPhase6Solver(),
                    phase7: createPhase7Snapshot("phase7-replay"),
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
            },
            phase7: {
                status: "available",
                value: {
                    schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
                    profile: {
                        schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
                    },
                    activeCanonicalCalibration: {
                        id: "phase7-replay",
                    },
                },
            },
        });
    });

    it("keeps solver available when Phase 7 replay sublayer is invalid", () => {
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
                solver: {
                    phase6: createPhase6Solver(),
                    phase7: {
                        schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
                        activeCanonicalCalibration: {
                            id: "phase7-invalid",
                            source: "online",
                            neutralYawRad: 0.02,
                            shoulderWidth: -1,
                            torsoScale: 1.04,
                            handBaseline: {
                                left: {
                                    palmSize: 0.08,
                                    openSpread: 0.18,
                                },
                                right: {
                                    palmSize: 0.081,
                                    openSpread: 0.176,
                                },
                            },
                            capturedAtMediaTimeMs: 240,
                        },
                        warnings: [],
                    },
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "available",
            },
            phase7: {
                status: "invalid",
                value: {
                    parseStatus: "invalid",
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            code: "out_of_range",
                            path: ["activeCanonicalCalibration", "shoulderWidth"],
                        }),
                    ]),
                },
            },
        });
    });

    it("shows saved Phase 9 replay sublayer as available", () => {
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
                solver: {
                    phase9: createPhase9Snapshot(120),
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "not_recorded",
            },
            phase7: {
                status: "not_recorded",
            },
            phase9: {
                status: "available",
                value: {
                    schemaVersion: "sincro.phase9-semantic-motion.v1",
                    timestamp: { mediaTimeMs: 120 },
                    intent: {
                        schemaVersion: "sincro.motion-intent.v1",
                    },
                    layers: [
                        {
                            id: "semantic:left:small_wave",
                            kind: "semantic",
                            weight: 0.5,
                            ownedBones: ["leftUpperArm"],
                        },
                    ],
                },
            },
        });
    });

    it("keeps solver available when Phase 9 replay sublayer is invalid", () => {
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
                solver: {
                    phase9: {
                        ...createPhase9Snapshot(120),
                        intent: {
                            ...createDefaultMotionIntentState(120),
                            arms: {
                                left: {
                                    ...createDefaultMotionIntentState(120).arms.left,
                                    intent: "thumbs_up",
                                },
                                right: createDefaultMotionIntentState(120).arms.right,
                            },
                        },
                    },
                },
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase9: {
                status: "invalid",
                value: {
                    parseStatus: "invalid",
                    errors: expect.arrayContaining([
                        expect.objectContaining({
                            code: "invalid_state",
                            path: ["intent", "arms", "left", "intent"],
                        }),
                    ]),
                },
            },
        });
    });

    it("shows live Phase 7 snapshot from live snapshot state", () => {
        const liveSnapshot = createLiveSnapshot({
            phase7: createPhase7Snapshot("phase7-live"),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "solver",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.solver.status).toBe("available");
        expect(viewer.layers.solver.value).toMatchObject({
            phase6: {
                status: "not_recorded",
            },
            phase7: {
                status: "available",
                value: {
                    activeCanonicalCalibration: {
                        id: "phase7-live",
                    },
                },
            },
        });
    });

    it("shows live finalPose snapshot when the app supplies a composer result", () => {
        const liveSnapshot = createLiveSnapshot({
            finalPose: createFinalPose(),
        });

        const viewer = createMotionDebugViewerSnapshot({
            mode: "live",
            selectedLayer: "finalPose",
            liveSnapshot,
            replayState: {
                status: "idle",
                frameCount: 0,
            },
        });

        expect(viewer.layers.finalPose.status).toBe("available");
        expect(viewer.layers.finalPose.value).toMatchObject({
            ownedBones: ["leftUpperArm"],
        });
    });
});
