import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../../../poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../poseTracking/sincroPoseMotionSnapshotClone";
import {
    calculateRoiConsistency,
    createFaceRoiFromPose,
    createHandRoiFromPoseArm,
    mapCropPointToFullFrame,
    mapFullFramePointToCrop,
    validateRoiRect,
} from "../roiCoordinateMapping";
import type { SincroRoiPoint, SincroRoiRect } from "../roiTrackingTypes";

function createPoint(
    cameraX: number,
    cameraY: number,
    options: { tracked?: boolean; quality?: SincroPoseTargetPointSnapshot["quality"] } = {},
): SincroPoseTargetPointSnapshot {
    const tracked = options.tracked ?? true;
    const quality = options.quality ?? (tracked ? "strong" : "lost");
    return {
        ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
        tracked,
        quality,
        confidence: tracked ? 0.9 : 0,
        visibility: tracked ? 0.9 : 0,
        presence: tracked ? 0.9 : 0,
        hasFiniteCoordinates: tracked,
        usableForIk: tracked,
        ikWeight: tracked ? 1 : 0,
        stale: !tracked,
        staleReason: tracked ? undefined : "not_tracked",
        cameraX,
        cameraY,
        world: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT.world },
    };
}

function createArm(input: {
    wrist: SincroPoseTargetPointSnapshot;
    elbow: SincroPoseTargetPointSnapshot;
    confidence?: number;
}): SincroPoseArmMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
        tracked: true,
        confidence: input.confidence ?? 0.86,
        targets: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets,
            shoulder: createPoint(0.5, 0.35),
            elbow: input.elbow,
            wrist: input.wrist,
        },
    };
}

function createPose(input: {
    detected?: boolean;
    shoulderWidth?: number;
    shoulderCenterX?: number;
    shoulderCenterY?: number;
    confidence?: number;
}): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        detected: input.detected ?? true,
        confidence: input.confidence ?? 0.76,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderWidth: input.shoulderWidth ?? 0.2,
            shoulderCenterX: input.shoulderCenterX ?? 0.5,
            shoulderCenterY: input.shoulderCenterY ?? 0.4,
        },
    });
}

function expectPointClose(actual: SincroRoiPoint, expected: SincroRoiPoint, precision = 12): void {
    expect(actual[0]).toBeCloseTo(expected[0], precision);
    expect(actual[1]).toBeCloseTo(expected[1], precision);
}

