/** 指の保持基点。尺度や意図を適用する前の特徴だけを合成サービスが左右別に所有する。 */
import type {
    SincroHandFeatureSnapshot,
    SincroHandMotionSnapshot,
} from "../../features/gaze/handTracking/sincroHandMotionSnapshot";

/** 左右別の有効観測。Hand時計の観測時刻を保存し、描画時刻を混ぜない。 */
export type FingerCurlObservation = {
    side: "left" | "right";
    observedAtMs: number;
    features: SincroHandFeatureSnapshot;
};

/** 既存の250ms保持期限。観測時計へ変換済みの評価時刻との差だけを使う。 */
export const FINGER_OBSERVATION_HOLD_MS = 250;

/** Hand正規化の低信頼判定（0.2）と左右割当を確認し、新しい実観測だけを複製する。 */
export function observeFingerCurl(
    hand: SincroHandMotionSnapshot | undefined,
    side: "left" | "right",
    observedAtMs: number | undefined,
    evaluationTimeMs: number,
    previous?: FingerCurlObservation,
): FingerCurlObservation | undefined {
    if (!hand) return previous;
    if (!hand.trackingEnabled) return undefined;
    const current = side === "left" ? hand.leftHand : hand.rightHand;
    if (
        observedAtMs === undefined ||
        !Number.isFinite(observedAtMs) ||
        !Number.isFinite(evaluationTimeMs) ||
        observedAtMs > evaluationTimeMs
    )
        return previous;
    if (previous && observedAtMs < previous.observedAtMs) previous = undefined;
    if (
        !hand.detected ||
        !current.detected ||
        current.assignedSide !== side ||
        !Number.isFinite(current.confidence) ||
        current.confidence < 0.2 ||
        (current.source !== "roi" && current.source !== "full-frame-fallback") ||
        current.warnings.some((warning) =>
            [
                "side_inconsistent",
                "duplicate_assignment",
                "low_confidence",
                "landmarks_missing",
            ].includes(warning),
        ) ||
        (!Object.values(current.features.fingerCurl).some(Number.isFinite) &&
            current.features.openness === "unknown") ||
        observedAtMs === previous?.observedAtMs
    )
        return previous;
    return { side, observedAtMs, features: structuredClone(current.features) };
}

/** 欠損・無到着とも最後の実観測から期限を測り、逆行や期限超過を無効にする。 */
export function isFingerObservationFresh(
    observation: FingerCurlObservation | undefined,
    evaluationTimeMs: number,
): observation is FingerCurlObservation {
    const age = evaluationTimeMs - (observation?.observedAtMs ?? Number.NaN);
    return Number.isFinite(age) && age >= 0 && age <= FINGER_OBSERVATION_HOLD_MS;
}
