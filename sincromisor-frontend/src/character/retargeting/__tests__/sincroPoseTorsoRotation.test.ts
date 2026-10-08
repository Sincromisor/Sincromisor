import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { describe, expect, it } from "vitest";
import { normalizeSincroPoseLandmarkerResult } from "../../../features/gaze/poseTracking/sincroPoseTrackerNormalizer";
import { createProfile } from "../../motionIntent/__tests__/fingerCurlPoseLayerTestFixtures";
import { createTorsoFallbackLayer } from "../../vrmPose/vrmPoseTorsoFallback";
import { createSincroPoseTorsoRotation } from "../sincroPoseTorsoRotation";

function pose(rotation: Quaternion, offset = new Vector3(), hips = true) {
    const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
    for (const [index, point] of [
        [11, new Vector3(-0.2, 0.5, 0)],
        [12, new Vector3(0.2, 0.5, 0)],
        [23, new Vector3(-0.15, 0, 0)],
        [24, new Vector3(0.15, 0, 0)],
    ] as const) {
        const p = point.applyQuaternion(rotation).add(offset).negate();
        points[index] = { x: p.x, y: p.y, z: p.z, visibility: !hips && index >= 23 ? 0 : 1 };
    }
    return normalizeSincroPoseLandmarkerResult({
        result: {
            worldLandmarks: [points],
            landmarks: [points.map((p) => ({ ...p, x: 0.5 + p.x * 0.2, y: 0.5 + p.y * 0.2 }))],
        },
        nowMs: 0,
        inferenceTimeMs: 0,
        inferenceFps: 30,
        consecutiveFailures: 0,
    }).snapshot;
}
function quaternion(value: { x: number; y: number; z: number; w: number }) {
    return new Quaternion(value.x, value.y, value.z, value.w);
}

describe("共通体幹から上半身への配分", () => {
    it.each([
        [0.3, 0, 0],
        [0, 0.3, 0],
        [0, 0, 0.3],
        [0.2, 0.3, -0.1],
    ])("剛体回転と平行移動を本番正規化から確認する %j", (x, y, z) => {
        const rotation = new Quaternion().setFromEuler(new Euler(x, y, z));
        const actual = quaternion(createSincroPoseTorsoRotation(pose(rotation), 1));
        const translated = quaternion(
            createSincroPoseTorsoRotation(pose(rotation, new Vector3(1, 2, 3)), 1),
        );
        expect(actual.angleTo(rotation)).toBeLessThan(1e-7);
        expect(translated.angleTo(actual)).toBeLessThan(1e-7);
    });
    it("腰がない場合は前後傾斜を作らず、肩線の観測だけを制限して反映する", () => {
        const pitch = new Quaternion().setFromEuler(new Euler(0.4, 0, 0));
        expect(
            quaternion(createSincroPoseTorsoRotation(pose(pitch, new Vector3(), false), 1)).angleTo(
                new Quaternion(),
            ),
        ).toBeLessThan(1e-7);
        const roll = new Quaternion().setFromEuler(new Euler(0, 0, 0.4));
        const limited = quaternion(
            createSincroPoseTorsoRotation(pose(roll, new Vector3(), false), 1),
        );
        expect(limited.angleTo(new Quaternion())).toBeCloseTo(0.4 * 0.45);
    });
    it.each([true, false])(
        "任意ボーンの有無にかかわらず親から子の積が合計回転に一致する %s",
        (upperChest) => {
            const profile = createProfile();
            profile.capabilities.bones = {
                ...profile.capabilities.bones,
                spine: true,
                chest: true,
                upperChest,
            };
            const delta = quaternion(
                createSincroPoseTorsoRotation(
                    pose(new Quaternion().setFromEuler(new Euler(0.3, 0.2, -0.1))),
                    profile.torso.chestFollow,
                ),
            );
            const layer = createTorsoFallbackLayer({
                id: "torso",
                profile,
                delta,
                weight: 1,
                kind: "tracking",
            });
            const product = new Quaternion();
            for (const bone of ["spine", "chest", "upperChest"] as const) {
                const local = layer.pose[bone];
                if (local) product.multiply(quaternion(local));
            }
            expect(product.angleTo(delta)).toBeLessThan(1e-7);
            expect(layer.ownedBones.includes("upperChest")).toBe(upperChest);
            expect(layer.ownedBones).not.toContain("head");
        },
    );
});
