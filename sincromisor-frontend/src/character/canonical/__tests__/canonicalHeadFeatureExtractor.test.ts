import { describe, expect, it } from "vitest";

import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import { createDefaultReliabilityMap, type ReliabilityMap } from "../../reliability/reliabilityMap";
import { extractCanonicalHeadState } from "../canonicalHeadFeatureExtractor";
import { parseCanonicalUpperBodyState } from "../canonicalUpperBodyState";

function createFace(overrides: Partial<SincroFaceMotionSnapshot> = {}): SincroFaceMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        detected: true,
        confidence: 0.9,
        source: "full-frame",
        headPose: {
            yawDeg: 10,
            pitchDeg: -5,
            rollDeg: 3,
            matrix: createMatrixForExtraction({
                yawRad: 0.3,
                pitchRad: -0.2,
                rollRad: 0.1,
            }),
        },
        warnings: [],
        ...overrides,
    };
}

function createMatrixForExtraction(input: {
    yawRad: number;
    pitchRad: number;
    rollRad: number;
}): number[] {
    const r00 = 1;
    const r10 = Math.tan(input.rollRad) * r00;
    const sy = Math.sqrt(r00 * r00 + r10 * r10);
    return [
        r00,
        0,
        0,
        0,
        r10,
        1,
        0,
        0,
        -Math.tan(input.yawRad) * sy,
        Math.tan(input.pitchRad),
        1,
        0,
        0,
        0,
        0,
        1,
    ];
}

function createTrackedHeadReliability(mediaTimeMs = 1234): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    reliability.joints.head.state = "tracked";
    reliability.joints.head.finalWeight = 1;
    reliability.joints.head.source = "face";
    reliability.parts.head.state = "tracked";
    reliability.parts.head.finalWeight = 1;
    reliability.parts.head.source = "face";
    return reliability;
}

describe("extractCanonicalHeadState", () => {
    it("creates a canonical head from a finite 16-value face matrix", () => {
        const head = extractCanonicalHeadState({ face: createFace() });

        expect(head).toMatchObject({
            confidence: 0.9,
            source: "face",
            warnings: [],
            outOfRangeFields: [],
        });
        expect(head?.yawRad).toBeCloseTo(0.3);
        expect(head?.pitchRad).toBeCloseTo(-0.2);
        expect(head?.rollRad).toBeCloseTo(0.1);
    });

    it("falls back to Euler degrees and clamps confidence when matrix is missing", () => {
        const head = extractCanonicalHeadState({
            face: createFace({
                confidence: 0.9,
                headPose: { yawDeg: 12, pitchDeg: -6, rollDeg: 3 },
            }),
        });

        expect(head?.confidence).toBe(0.65);
        expect(head?.yawRad).toBeCloseTo((12 * Math.PI) / 180);
        expect(head?.warnings).toContain("face_matrix_missing");
    });

    it("falls back to Euler degrees and clamps confidence when matrix is invalid", () => {
        const head = extractCanonicalHeadState({
            face: createFace({
                confidence: 0.9,
                headPose: {
                    yawDeg: 12,
                    pitchDeg: -6,
                    rollDeg: 3,
                    matrix: [1, Number.POSITIVE_INFINITY],
                },
            }),
        });

        expect(head?.confidence).toBe(0.5);
        expect(head?.rollRad).toBeCloseTo((3 * Math.PI) / 180);
        expect(head?.warnings).toContain("face_matrix_invalid");
    });

    it("omits head for invalid matrix when Euler fallback is non-finite and does not reuse previous", () => {
        const head = extractCanonicalHeadState({
            face: createFace({
                headPose: {
                    yawDeg: Number.NaN,
                    pitchDeg: 0,
                    rollDeg: 0,
                    matrix: [1, 2, 3],
                },
            }),
            previous: {
                yawRad: 0.7,
                pitchRad: 0,
                rollRad: 0,
                confidence: 1,
                source: "face",
                warnings: [],
                outOfRangeFields: [],
            },
        });

        expect(head).toBeUndefined();
    });

    it("omits head for lost or zero-confidence face snapshots", () => {
        expect(
            extractCanonicalHeadState({
                face: createFace({ source: "lost" }),
            }),
        ).toBeUndefined();
        expect(
            extractCanonicalHeadState({
                face: createFace({ detected: false }),
            }),
        ).toBeUndefined();
        expect(
            extractCanonicalHeadState({
                face: createFace({ confidence: 0 }),
            }),
        ).toBeUndefined();
    });

    it("downweights confidence from both head part and head joint reliability", () => {
        const reliability = createTrackedHeadReliability();
        reliability.parts.head.finalWeight = 0.25;
        reliability.joints.head.finalWeight = 0.64;

        const head = extractCanonicalHeadState({
            face: createFace({ confidence: 0.8 }),
            reliability,
        });

        expect(head?.confidence).toBeCloseTo(0.32);
    });

    it("omits head when either head reliability side is lost or too small", () => {
        const lostPart = createTrackedHeadReliability();
        lostPart.parts.head.state = "lost";
        expect(
            extractCanonicalHeadState({ face: createFace(), reliability: lostPart }),
        ).toBeUndefined();

        const smallJointWeight = createTrackedHeadReliability();
        smallJointWeight.joints.head.finalWeight = 0.049;
        expect(
            extractCanonicalHeadState({ face: createFace(), reliability: smallJointWeight }),
        ).toBeUndefined();
    });

    it("keeps new matrix warning codes parseable in canonical state", () => {
        const head = extractCanonicalHeadState({
            face: createFace({
                headPose: { yawDeg: 1, pitchDeg: 2, rollDeg: 3 },
            }),
        });

        const result = parseCanonicalUpperBodyState({
            schemaVersion: "sincro.canonical-upper-body.v1",
            timestamp: { mediaTimeMs: 1 },
            torso: {
                coordinateSystem: "body_local",
                shoulderCenter: [0, 0, 0],
                bodyRight: [1, 0, 0],
                bodyUp: [0, 1, 0],
                bodyFront: [0, 0, 1],
                shoulderWidth: 1,
                torsoScale: 1,
                yawRad: 0,
                confidence: 1,
                source: "pose",
                warnings: [],
                outOfRangeFields: [],
            },
            head,
            arms: {
                left: createArm(),
                right: createArm(),
            },
            calibration: {
                id: "test",
                source: "default",
                neutralYawRad: 0,
                shoulderWidth: 1,
                torsoScale: 1,
                handBaseline: {
                    left: { palmSize: 1, openSpread: 1 },
                    right: { palmSize: 1, openSpread: 1 },
                },
            },
            warnings: ["face_matrix_missing"],
        });

        expect(result.ok).toBe(true);
    });
});

function createArm() {
    return {
        reach: 0,
        elevationRad: 0,
        openness: 0,
        forwardness: 0,
        elbowFlexionRad: 0,
        classification: "unknown",
        confidence: 0,
        source: "neutral",
        warnings: [],
        outOfRangeFields: [],
    };
}
