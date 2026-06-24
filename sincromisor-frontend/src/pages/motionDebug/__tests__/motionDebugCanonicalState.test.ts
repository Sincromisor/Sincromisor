import { describe, expect, it } from "vitest";

import {
    createDefaultReliabilityMap,
    RELIABILITY_MAP_SCHEMA_VERSION,
} from "../../../character/reliability/reliabilityMap";
import { createMotionDebugCanonicalReliabilityInput } from "../motionDebugCanonicalState";

describe("createMotionDebugCanonicalReliabilityInput", () => {
    it("projects the canonical downstream arm weights as JSON-friendly state", () => {
        const reliability = createDefaultReliabilityMap(240);
        reliability.parts.leftArm.finalWeight = 0.81;
        reliability.joints.leftShoulder.finalWeight = 0.9;
        reliability.joints.leftElbow.finalWeight = 0.72;
        reliability.joints.leftWrist.finalWeight = 0.8;
        reliability.parts.rightArm.finalWeight = 0.64;
        reliability.joints.rightShoulder.finalWeight = 0.7;
        reliability.joints.rightElbow.finalWeight = 0.6;
        reliability.joints.rightWrist.finalWeight = 0.5;

        expect(createMotionDebugCanonicalReliabilityInput(reliability)).toEqual({
            schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            mediaTimeMs: 240,
            leftArm: {
                partWeight: 0.81,
                minJointWeight: 0.72,
            },
            rightArm: {
                partWeight: 0.64,
                minJointWeight: 0.5,
            },
        });
    });

    it("stays absent when canonical did not receive reliability", () => {
        expect(createMotionDebugCanonicalReliabilityInput(undefined)).toBeUndefined();
    });
});
