import { createCanonicalUpperBodyState } from "../canonical/canonicalArmFeatureExtractor";
import { estimateCanonicalTorsoFrame } from "../canonical/canonicalTorsoFrameEstimator";
import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import { MotionIntentEstimator } from "../motionIntent/motionIntentEstimator";
import type { MotionIntentEstimatorInput } from "../motionIntent/motionIntentEstimatorTypes";
import type { MotionIntentState } from "../motionIntent/motionIntentState";
import {
    TemporalStateEstimator,
    type TemporalStateEstimatorInput,
} from "../temporal/temporalStateEstimator";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";

/** 正規化済み追跡値と前回の共通表現。観測の蓄積と時刻の選択は呼び出し元が担う。 */
export type SincroCanonicalMotionInput = Omit<
    Parameters<typeof createCanonicalUpperBodyState>[0],
    "torso"
>;

/** 体幹の座標系を推定してから、同じ入力の腕・頭部を共通表現へ変換する。状態は保持しない。 */
export function computeSincroCanonicalMotion(
    input: SincroCanonicalMotionInput,
): CanonicalUpperBodyState {
    return createCanonicalUpperBodyState({ ...input, torso: estimateCanonicalTorsoFrame(input) });
}

/** 時系列を進めるフレームの入力。手とジェスチャーは意図推定にだけ渡す。 */
export type SincroMotionComputationInput = TemporalStateEstimatorInput &
    Pick<MotionIntentEstimatorInput, "hand" | "gesture">;

/**
 * 一つの入力系列の推定状態を持ち、時系列→意図の順に進める。
 * 各本番・ライブ・再生経路が別インスタンスを所有し、入力停止や切替で初期化する。
 * 観測蓄積・録画・DOM・VRM適用は持たず、保存値を採用する再生では必要な段階だけ呼べる。
 */
export class SincroMotionComputation {
    private readonly temporalEstimator = new TemporalStateEstimator();
    private readonly intentEstimator = new MotionIntentEstimator();

    /** 同じ時刻の時系列結果を意図推定へ一度だけ渡す。Pose以外の観測更新では呼ばない。 */
    update(input: SincroMotionComputationInput): {
        temporal: TemporalUpperBodyState;
        intent: MotionIntentState;
    } {
        const temporal = this.updateTemporal(input);
        return { temporal, intent: this.updateIntent({ ...input, temporal }) };
    }

    /** 共通表現から時系列状態を進める。保存済み時系列を採用するフレームでは呼ばない。 */
    updateTemporal(input: TemporalStateEstimatorInput): TemporalUpperBodyState {
        return this.temporalEstimator.update(input);
    }

    /** 有効な時系列と同一フレームの観測から意図を推定する。保存済み意図は入力しない。 */
    updateIntent(input: MotionIntentEstimatorInput): MotionIntentState {
        return this.intentEstimator.update(input);
    }

    /** フィルターと意図の保持・抑止期間を、次の入力系列へ持ち越さない。 */
    reset(): void {
        this.temporalEstimator.reset();
        this.intentEstimator.reset();
    }
}
