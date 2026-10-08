import { describe, expect, it } from "vitest";
import { normalizeSincroPoseLandmarkerResult } from "../../../features/gaze/poseTracking/sincroPoseTrackerNormalizer";
import { createTemporalArmIkInput } from "../../motionSolver/temporalArmSolverBridge";
import { computeSincroCanonicalMotion } from "../../runtime/sincroMotionComputation";
import { TemporalStateEstimator } from "../../temporal/temporalStateEstimator";
import { COMPLETE_PROFILE } from "../../vrmPose/__tests__/vrmPoseComposerTestHelpers";

function pose(scale = 1, offset = [0, 0, 0], wrist = [-0.65, -0.6, -0.25]) {
    const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    const positions = {
        11: [0.2, -0.5, 0],
        12: [-0.2, -0.5, 0],
        13: [0.4, -0.6, -0.1],
        14: [-0.4, -0.6, -0.1],
        15: wrist.map((v, i) => (i === 0 ? -v : v)),
        16: wrist,
        23: [0.15, 0, 0],
        24: [-0.15, 0, 0],
    };
    for (const [index, xyz] of Object.entries(positions))
        points[Number(index)] = {
            x: xyz[0] * scale + offset[0],
            y: xyz[1] * scale + offset[1],
            z: xyz[2] * scale + offset[2],
            visibility: 1,
        };
    return normalizeSincroPoseLandmarkerResult({
        result: {
            landmarks: [
                points.map((p) => ({
                    ...p,
                    x: 0.5 + (p.x * 0.2) / scale,
                    y: 0.5 + (p.y * 0.2) / scale,
                })),
            ],
            worldLandmarks: [points],
        },
        nowMs: 0,
        inferenceTimeMs: 0,
        inferenceFps: 30,
        consecutiveFailures: 0,
    }).snapshot;
}
function canonical(snapshot = pose()) {
    return computeSincroCanonicalMotion({ pose: snapshot, mediaTimeMs: 0 });
}
function target(state: ReturnType<typeof canonical>, avatarScale: number) {
    const temporal = new TemporalStateEstimator().update({ canonical: state, mediaTimeMs: 0 });
    return createTemporalArmIkInput({
        temporal,
        side: "right",
        profile: COMPLETE_PROFILE,
        solver: {
            shoulderWidth: 0.4 * avatarScale,
            upperArmLength: 0.3 * avatarScale,
            lowerArmLength: 0.3 * avatarScale,
        },
    });
}
describe("本番正規化から腕までの座標", () => {
    it("肩・腰の原点が異なる保存値から直交した体幹を作る", () => {
        const state = canonical();
        expect(state.torso.source).toBe("pose");
        expect(state.torso.confidence).toBe(1);
        expect(state.torso.bodyUp).toEqual([0, 1, 0]);
        expect(state.torso.bodyRight).toEqual([1, 0, 0]);
    });
    it("撮影者の平行移動と一様拡大、VRMの拡大で方向と到達率が変わらない", () => {
        const first = target(canonical(), 1);
        const transformed = target(canonical(pose(2, [0.2, 0.1, -0.3])), 2);
        expect(
            transformed
                .target!.wrist.clone()
                .normalize()
                .distanceTo(first.target!.wrist.clone().normalize()),
        ).toBeLessThan(1e-12);
        expect(
            transformed
                .target!.elbowPole.clone()
                .normalize()
                .distanceTo(first.target!.elbowPole.clone().normalize()),
        ).toBeLessThan(1e-12);
        expect(transformed.reach!.requestedReachRatio).toBeCloseTo(
            first.reach!.requestedReachRatio,
            12,
        );
    });
    it.each([
        [-0.6, -0.8, 0],
        [-0.6, 0, 0],
        [-0.2, -0.5, -0.5],
        [0.4, -0.5, 0],
    ])("上げ下げ・前出し・交差の解剖学的左右を保つ %j", (...wrist) => {
        const state = canonical(pose(1, [0, 0, 0], wrist));
        expect(state.arms.left.elevationRad).toBeCloseTo(state.arms.right.elevationRad);
        expect(state.arms.left.openness).toBeCloseTo(state.arms.right.openness);
        const direction = target(state, 1).target!.wrist;
        expect(Math.sign(direction.y)).toBe(Math.sign(-wrist[1] - 0.5));
        expect(Math.sign(direction.z)).toBe(Math.sign(-wrist[2]) || 0);
        expect(Math.sign(direction.x)).toBe(Math.sign(-wrist[0] - 0.2));
    });
    it("傾いた肩線でも直交し、腰欠損時は基底全体を履歴へ戻す", () => {
        const snapshot = pose();
        snapshot.rightArm.targets.shoulder.world.rawY = -0.7;
        const previous = canonical(snapshot);
        const { bodyRight, bodyUp, bodyFront } = previous.torso;
        const dot = (a: readonly number[], b: readonly number[]) =>
            a.reduce((sum, x, i) => sum + x * b[i], 0);
        expect(dot(bodyRight, bodyUp)).toBeCloseTo(0, 12);
        expect(dot(bodyRight, bodyFront)).toBeCloseTo(0, 12);
        expect(dot(bodyUp, bodyFront)).toBeCloseTo(0, 12);
        for (const axis of [bodyRight, bodyUp, bodyFront])
            expect(Math.hypot(...axis)).toBeCloseTo(1, 12);
        snapshot.lowerBodyTargets.leftHip.world.rawX = undefined;
        snapshot.lowerBodyTargets.rightHip.world.rawX = undefined;
        const fallback = computeSincroCanonicalMotion({
            pose: snapshot,
            previous,
            mediaTimeMs: 100,
        });
        for (const key of ["bodyRight", "bodyUp", "bodyFront"] as const)
            for (let i = 0; i < 3; i++)
                expect(fallback.torso[key][i]).toBeCloseTo(previous.torso[key][i], 12);
    });
    it("rawの無い旧記録はnormalized値で補わない", () => {
        const snapshot = pose();
        for (const arm of [snapshot.leftArm, snapshot.rightArm])
            for (const point of Object.values(arm.targets)) {
                point.world.rawX = undefined;
            }
        const state = canonical(snapshot);
        expect(state.torso.source).toBe("neutral");
        expect(state.arms.right.warnings).toContain("missing_world_coordinates");
    });
});
