/** 全画面へ復元済みの手ランドマークから低次元特徴量を作る。推論・ROI復元・左右割当は扱わない。 */
import type { SincroHandFeatureSnapshot, SincroHandTuple3 } from "./sincroHandMotionSnapshot";

/** x/yは全画面正規化座標、zはMediaPipeの値を維持する。非有限座標の補正は正規化側で終える。 */
export type FullFrameHandLandmark = {
    x: number;
    y: number;
    z: number;
};

/** MediaPipeの21点の並び。正規化側も手首と必要点数の判定に使う。 */
export const HAND_LANDMARK = {
    wrist: 0,
    thumbCmc: 1,
    thumbMcp: 2,
    thumbIp: 3,
    thumbTip: 4,
    indexMcp: 5,
    indexPip: 6,
    indexDip: 7,
    indexTip: 8,
    middleMcp: 9,
    middlePip: 10,
    middleDip: 11,
    middleTip: 12,
    ringMcp: 13,
    ringPip: 14,
    ringDip: 15,
    ringTip: 16,
    littleMcp: 17,
    littlePip: 18,
    littleDip: 19,
    littleTip: 20,
};

/** 復元済みランドマークから手のひら方向と指の低次元特徴を作る。手の開閉は信頼度と欠損を考慮する。 */
export function createSincroHandFeatureSnapshot(input: {
    landmarks: readonly FullFrameHandLandmark[];
    confidence: number;
    landmarksMissing: boolean;
}): SincroHandFeatureSnapshot {
    // 掌寸法の下限を0.001にして、指特徴量の比率計算でゼロ除算を避ける。
    const palmSize = Math.max(
        distance3d(input.landmarks[HAND_LANDMARK.wrist], input.landmarks[HAND_LANDMARK.middleMcp]),
        0.001,
    );
    const fingerCurl = {
        thumb: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.thumbMcp,
            HAND_LANDMARK.thumbTip,
            palmSize,
        ),
        index: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.indexMcp,
            HAND_LANDMARK.indexTip,
            palmSize,
        ),
        middle: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.middleMcp,
            HAND_LANDMARK.middleTip,
            palmSize,
        ),
        ring: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.ringMcp,
            HAND_LANDMARK.ringTip,
            palmSize,
        ),
        little: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.littleMcp,
            HAND_LANDMARK.littleTip,
            palmSize,
        ),
    };
    return {
        palmNormal: palmNormal(input.landmarks),
        palmDirection: palmDirection(input.landmarks),
        fingerCurl,
        fingerSplay: {
            indexMiddle: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.indexMcp,
                HAND_LANDMARK.middleMcp,
            ),
            middleRing: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.middleMcp,
                HAND_LANDMARK.ringMcp,
            ),
            ringLittle: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.ringMcp,
                HAND_LANDMARK.littleMcp,
            ),
        },
        thumbOppose: thumbOppose(input.landmarks, palmSize),
        openness: determineSincroHandOpenness({
            fingerCurl,
            confidence: input.confidence,
            landmarksMissing: input.landmarksMissing,
        }),
    };
}

/** 信頼度0.2未満・欠損は不明とし、親指以外の平均曲げ量0.35・0.72を境に開閉を判定する。 */
export function determineSincroHandOpenness(input: {
    fingerCurl: Pick<SincroHandFeatureSnapshot, "fingerCurl">["fingerCurl"];
    confidence: number;
    landmarksMissing?: boolean;
}): SincroHandFeatureSnapshot["openness"] {
    if (input.landmarksMissing || input.confidence < 0.2) {
        return "unknown";
    }
    const averageCurl =
        (input.fingerCurl.index +
            input.fingerCurl.middle +
            input.fingerCurl.ring +
            input.fingerCurl.little) /
        4;
    if (averageCurl <= 0.35) {
        return "open";
    }
    if (averageCurl < 0.72) {
        return "half";
    }
    return "closed";
}

// 手首から中指の付け根へ向かう単位方向。長さが無ければ従来の画面上向きへ戻す。
function palmDirection(landmarks: readonly FullFrameHandLandmark[]): SincroHandTuple3 {
    return normalizeTuple3(
        vector3(landmarks[HAND_LANDMARK.wrist], landmarks[HAND_LANDMARK.middleMcp]),
        [0, -1, 0],
    );
}

// 人差し指と小指の付け根への外積を使い、退化時は正面方向へ戻す。
function palmNormal(landmarks: readonly FullFrameHandLandmark[]): SincroHandTuple3 {
    const wrist = landmarks[HAND_LANDMARK.wrist];
    const index = landmarks[HAND_LANDMARK.indexMcp];
    const little = landmarks[HAND_LANDMARK.littleMcp];
    const indexVector = vector3(wrist, index);
    const littleVector = vector3(wrist, little);
    return normalizeTuple3(cross(indexVector, littleVector), [0, 0, 1]);
}

// 掌寸法の1.6倍を指の伸長基準とする既存の近似。関節回転を復元するものではない。
function calculateFingerCurl(
    landmarks: readonly FullFrameHandLandmark[],
    mcpIndex: number,
    tipIndex: number,
    palmSize: number,
): number {
    return clamp01(1 - distance3d(landmarks[mcpIndex], landmarks[tipIndex]) / (palmSize * 1.6));
}

// 隣接する付け根への方向差を60度で割って0〜1へ制限する。
function fingerSplay(
    landmarks: readonly FullFrameHandLandmark[],
    firstMcpIndex: number,
    secondMcpIndex: number,
): number {
    const wrist = landmarks[HAND_LANDMARK.wrist];
    const first = normalizeTuple3(vector3(wrist, landmarks[firstMcpIndex]), [0, 0, 0]);
    const second = normalizeTuple3(vector3(wrist, landmarks[secondMcpIndex]), [0, 0, 0]);
    const dot = clamp(dot3(first, second), -1, 1);
    return clamp01(Math.acos(dot) / (Math.PI / 3));
}

// 親指先と小指付け根の近さを掌寸法の2倍で評価する。
function thumbOppose(landmarks: readonly FullFrameHandLandmark[], palmSize: number): number {
    const thumbTip = landmarks[HAND_LANDMARK.thumbTip];
    const littleMcp = landmarks[HAND_LANDMARK.littleMcp];
    return clamp01(1 - distance3d(thumbTip, littleMcp) / (palmSize * 2));
}

function vector3(
    from: FullFrameHandLandmark | undefined,
    to: FullFrameHandLandmark | undefined,
): SincroHandTuple3 {
    if (from === undefined || to === undefined) {
        return [0, 0, 0];
    }
    return [finiteOrZero(to.x - from.x), finiteOrZero(to.y - from.y), finiteOrZero(to.z - from.z)];
}

function cross(left: SincroHandTuple3, right: SincroHandTuple3): SincroHandTuple3 {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}

function normalizeTuple3(value: SincroHandTuple3, fallback: SincroHandTuple3): SincroHandTuple3 {
    const length = Math.hypot(value[0], value[1], value[2]);
    if (!Number.isFinite(length) || length <= 0) {
        return fallback;
    }
    return [value[0] / length, value[1] / length, value[2] / length];
}

function distance3d(
    left: FullFrameHandLandmark | undefined,
    right: FullFrameHandLandmark | undefined,
): number {
    if (left === undefined || right === undefined) {
        return 0;
    }
    return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function dot3(left: SincroHandTuple3, right: SincroHandTuple3): number {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function clamp01(value: number): number {
    return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}
