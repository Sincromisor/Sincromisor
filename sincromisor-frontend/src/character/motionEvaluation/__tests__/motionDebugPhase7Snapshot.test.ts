import { describe, expect, it } from "vitest";
import {
    AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
    type AvatarMotionProfile,
} from "../../avatarProfile/avatarMotionProfile";
import { SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION } from "../../calibration/initialSincroCalibration";
import { SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION } from "../../calibration/onlineSincroCalibrationTypes";
import type { CanonicalCalibrationSnapshot } from "../../canonical/canonicalUpperBodyState";
import {
    createMotionDebugPhase7Snapshot,
    MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
    parseMotionDebugPhase7Snapshot,
} from "../motionDebugPhase7Snapshot";

describe("MotionDebugPhase7Snapshot", () => {
    it("creates and parses a plain profile/calibration snapshot", () => {
        const snapshot = createMotionDebugPhase7Snapshot({
            profile: createAvatarProfile(),
            initialCalibration: {
                schemaVersion: SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION,
                status: "ready",
                startedAtMediaTimeMs: 100,
                completedAtMediaTimeMs: 240,
                steps: {
                    neutral: {
                        id: "neutral",
                        status: "ready",
                        validDurationMs: 1200,
                        score: 0.92,
                        retryReasons: [],
                        measurements: {
                            neutralYawRad: 0.02,
                            shoulderWidth: 0.42,
                            torsoScale: 1.04,
                            handBaseline: createCalibration().handBaseline,
                        },
                        debug: {
                            faceYawAbsRad: 0.02,
                            stable: true,
                            source: "fixture",
                        },
                    },
                },
                userGuideMessages: [],
                debugReasons: [],
            },
            onlineCalibration: {
                schemaVersion: SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION,
                initial: createCalibration(),
                candidate: {
                    ...createCalibration("online-candidate"),
                    stableDurationMs: 3200,
                },
                committed: {
                    ...createCalibration("online-committed"),
                    updatedAtMediaTimeMs: 4200,
                },
                freezeReasons: ["candidate_not_stable"],
            },
            activeCanonicalCalibration: createCalibration("active"),
            warnings: ["profile_missing_finger_chain"],
        });

        expect(snapshot).toBeDefined();
        const parsed = parseMotionDebugPhase7Snapshot(snapshot);

        expect(parsed.ok).toBe(true);
        if (!parsed.ok) {
            return;
        }
        expect(parsed.snapshot).toMatchObject({
            schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
            profile: {
                schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
                torso: {
                    distribution: {
                        upperChest: 0.35,
                    },
                },
            },
            initialCalibration: {
                status: "ready",
                steps: {
                    neutral: {
                        measurements: {
                            shoulderWidth: 0.42,
                        },
                    },
                },
            },
            onlineCalibration: {
                committed: {
                    updatedAtMediaTimeMs: 4200,
                },
            },
            activeCanonicalCalibration: {
                id: "active",
            },
            warnings: ["profile_missing_finger_chain"],
        });
    });

    it("does not create an empty unexecuted snapshot", () => {
        expect(createMotionDebugPhase7Snapshot({})).toBeUndefined();
    });

    it("rejects unknown schema and invalid nested state without throwing", () => {
        expect(
            parseMotionDebugPhase7Snapshot({
                schemaVersion: "sincro.phase7-profile-calibration.v2",
                warnings: [],
            }),
        ).toMatchObject({
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                },
            ],
        });

        const parsed = parseMotionDebugPhase7Snapshot({
            schemaVersion: MOTION_DEBUG_PHASE7_SCHEMA_VERSION,
            profile: {
                schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
            },
            activeCanonicalCalibration: {
                ...createCalibration(),
                shoulderWidth: -1,
            },
            warnings: [],
        });

        expect(parsed.ok).toBe(false);
        if (parsed.ok) {
            return;
        }
        expect(parsed.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                    path: expect.arrayContaining(["profile"]),
                }),
                expect.objectContaining({
                    code: "out_of_range",
                    path: ["activeCanonicalCalibration", "shoulderWidth"],
                }),
            ]),
        );
    });
});

function createCalibration(id = "initial"): CanonicalCalibrationSnapshot {
    return {
        id,
        source: id === "initial" ? "initial" : "online",
        neutralYawRad: 0.02,
        shoulderWidth: 0.42,
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
    };
}

function createAvatarProfile(): AvatarMotionProfile {
    const fingerChain = {
        proximal: true,
        intermediate: true,
        distal: true,
    };
    const hand = {
        thumb: fingerChain,
        index: fingerChain,
        middle: fingerChain,
        ring: fingerChain,
        little: fingerChain,
    };
    return {
        schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
        model: {
            vrmVersion: "1.0",
            modelName: "Phase 7 test avatar",
        },
        capabilities: {
            bones: {
                upperChest: true,
                leftShoulder: true,
                rightShoulder: true,
                leftHand: true,
                rightHand: true,
            },
            fingerChains: {
                left: hand,
                right: hand,
            },
        },
        restLocalRotation: {
            leftUpperArm: [0, 0, 0, 1],
            rightUpperArm: [0, 0, 0, 1],
        },
        metrics: {
            shoulderWidth: 0.42,
            torsoLength: 0.5,
            headSize: 0.22,
            upperArmLength: {
                left: 0.24,
                right: 0.24,
            },
            lowerArmLength: {
                left: 0.22,
                right: 0.22,
            },
            handSize: {
                left: 0.08,
                right: 0.081,
            },
        },
        torso: {
            distribution: {
                spine: 0.25,
                chest: 0.4,
                upperChest: 0.35,
            },
            chestFollow: 0.55,
        },
        arm: {
            reachScale: 0.92,
            lateralScale: 0.9,
            verticalScale: 0.95,
            depthCompression: 0.6,
            elbowOutwardBias: 0.25,
            shoulderDamping: 0.55,
        },
        wrist: {
            wristRollInfluence: 0.4,
            lowerArmTwistShare: 0.65,
            handTwistShare: 0.35,
        },
        fingers: {
            curlScale: 0.8,
            curlMode: "grouped",
            curlDistribution: {
                proximal: 0.5,
                intermediate: 0.3,
                distal: 0.2,
            },
            splayLimitDeg: 12,
        },
        risk: {
            smallBodyLargeHead: 0.2,
            missingUpperChest: false,
            missingShoulders: false,
            constraintRisk: 0.1,
        },
        warnings: [],
    };
}
