import {
    cloneSincroRoiObservation,
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "./sincroFaceMotionSnapshot";

/** 未検出の顔状態を生成し、表情・警告・頭部姿勢を既定値から独立させる。 */
export function createDefaultFaceMotionSnapshot(): SincroFaceMotionSnapshot {
    return cloneFaceMotionSnapshot(DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT);
}

/** 行動表示用の顔状態を複製する。頭部行列は共有し、更新時刻がない場合だけ指定時刻で補完する。 */
export function cloneFaceMotionSnapshot(
    snapshot: SincroFaceMotionSnapshot,
    nowMs?: number,
): SincroFaceMotionSnapshot {
    return {
        ...snapshot,
        headPose: { ...snapshot.headPose },
        blendshapes: { ...snapshot.blendshapes },
        roi: cloneSincroRoiObservation(snapshot.roi),
        warnings: [...snapshot.warnings],
        lastUpdatedAtMs: snapshot.lastUpdatedAtMs ?? nowMs,
    };
}

/** 観測の取り込みと状態の公開で、顔の警告・領域・頭部行列を呼び出し元から分離する。 */
export function clonePipelineFaceMotionSnapshot(
    snapshot: SincroFaceMotionSnapshot,
): SincroFaceMotionSnapshot {
    const cloned = cloneFaceMotionSnapshot(snapshot);
    const matrix = snapshot.headPose.matrix;
    return {
        ...cloned,
        headPose: {
            ...cloned.headPose,
            matrix: matrix === undefined ? undefined : [...matrix],
        },
    };
}
