/** 分類器へ渡す短時間の動作履歴を保持し、特徴量計算を専用モジュールへ委ねる。 */
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { ArmMotionIntent, MotionIntentState } from "../motionIntent/motionIntentState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";

import { aggregateSideFeatures, createEmptySideFeatures } from "./motionSequenceFeatures";

/** 分類器へ渡す履歴集計の形式を識別する。 */
export const MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION = "sincro.motion-sequence-window.v1" as const;

const DEFAULT_SEQUENCE_WINDOW_CONFIG = {
    maxDurationMs: 1200,
    maxSamples: 90,
};

type MotionSequenceWindowWarning = "non_monotonic_time_reset";

/** 動画内の時刻に対応する低次元の観測値。未取得の層は欠損のまま保持する。 */
export type MotionSequenceSample = {
    mediaTimeMs: number;
    temporal?: TemporalUpperBodyState;
    intent?: MotionIntentState;
    reliability?: ReliabilityMap;
    hand?: SincroHandMotionSnapshot;
};

/** 履歴を保持する時間幅（ミリ秒）と最大標本数。両方の制限を適用する。 */
export type MotionSequenceWindowConfig = {
    maxDurationMs: number;
    maxSamples: number;
};

/** 片腕の意図継続時間（ミリ秒）と観測変化の回数。分類器の入力となる。 */
export type MotionSequenceSideFeatures = {
    intentTransitions: number;
    semanticHoldMs: number;
    stableSemanticIntent?: ArmMotionIntent;
    gestureFlickerCount: number;
    trackingLossMs: number;
    sideSwapSuspectCount: number;
    wristVelocitySignChanges: number;
    handOpenCloseTransitions: number;
};

/** 保持区間の時刻・利用可能な観測層・左右の特徴量をまとめた読み取り結果。 */
export type MotionSequenceWindowSnapshot = {
    schemaVersion: typeof MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION;
    startMediaTimeMs: number;
    endMediaTimeMs: number;
    sampleCount: number;
    inputAvailability: {
        temporal: boolean;
        intent: boolean;
        reliability: boolean;
        hand: boolean;
    };
    warnings: MotionSequenceWindowWarning[];
    features: {
        left: MotionSequenceSideFeatures;
        right: MotionSequenceSideFeatures;
    };
};

function emptySnapshot(
    warnings: readonly MotionSequenceWindowWarning[],
): MotionSequenceWindowSnapshot {
    return {
        schemaVersion: MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION,
        startMediaTimeMs: 0,
        endMediaTimeMs: 0,
        sampleCount: 0,
        inputAvailability: {
            temporal: false,
            intent: false,
            reliability: false,
            hand: false,
        },
        warnings: [...warnings],
        features: {
            left: createEmptySideFeatures(),
            right: createEmptySideFeatures(),
        },
    };
}

/** 時間幅と件数で履歴を制限し、時刻逆行時は前の系列を破棄する。 */
export class MotionSequenceWindow {
    private readonly config: MotionSequenceWindowConfig;
    private samples: MotionSequenceSample[] = [];
    private warnings: MotionSequenceWindowWarning[] = [];

    /** 既定では直近1200ms・最大90標本を保持する。 */
    constructor(config: Partial<MotionSequenceWindowConfig> = {}) {
        this.config = {
            maxDurationMs: config.maxDurationMs ?? DEFAULT_SEQUENCE_WINDOW_CONFIG.maxDurationMs,
            maxSamples: config.maxSamples ?? DEFAULT_SEQUENCE_WINDOW_CONFIG.maxSamples,
        };
    }

    /** 観測を追加し、保持範囲を超えた標本を除いて集計結果を返す。 */
    add(sample: MotionSequenceSample): MotionSequenceWindowSnapshot {
        const previousSample = this.samples[this.samples.length - 1];
        if (previousSample !== undefined && sample.mediaTimeMs < previousSample.mediaTimeMs) {
            this.samples = [];
            this.warnings = ["non_monotonic_time_reset"];
        }
        this.samples.push(sample);
        this.evictSamples();
        return this.snapshot();
    }

    /** 同時刻の入力順を保って集計する。内部の履歴配列は変更しない。 */
    snapshot(): MotionSequenceWindowSnapshot {
        const sortedSamples = [...this.samples].sort(
            (left, right) => left.mediaTimeMs - right.mediaTimeMs,
        );
        const firstSample = sortedSamples[0];
        const lastSample = sortedSamples[sortedSamples.length - 1];
        if (firstSample === undefined || lastSample === undefined) {
            return emptySnapshot(this.warnings);
        }

        return {
            schemaVersion: MOTION_SEQUENCE_WINDOW_SCHEMA_VERSION,
            startMediaTimeMs: firstSample.mediaTimeMs,
            endMediaTimeMs: lastSample.mediaTimeMs,
            sampleCount: sortedSamples.length,
            inputAvailability: {
                temporal: sortedSamples.some((sample) => sample.temporal !== undefined),
                intent: sortedSamples.some((sample) => sample.intent !== undefined),
                reliability: sortedSamples.some((sample) => sample.reliability !== undefined),
                hand: sortedSamples.some((sample) => sample.hand !== undefined),
            },
            warnings: [...this.warnings],
            features: {
                left: aggregateSideFeatures(sortedSamples, "left"),
                right: aggregateSideFeatures(sortedSamples, "right"),
            },
        };
    }

    /** 動作系列の切り替え時に履歴と時刻逆行の警告を消す。 */
    reset(): void {
        this.samples = [];
        this.warnings = [];
    }

    private evictSamples(): void {
        while (this.samples.length > this.config.maxSamples) {
            this.samples.shift();
        }
        let lastSample = this.samples[this.samples.length - 1];
        let firstSample = this.samples[0];
        while (
            firstSample !== undefined &&
            lastSample !== undefined &&
            lastSample.mediaTimeMs - firstSample.mediaTimeMs > this.config.maxDurationMs
        ) {
            this.samples.shift();
            firstSample = this.samples[0];
            lastSample = this.samples[this.samples.length - 1];
        }
    }
}
