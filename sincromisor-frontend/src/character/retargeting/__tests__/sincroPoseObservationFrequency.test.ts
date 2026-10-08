import { Object3D } from "three/src/core/Object3D.js";
import { describe, expect, it, vi } from "vitest";
import { normalizeSincroPoseLandmarkerResult } from "../../../features/gaze/poseTracking/sincroPoseTrackerNormalizer";
import { SincroArmIkSolver } from "../../ik/sincroArmIkSolver";
import { computeSincroCanonicalMotion } from "../../runtime/sincroMotionComputation";
import { TemporalStateEstimator } from "../../temporal/temporalStateEstimator";
import type { TemporalUpperBodyState } from "../../temporal/temporalUpperBodyState";
import { COMPLETE_PROFILE } from "../../vrmPose/__tests__/vrmPoseComposerTestHelpers";
import { SincroPoseRetargeter } from "../sincroPoseRetargeter";

function setup() {
    const scene = new Object3D(),
        upper = new Object3D(),
        lower = new Object3D(),
        hand = new Object3D(),
        opposite = new Object3D();
    lower.position.set(0.3, 0, 0);
    hand.position.set(0.3, 0, 0);
    opposite.position.set(-0.4, 0, 0);
    scene.add(upper, opposite);
    upper.add(lower);
    lower.add(hand);
    scene.updateMatrixWorld(true);
    const solver = SincroArmIkSolver.fromVrm(
        {
            scene,
            humanoid: {
                getNormalizedBoneNode: (name) => {
                    if (name === "leftUpperArm") return upper;
                    if (name === "leftLowerArm") return lower;
                    if (name === "leftHand") return hand;
                    if (name === "rightUpperArm") return opposite;
                    return null;
                },
            },
        },
        "left",
    );
    if (!solver) throw new Error("Missing solver");
    const retargeter = new SincroPoseRetargeter();
    Object.defineProperty(retargeter, "armIkSolvers", { value: { left: solver, right: solver } });
    const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    points[11] = { x: 0.6, y: 0.3, z: 0, visibility: 1 };
    points[12] = { x: 0.4, y: 0.3, z: 0, visibility: 1 };
    points[13] = { x: 0.7, y: 0.4, z: -0.1, visibility: 1 };
    points[15] = { x: 0.8, y: 0.3, z: -0.2, visibility: 1 };
    const snapshot = normalizeSincroPoseLandmarkerResult({
        result: { landmarks: [points], worldLandmarks: [points] },
        nowMs: 1000,
        inferenceTimeMs: 0,
        inferenceFps: 10,
        consecutiveFailures: 0,
    }).snapshot;
    snapshot.rightArm.tracked = false;
    return { retargeter, snapshot, solve: vi.spyOn(solver, "solve") };
}

describe("観測と描画の更新頻度", () => {
    it("同じ観測列の間に描画を増やしても観測フィルターと極への入力列は同じ", () => {
        const run = (dense: boolean) => {
            const { retargeter, snapshot, solve } = setup();
            const estimator = new TemporalStateEstimator();
            let temporal: TemporalUpperBodyState | undefined;
            for (const time of [1000, 1100, 1200]) {
                snapshot.lastUpdatedAtMs = time;
                const canonical = computeSincroCanonicalMotion({
                    pose: snapshot,
                    mediaTimeMs: time,
                });
                temporal = estimator.update({ canonical, mediaTimeMs: time });
                retargeter.retarget(snapshot, time, {
                    temporal,
                    profile: COMPLETE_PROFILE,
                    mediaTimeMs: time,
                });
                if (dense)
                    for (const elapsed of [16, 33, 50, 66, 83])
                        retargeter.retarget(snapshot, time + elapsed, {
                            temporal,
                            profile: COMPLETE_PROFILE,
                            mediaTimeMs: time + elapsed,
                        });
            }
            return {
                temporal,
                observations: solve.mock.calls
                    .filter(([, commit]) => commit !== false)
                    .map(([target]) => ({
                        wrist: target.wrist.toArray(),
                        pole: target.elbowPole.toArray(),
                    })),
            };
        };
        const sparse = run(false),
            dense = run(true);
        expect(sparse.observations.length).toBeGreaterThan(0);
        expect(dense).toEqual(sparse);
    });

    it.each([true, false])("旧Pose経路も観測が確かめられるときだけ極を確定する %s", (timestamp) => {
        const { retargeter, snapshot, solve } = setup();
        if (!timestamp) snapshot.lastUpdatedAtMs = undefined;
        for (const time of [1000, 1016, 1033, 1050]) retargeter.retarget(snapshot, time);
        expect(solve.mock.calls.filter(([, commit]) => commit !== false)).toHaveLength(
            timestamp ? 1 : 0,
        );
        snapshot.lastUpdatedAtMs = 1100;
        retargeter.retarget(snapshot, 1100);
        expect(solve.mock.calls.filter(([, commit]) => commit !== false)).toHaveLength(
            timestamp ? 2 : 1,
        );
    });
});