describe("ROI coordinate mapping", () => {
    it("creates left hand ROI from pose wrist with outward center offset", () => {
        const roi = createHandRoiFromPoseArm({
            side: "left",
            arm: createArm({
                wrist: createPoint(0.3, 0.5),
                elbow: createPoint(0.4, 0.5),
            }),
            shoulderWidth: 0.2,
        });

        expect(roi.side).toBe("left");
        expect(roi.source).toBe("pose-wrist");
        expect(roi.confidence).toBeCloseTo(0.86);
        expect(roi.referencePoint).toEqual([0.3, 0.5]);
        expect(roi.rect.centerX).toBeCloseTo(0.264);
        expect(roi.rect.centerY).toBeCloseTo(0.5);
        expect(roi.rect.width).toBeCloseTo(0.24);
        expect(roi.rect.height).toBeCloseTo(0.24);
        expect(roi.rect.clamped).toBe(false);
        expect(roi.warnings).toEqual([]);
    });

    it("creates right hand ROI from pose wrist with mirrored outward center offset", () => {
        const roi = createHandRoiFromPoseArm({
            side: "right",
            arm: createArm({
                wrist: createPoint(0.7, 0.5),
                elbow: createPoint(0.6, 0.5),
            }),
            shoulderWidth: 0.2,
        });

        expect(roi.side).toBe("right");
        expect(roi.source).toBe("pose-wrist");
        expect(roi.rect.centerX).toBeCloseTo(0.736);
        expect(roi.rect.centerY).toBeCloseTo(0.5);
        expect(roi.rect.width).toBeCloseTo(0.24);
        expect(roi.rect.height).toBeCloseTo(0.24);
    });

    it("falls back to missing hand observation without throwing when wrist is lost", () => {
        const roi = createHandRoiFromPoseArm({
            side: "left",
            arm: createArm({
                wrist: createPoint(0.3, 0.5, { tracked: false }),
                elbow: createPoint(0.4, 0.5),
            }),
            shoulderWidth: 0.2,
        });

        expect(roi.source).toBe("none");
        expect(roi.confidence).toBe(0);
        expect(roi.rect).toEqual({
            centerX: 0.5,
            centerY: 0.5,
            width: 0.24,
            height: 0.24,
            clamped: false,
        });
        expect(roi.warnings).toEqual(["roi_missing"]);
    });

    it("creates face ROI from pose shoulder center and shoulder width", () => {
        const roi = createFaceRoiFromPose({
            pose: createPose({ shoulderWidth: 0.2, shoulderCenterX: 0.5, shoulderCenterY: 0.4 }),
        });

        expect(roi.side).toBe("face");
        expect(roi.source).toBe("pose-face");
        expect(roi.confidence).toBeCloseTo(0.76);
        expectPointClose(roi.referencePoint ?? [0, 0], [0.5, 0.22]);
        expect(roi.rect.centerX).toBeCloseTo(0.5);
        expect(roi.rect.centerY).toBeCloseTo(0.22);
        expect(roi.rect.width).toBeCloseTo(0.29);
        expect(roi.rect.height).toBeCloseTo(0.29);
    });

    it("returns missing face observation when pose is not detected", () => {
        const roi = createFaceRoiFromPose({
            pose: createPose({ detected: false }),
        });

        expect(roi.source).toBe("none");
        expect(roi.confidence).toBe(0);
        expect(roi.warnings).toEqual(["roi_missing", "pose_not_detected"]);
    });

    it("clips ROI edges and recalculates center and size from clipped bounds", () => {
        const roi = validateRoiRect({
            side: "right",
            source: "pose-wrist",
            centerX: 0.95,
            centerY: 0.1,
            width: 0.2,
            height: 0.3,
            confidence: 1.4,
        });

        expect(roi.rect.centerX).toBeCloseTo(0.925);
        expect(roi.rect.centerY).toBeCloseTo(0.125);
        expect(roi.rect.width).toBeCloseTo(0.15);
        expect(roi.rect.height).toBeCloseTo(0.25);
        expect(roi.rect.clamped).toBe(true);
        expect(roi.confidence).toBe(1);
        expect(roi.warnings).toEqual(["roi_clamped"]);
    });

    it("marks clipped ROI as too small after edge clipping", () => {
        const roi = validateRoiRect({
            side: "left",
            source: "pose-wrist",
            centerX: 0.02,
            centerY: 0.5,
            width: 0.1,
            height: 0.2,
            confidence: 0.8,
        });

        expect(roi.rect.width).toBeCloseTo(0.07);
        expect(roi.rect.height).toBeCloseTo(0.2);
        expect(roi.rect.clamped).toBe(true);
        expect(roi.confidence).toBe(0);
        expect(roi.warnings).toEqual(["roi_clamped", "roi_too_small"]);
    });

    it("round-trips crop and full-frame normalized points within 1e-6", () => {
        const roi: SincroRoiRect = {
            centerX: 0.4,
            centerY: 0.6,
            width: 0.28,
            height: 0.32,
            clamped: false,
        };
        const cropPoint: SincroRoiPoint = [0.17, 0.83];

        const fullFramePoint = mapCropPointToFullFrame(roi, cropPoint);
        const mappedCropPoint = mapFullFramePointToCrop(roi, fullFramePoint);

        expect(Math.abs(mappedCropPoint[0] - cropPoint[0])).toBeLessThanOrEqual(1e-6);
        expect(Math.abs(mappedCropPoint[1] - cropPoint[1])).toBeLessThanOrEqual(1e-6);
    });

    it("calculates ROI consistency scores and boundary warnings", () => {
        expect(calculateRoiConsistency({ expected: [0, 0], observed: [0.04, 0] })).toEqual({
            score: 1,
            distance: 0.04,
            warnings: [],
        });

        const mid = calculateRoiConsistency({ expected: [0, 0], observed: [0.11, 0] });
        expect(mid.score).toBeCloseTo(0.5);
        expect(mid.distance).toBeCloseTo(0.11);
        expect(mid.warnings).toEqual(["roi_inconsistent"]);

        const far = calculateRoiConsistency({ expected: [0, 0], observed: [0.18, 0] });
        expect(far.score).toBeCloseTo(0);
        expect(far.distance).toBeCloseTo(0.18);
        expect(far.warnings).toEqual(["roi_inconsistent"]);

        expect(calculateRoiConsistency({ expected: undefined, observed: [0, 0] })).toEqual({
            score: 0,
            distance: null,
            warnings: ["roi_missing"],
        });
    });
});
