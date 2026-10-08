import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { describe, expect, it } from "vitest";
import { DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { createCanonicalState } from "../../../pages/motionDebug/__tests__/motionDebugViewerTestFixtures";
import { SincroArmIkSolver } from "../../ik/sincroArmIkSolver";
import { finalPoseAngleRad } from "../../motionEvaluation/motionFinalPoseMetrics";
import { SincroPoseRetargeter } from "../../retargeting/sincroPoseRetargeter";
import { TemporalStateEstimator } from "../../temporal/temporalStateEstimator";
import { COMPLETE_PROFILE } from "../../vrmPose/__tests__/vrmPoseComposerTestHelpers";
import { SincroMotionClock } from "../sincroMotionClock";
import { SincroVrmPoseComposerService } from "../sincroVrmPoseComposer";

function retargeterWithSkeleton() {
    const scene = new Object3D();
    const bones = new Map<VRMHumanBoneName, Object3D>();
    for (const side of ["left", "right"] as const) {
        let parent = scene;
        for (const [part, x] of [
            ["UpperArm", 0.2],
            ["LowerArm", 0.3],
            ["Hand", 0.3],
        ] as const) {
            const node = new Object3D();
            node.position.set((side === "left" ? -1 : 1) * x, 0, 0);
            parent.add(node);
            parent = node;
            bones.set(`${side}${part}`, node);
        }
    }
    scene.updateMatrixWorld(true);
    const source = {
        scene,
        humanoid: { getNormalizedBoneNode: (bone: VRMHumanBoneName) => bones.get(bone) ?? null },
    };
    const retargeter = new SincroPoseRetargeter();
    Object.defineProperty(retargeter, "armIkSolvers", {
        value: {
            left: SincroArmIkSolver.fromVrm(source, "left"),
            right: SincroArmIkSolver.fromVrm(source, "right"),
        },
    });
    return retargeter;
}
function input(time: number, leftLost = false, rightLost = false) {
    const state = createCanonicalState(time);
    for (const side of ["left", "right"] as const)
        state.arms[side] = {
            ...state.arms[side],
            confidence: (side === "left" ? leftLost : rightLost) ? 0 : 1,
            reach: 0.8,
            openness: 0.7,
            elevationRad: 0.4,
            forwardness: 0.3,
            elbowFlexionRad: 1,
            bodyLocalWrist: [(side === "left" ? -1 : 1) * 1.4, 0.5, 0.2],
            bodyLocalElbow: [(side === "left" ? -1 : 1) * 0.9, 0.3, 0.1],
        };
    return state;
}
describe("欠損から本番最終姿勢まで", () => {
    it("未検出・無到着で左右独立に期限切れになり、復帰完了も最終角速度を守る", () => {
        const estimator = new TemporalStateEstimator(),
            retargeter = retargeterWithSkeleton(),
            composer = new SincroVrmPoseComposerService();
        let temporal = estimator.update({ canonical: input(0), mediaTimeMs: 0 });
        const snapshot = {
            ...structuredClone(DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT),
            trackingEnabled: true,
            detected: true,
            confidence: 1,
        };
        const render = (time: number) => {
            const frame = retargeter.retarget(snapshot, time, {
                temporal,
                profile: COMPLETE_PROFILE,
                mediaTimeMs: time,
            });
            const final = composer.compose({
                frame,
                profile: COMPLETE_PROFILE,
                deltaSeconds: 0.1,
                mediaTimeMs: time,
            });
            return { frame, final: final.result!.finalPose };
        };
        render(0);
        temporal = estimator.update({ canonical: input(100, true), mediaTimeMs: 100 });
        const dropout = render(100);
        expect(temporal.arms.left.confidence).toBe(0);
        expect(temporal.arms.left.applicationWeight).toBeGreaterThan(0);
        expect(dropout.frame.leftArm.active).toBe(true);
        temporal = estimator.update({ canonical: input(200, true, true), mediaTimeMs: 200 });
        snapshot.detected = false;
        snapshot.confidence = 0;
        expect(render(200).frame.leftArm.active).toBe(true);
        expect(render(700).frame.leftArm.active).toBe(false);
        expect(render(700).frame.rightArm.active).toBe(true);
        let previous = render(900).final;
        expect(render(900).final).toEqual(previous);
        snapshot.detected = true;
        snapshot.confidence = 1;
        for (let time = 1000; time <= 1500; time += 100) {
            temporal = estimator.update({ canonical: input(time), mediaTimeMs: time });
            const next = render(time).final;
            for (const bone of [
                "leftUpperArm",
                "leftLowerArm",
                "rightUpperArm",
                "rightLowerArm",
            ] as const)
                expect(finalPoseAngleRad(previous[bone]!, next[bone]!)!).toBeLessThanOrEqual(
                    Math.PI * 0.4 + 1e-6,
                );
            previous = next;
        }
        snapshot.trackingEnabled = false;
        expect(render(1600).frame.leftArm.active).toBe(false);
    });
    it("大きい観測間隔でも欠損年齢を凍結しない", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({ canonical: input(0), mediaTimeMs: 0 });
        const lost = estimator.update({ canonical: input(1000, true), mediaTimeMs: 1000 });
        expect(lost.arms.left.observedAgeMs).toBe(1000);
        expect(lost.arms.left.state).toBe("lost");
        expect(estimator.update({ canonical: input(1000), mediaTimeMs: 1000 })).toEqual(lost);
        expect(
            estimator.update({ canonical: input(0), mediaTimeMs: 0 }).arms.left.observedAgeMs,
        ).toBe(0);
    });
    it("PoseとHandの受信対応と停止した再生時計を分離する", () => {
        const clock = new SincroMotionClock();
        clock.receive("pose", { mediaTimeMs: 100, receivedAtPerformanceMs: 1000 });
        clock.receive("hand", { mediaTimeMs: 150, receivedAtPerformanceMs: 1100 });
        expect(clock.evaluate(1200)).toMatchObject({ poseTimeMs: 300, handTimeMs: 250 });
        clock.setReplayTime(400);
        expect(clock.evaluate(50000)).toMatchObject({ poseTimeMs: 400, handTimeMs: 400 });
        const series = clock.evaluate(0).series;
        clock.reset();
        expect(clock.evaluate(0).series).toBeGreaterThan(series);
        expect(clock.evaluate(0).poseTimeMs).toBeUndefined();
    });
});
