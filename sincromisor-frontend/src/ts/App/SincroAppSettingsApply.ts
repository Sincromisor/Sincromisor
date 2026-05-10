import { updateLookingGlassRuntimeConfig } from "../SincroVRM/LookingGlass/LookingGlassRuntimeConfig";
import type { SincroAppDialogFacade } from "./SincroAppDialogFacade";
import type { SincroAppSettingsSnapshot } from "./SincroAppTypes";

// UI入力値の揺れを吸収し、runtime config を安全な範囲に正規化する。
export function clampAndRoundToStep(value: number, min: number, max: number, step: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    const clamped = Math.min(max, Math.max(min, value));
    const rounded = Math.round(clamped / step) * step;
    // 浮動小数点誤差で 0.30000000004 のような値が出るのを防ぐ。
    return Number(rounded.toFixed(6));
}

// AppController.applySettings(...) の実処理を分離し、
// Dialog 設定の反映と Looking Glass runtime config 更新をまとめて扱う。
export function applySincroAppSettingsPartial(
    dialogManager: SincroAppDialogFacade,
    partial: Partial<SincroAppSettingsSnapshot>,
): void {
    // Dialog 設定（UI/RTC/描画系のトグル）は DialogManager facade 経由で即時反映する。
    if (partial.talkMode != null) {
        dialogManager.setTalkMode(partial.talkMode);
    }
    if (partial.titleText != null) {
        dialogManager.setTitleText(partial.titleText);
    }
    if (partial.audioInputDeviceId !== undefined) {
        dialogManager.setAudioInputDeviceId(partial.audioInputDeviceId);
    }
    if (partial.videoInputDeviceId !== undefined) {
        dialogManager.setVideoInputDeviceId(partial.videoInputDeviceId);
    }
    if (partial.enableAutoGainControl != null) {
        dialogManager.setEnableAutoGainControl(partial.enableAutoGainControl);
    }
    if (partial.enableNoiseSuppression != null) {
        dialogManager.setEnableNoiseSuppression(partial.enableNoiseSuppression);
    }
    if (partial.enableEchoCancellation != null) {
        dialogManager.setEnableEchoCancellation(partial.enableEchoCancellation);
    }
    if (partial.enableVadGate != null) {
        dialogManager.setEnableVadGate(partial.enableVadGate);
    }
    if (partial.enableVenueNoiseMode != null) {
        dialogManager.setEnableVenueNoiseMode(partial.enableVenueNoiseMode);
    }
    if (partial.enableCharacter != null) {
        dialogManager.setEnableCharacter(partial.enableCharacter);
    }
    if (partial.enableTalk != null) {
        dialogManager.setEnableTalk(partial.enableTalk);
    }
    if (partial.enableCharacterGaze != null) {
        dialogManager.setEnableCharacterGaze(partial.enableCharacterGaze);
    }
    if (partial.enableAutoMute != null) {
        dialogManager.setEnableAutoMute(partial.enableAutoMute);
    }
    if (partial.enableInspector != null) {
        dialogManager.setEnableInspector(partial.enableInspector);
    }
    if (partial.enableVR != null) {
        dialogManager.setEnableVR(partial.enableVR);
    }
    if (partial.characterMotionScale != null) {
        dialogManager.setCharacterMotionScale(clampAndRoundToStep(partial.characterMotionScale, 0, 1.2, 0.05));
    }
    if (partial.characterEyeTrackingScale != null) {
        dialogManager.setCharacterEyeTrackingScale(clampAndRoundToStep(partial.characterEyeTrackingScale, 0, 1.2, 0.05));
    }

    // Looking Glass 設定は runtime config に正規化して反映する。
    // polyfill への反映タイミング判定は別の tracker/status ロジックで扱う。
    const nextLookingGlassConfig: Parameters<typeof updateLookingGlassRuntimeConfig>[0] = {};
    if (partial.lgTileHeight != null) {
        nextLookingGlassConfig.tileHeight = clampAndRoundToStep(partial.lgTileHeight, 256, 2048, 1);
    }
    if (partial.lgNumViews != null) {
        nextLookingGlassConfig.numViews = clampAndRoundToStep(partial.lgNumViews, 8, 64, 1);
    }
    if (partial.lgTargetY != null) {
        nextLookingGlassConfig.targetY = clampAndRoundToStep(partial.lgTargetY, -2, 4, 0.05);
    }
    if (partial.lgTargetZ != null) {
        nextLookingGlassConfig.targetZ = clampAndRoundToStep(partial.lgTargetZ, -1, 2, 0.05);
    }
    if (partial.lgTargetDiam != null) {
        nextLookingGlassConfig.targetDiam = clampAndRoundToStep(partial.lgTargetDiam, 0.1, 3, 0.05);
    }
    if (partial.lgDepthiness != null) {
        nextLookingGlassConfig.depthiness = clampAndRoundToStep(partial.lgDepthiness, 0, 4, 0.05);
    }
    if (partial.lgFovyDeg != null) {
        nextLookingGlassConfig.fovyDeg = clampAndRoundToStep(partial.lgFovyDeg, 5, 80, 0.5);
    }
    if (Object.keys(nextLookingGlassConfig).length > 0) {
        updateLookingGlassRuntimeConfig(nextLookingGlassConfig);
    }
}
