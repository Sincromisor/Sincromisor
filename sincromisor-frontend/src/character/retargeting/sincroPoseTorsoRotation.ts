/** 肩・腰の共通基底を中立のXYZ基底との差へ変換する。顔と画面内の中心位置は使わない。 */
import { Euler } from "three/src/math/Euler.js";
import { Matrix4 } from "three/src/math/Matrix4.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { estimateCanonicalTorsoFrame } from "../canonical/canonicalTorsoFrameEstimator";
import { readCanonicalWorldPoint } from "../canonical/canonicalWorldPoint";
import type { VrmPoseQuaternion } from "../vrmPose/vrmPoseTypes";

/** ワールド生座標が無い旧記録は中立。腰欠損時は肩線の旋回・横傾斜だけを45%以下で使う。 */
export function createSincroPoseTorsoRotation(
    snapshot: SincroPoseMotionSnapshot,
    follow: number,
): VrmPoseQuaternion {
    const rotation = new Quaternion();
    const { torso } = estimateCanonicalTorsoFrame({
        pose: snapshot,
        mediaTimeMs: snapshot.lastUpdatedAtMs ?? 0,
    });
    let confidence = torso.confidence;
    if (torso.source === "pose" && snapshot.upperBody.hipCenterTracked) {
        const right = new Vector3(...torso.bodyRight),
            up = new Vector3(...torso.bodyUp),
            front = new Vector3(...torso.bodyFront);
        // 反射基底は回転へ変換できない。誤った左右入力から姿勢を作らない。
        if (new Vector3().crossVectors(right, up).dot(front) > 0.999)
            rotation.setFromRotationMatrix(new Matrix4().makeBasis(right, up, front));
    } else {
        const left = readCanonicalWorldPoint(snapshot.leftArm.targets.shoulder);
        const right = readCanonicalWorldPoint(snapshot.rightArm.targets.shoulder);
        if (left && right) {
            const direction = new Vector3(...right).sub(new Vector3(...left));
            confidence = Math.min(
                0.45,
                snapshot.leftArm.targets.shoulder.world.worldConfidence,
                snapshot.rightArm.targets.shoulder.world.worldConfidence,
            );
            if (direction.lengthSq() > 1e-8) {
                direction.normalize();
                rotation.setFromEuler(
                    new Euler(
                        0,
                        Math.atan2(-direction.z, direction.x),
                        Math.asin(Math.max(-1, Math.min(1, direction.y))),
                        "YXZ",
                    ),
                );
            }
        }
    }
    const weight = Number.isFinite(follow * confidence)
        ? Math.max(0, Math.min(1, follow * confidence))
        : 0;
    const result = new Quaternion().slerp(rotation, weight).normalize();
    return { x: result.x, y: result.y, z: result.z, w: result.w };
}
