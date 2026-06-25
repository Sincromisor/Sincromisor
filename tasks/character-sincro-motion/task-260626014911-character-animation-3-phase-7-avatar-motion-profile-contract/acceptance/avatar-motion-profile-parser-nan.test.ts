import { describe, expect, it } from "vitest";
import {
    AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
    parseAvatarMotionProfile,
} from "../../../../sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts";

function validProfile(): unknown {
    return {
        schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
        model: { vrmVersion: "1.0", modelName: "Acceptance Avatar" },
        capabilities: {
            bones: { hips: true },
            fingerChains: {
                left: {
                    thumb: { proximal: false, intermediate: false, distal: false },
                    index: { proximal: false, intermediate: false, distal: false },
                    middle: { proximal: false, intermediate: false, distal: false },
                    ring: { proximal: false, intermediate: false, distal: false },
                    little: { proximal: false, intermediate: false, distal: false },
                },
                right: {
                    thumb: { proximal: false, intermediate: false, distal: false },
                    index: { proximal: false, intermediate: false, distal: false },
                    middle: { proximal: false, intermediate: false, distal: false },
                    ring: { proximal: false, intermediate: false, distal: false },
                    little: { proximal: false, intermediate: false, distal: false },
                },
            },
        },
        restLocalRotation: { hips: [0, 0, 0, 1] },
        metrics: {
            shoulderWidth: 0.4,
            torsoLength: 0.5,
            headSize: 0.2,
            upperArmLength: { left: 0.3, right: 0.3 },
            lowerArmLength: { left: 0.25, right: 0.25 },
            handSize: { left: 0.08, right: 0.08 },
        },
        torso: { distribution: { spine: 1, chest: 0, upperChest: 0 }, chestFollow: 0.55 },
        arm: {
            reachScale: 0.92,
            lateralScale: 0.9,
            verticalScale: 0.95,
            depthCompression: 0.6,
            elbowOutwardBias: 0.25,
            shoulderDamping: 0.55,
        },
        wrist: { wristRollInfluence: 0.4, lowerArmTwistShare: 0.65, handTwistShare: 0.35 },
        fingers: {
            curlScale: 0.8,
            curlMode: "grouped",
            curlDistribution: { proximal: 0.5, intermediate: 0.3, distal: 0.2 },
            splayLimitDeg: 12,
        },
        risk: {
            smallBodyLargeHead: 0,
            missingUpperChest: true,
            missingShoulders: true,
            constraintRisk: 0.55,
        },
        warnings: [],
    };
}

describe("parseAvatarMotionProfile acceptance", () => {
    it("classifies NaN numeric fields as out_of_range", () => {
        const profile = validProfile() as { metrics: { shoulderWidth: number } };
        profile.metrics.shoulderWidth = Number.NaN;

        const result = parseAvatarMotionProfile(profile);

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "out_of_range",
                    path: ["metrics", "shoulderWidth"],
                }),
            ]),
        );
    });

    it("keeps non-number numeric fields classified as invalid_state", () => {
        const profile = validProfile() as { metrics: { shoulderWidth: unknown } };
        profile.metrics.shoulderWidth = "wide";

        const result = parseAvatarMotionProfile(profile);

        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                    path: ["metrics", "shoulderWidth"],
                }),
            ]),
        );
    });
});
