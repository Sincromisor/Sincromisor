import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    type SincroPoseRetargetConfig,
} from "../retargeting/sincroPoseRetargeter";

/** 通常設定と診断操作が変更できる姿勢調整。ソルバー内部の固定係数は含めない。 */
export type SincroPoseTuningConfig = Pick<
    SincroPoseRetargetConfig,
    | "intensityScale"
    | "minConfidence"
    | "returnToNeutralMs"
    | "smoothingMs"
    | "armIkStrength"
    | "armIkTargetScale"
    | "armIkMaxLiftRad"
    | "armIkMaxOpenRad"
    | "armIkMaxForearmFlexRad"
    | "armIkMode"
    | "composerSemanticFingerApplicationMode"
>;

/** UI・保存・シーンから独立した姿勢調整の正本。アプリと検証ページがそれぞれ所有する。 */
export class SincroPoseSettingsModel {
    private config = createDefaultSincroPoseTuningConfig();
    private readonly listeners = new Set<(config: SincroPoseTuningConfig) => void>();

    /** 表示やシーン側の変更が正本へ混入しないよう現在値を複製する。 */
    getConfig(): SincroPoseTuningConfig {
        return { ...this.config };
    }

    /** 正規化済み現在値を通知し、保存側へ明示指定された項目だけを返す。 */
    applyConfig(partial: Partial<SincroPoseRetargetConfig>): Partial<SincroPoseTuningConfig> {
        this.config = normalizeSincroPoseTuning(this.config, partial);
        for (const listener of this.listeners) listener(this.getConfig());
        return Object.fromEntries(Object.entries(this.config).filter(([key]) => key in partial));
    }

    /** 設定変更を購読する。同じ関数の再登録でも解除は登録自身だけに作用する。 */
    subscribe(listener: (config: SincroPoseTuningConfig) => void): () => void {
        const notify = (config: SincroPoseTuningConfig) => listener(config);
        this.listeners.add(notify);
        return () => {
            this.listeners.delete(notify);
        };
    }
}

/** 本番の既定値から、利用者が調整できる項目だけを独立した値として作る。 */
export function createDefaultSincroPoseTuningConfig(): SincroPoseTuningConfig {
    return {
        intensityScale: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.intensityScale,
        minConfidence: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.minConfidence,
        returnToNeutralMs: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.returnToNeutralMs,
        smoothingMs: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.smoothingMs,
        armIkStrength: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkStrength,
        armIkTargetScale: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkTargetScale,
        armIkMaxLiftRad: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMaxLiftRad,
        armIkMaxOpenRad: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMaxOpenRad,
        armIkMaxForearmFlexRad: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMaxForearmFlexRad,
        armIkMode: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMode,
        composerSemanticFingerApplicationMode:
            DEFAULT_SINCRO_POSE_RETARGET_CONFIG.composerSemanticFingerApplicationMode,
    };
}

/** 既存の診断調整と同じ範囲で正規化する。非有限値は下限、未指定は現在値を使う。 */
export function normalizeSincroPoseTuning(
    current: SincroPoseTuningConfig,
    config: Partial<SincroPoseRetargetConfig>,
): SincroPoseTuningConfig {
    return {
        ...current,
        intensityScale: clampNumber(config.intensityScale ?? current.intensityScale, 0, 1.2),
        minConfidence: clampNumber(config.minConfidence ?? current.minConfidence, 0, 1),
        returnToNeutralMs: clampNumber(
            config.returnToNeutralMs ?? current.returnToNeutralMs,
            80,
            2000,
        ),
        smoothingMs: clampNumber(config.smoothingMs ?? current.smoothingMs, 40, 800),
        armIkStrength: clampNumber(config.armIkStrength ?? current.armIkStrength, 0, 1),
        armIkTargetScale: clampNumber(
            config.armIkTargetScale ?? current.armIkTargetScale,
            0.2,
            1.5,
        ),
        armIkMaxLiftRad: clampNumber(
            config.armIkMaxLiftRad ?? current.armIkMaxLiftRad,
            0,
            Math.PI / 2,
        ),
        armIkMaxOpenRad: clampNumber(
            config.armIkMaxOpenRad ?? current.armIkMaxOpenRad,
            0,
            Math.PI / 2,
        ),
        armIkMaxForearmFlexRad: clampNumber(
            config.armIkMaxForearmFlexRad ?? current.armIkMaxForearmFlexRad,
            0,
            Math.PI / 2,
        ),
        armIkMode: config.armIkMode ?? current.armIkMode,
        composerSemanticFingerApplicationMode:
            config.composerSemanticFingerApplicationMode ??
            current.composerSemanticFingerApplicationMode,
    };
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
