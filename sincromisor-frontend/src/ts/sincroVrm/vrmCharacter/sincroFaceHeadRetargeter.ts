import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroFaceMotionSnapshot } from "../../faceTracking/sincroFaceMotionSnapshot";
import { applySincroFaceDeadband, scaleSincroFaceRotation } from "./sincroFaceRetargetMath";
import {
    DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
    type SincroFaceNeutralPose,
    type SincroFaceRetargetConfig,
    type SincroFaceRetargetedHeadPose,
} from "./sincroFaceRetargetTypes";

export function retargetSincroFaceHeadPose(
    snapshot: SincroFaceMotionSnapshot,
    neutralPose: SincroFaceNeutralPose | undefined,
    config: SincroFaceRetargetConfig = DEFAULT_SINCRO_FACE_RETARGET_CONFIG,
): SincroFaceRetargetedHeadPose {
    const neutral = neutralPose ?? { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
    const yawSign = config.mirrorYaw ? -1 : 1;
    const yawDeg = applySincroFaceDeadband(
        (snapshot.headPose.yawDeg - neutral.yawDeg) * config.headInputScale.yaw * yawSign,
        config.headDeadbandDeg,
    );
    const pitchDeg = applySincroFaceDeadband(
        // MediaPipe の pitch と VRM 正規化ボーンの X 回転は上下方向の符号が逆になる。
        // sincro モードでは首・頭へ直接加算するため、retarget 境界で VRM 座標へ揃える。
        -(snapshot.headPose.pitchDeg - neutral.pitchDeg) * config.headInputScale.pitch,
        config.headDeadbandDeg,
    );
    const rollDeg = applySincroFaceDeadband(
        (snapshot.headPose.rollDeg - neutral.rollDeg) * config.headInputScale.roll * yawSign,
        config.headDeadbandDeg,
    );
    const clamped = {
        x: MathUtils.degToRad(
            MathUtils.clamp(pitchDeg, -config.maxHeadDeg.pitch, config.maxHeadDeg.pitch),
        ),
        y: MathUtils.degToRad(
            MathUtils.clamp(yawDeg, -config.maxHeadDeg.yaw, config.maxHeadDeg.yaw),
        ),
        z: MathUtils.degToRad(
            MathUtils.clamp(-rollDeg, -config.maxHeadDeg.roll, config.maxHeadDeg.roll),
        ),
    };

    return {
        upperChest: scaleSincroFaceRotation(clamped, config.headBoneWeights.upperChest),
        neck: scaleSincroFaceRotation(clamped, config.headBoneWeights.neck),
        head: scaleSincroFaceRotation(clamped, config.headBoneWeights.head),
    };
}
