import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { UserMediaManager } from "../../features/media/userMedia/userMediaManager";
import type { SincroAppSettingsPersistence } from "../settings/sincroAppSettingsPersistence";

/** 診断の操作を音声処理へ適用し、その操作結果だけを保存する。通常設定の復元後に保存先を接続する。 */
export class SincroAudioTuningBinding {
    private persistence?: SincroAppSettingsPersistence;
    private restoring = false;
    constructor(
        private readonly params: {
            debug: DebugConsoleManager;
            media: UserMediaManager;
            clearVenuePreset: () => boolean;
        },
    ) {
        const { debug, media } = params;
        debug.setLocalAudioFilterChangeCallback((config) => {
            media.setAudioFilterConfig(config);
            const cleared = this.clearVenuePreset();
            this.persistence?.saveAudioTuning({
                ...(cleared
                    ? { vadRmsThreshold: media.getManualVadThresholds().rmsThreshold }
                    : {}),
                filterConfig: media.getAudioFilterConfig(),
                peakThreshold: media.getManualVadThresholds().peakThreshold,
            });
        });
        debug.setLocalVadThresholdModeChangeCallback((mode) => {
            media.setVadThresholdMode(mode);
            debug.setLocalVadRmsThreshold(media.getVadThresholds().rmsThreshold);
            this.persistence?.saveAudioTuning({ vadThresholdMode: mode });
        });
        debug.setLocalLearnedVadPerformanceModeChangeCallback((mode) => {
            media.setLearnedVadPerformanceMode(mode);
            debug.setLocalLearnedVadTuning(media.getLearnedVadTuning());
            this.persistence?.saveAudioTuning({
                learnedVadPerformanceMode: mode,
                learnedVadTuning: media.getLearnedVadTuning(),
            });
        });
        debug.setLocalLearnedVadTuningChangeCallback((config) => {
            media.setLearnedVadTuning(config);
            // ON/OFFの関係など実処理で正規化した値を表示と保存にも戻す。
            debug.setLocalLearnedVadTuning(media.getLearnedVadTuning());
            this.persistence?.saveAudioTuning({ learnedVadTuning: media.getLearnedVadTuning() });
        });
        debug.setLocalLearnedVadStrictModeChangeCallback((enabled) => {
            media.setLearnedVadStrictMode(enabled);
            this.persistence?.saveAudioTuning({ learnedVadStrictMode: enabled });
        });
        debug.setLocalVadRmsThresholdChangeCallback((threshold) => {
            media.setVadThresholds({ rmsThreshold: threshold });
            const cleared = this.clearVenuePreset();
            this.persistence?.saveAudioTuning({
                ...(cleared ? { filterConfig: media.getAudioFilterConfig() } : {}),
                vadRmsThreshold: threshold,
                peakThreshold: media.getManualVadThresholds().peakThreshold,
            });
        });
    }

    /** プリセット→手動調整→方式の順で既存コールバックを通す。復元そのものは保存や会場解除を起こさない。 */
    restore(persistence: SincroAppSettingsPersistence, venueEnabled: boolean): void {
        const saved = persistence.getAudioTuning();
        const { debug, media } = this.params;
        this.restoring = true;
        try {
            if (saved.learnedVadPerformanceMode !== undefined)
                debug.applyLocalLearnedVadPerformanceMode(saved.learnedVadPerformanceMode);
            if (saved.learnedVadTuning !== undefined)
                debug.applyLocalLearnedVadTuning(saved.learnedVadTuning);
            if (saved.learnedVadStrictMode !== undefined)
                debug.applyLocalLearnedVadStrictMode(saved.learnedVadStrictMode);
            if (!venueEnabled) {
                if (saved.filterConfig !== undefined)
                    debug.applyLocalAudioFilterConfig(saved.filterConfig);
                if (saved.vadRmsThreshold !== undefined)
                    debug.applyLocalVadRmsThreshold(saved.vadRmsThreshold);
                if (saved.peakThreshold !== undefined)
                    media.setVadThresholds({ peakThreshold: saved.peakThreshold });
            }
            if (saved.vadThresholdMode !== undefined)
                debug.applyLocalVadThresholdMode(saved.vadThresholdMode);
        } finally {
            this.restoring = false;
        }
        this.persistence = persistence;
    }

    clearVenueOverrides(): void {
        this.persistence?.clearVenueAudioTuning();
    }

    private clearVenuePreset(): boolean {
        return !this.restoring && this.params.clearVenuePreset();
    }
}
