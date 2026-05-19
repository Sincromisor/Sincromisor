import type { SincroAppSettingsSnapshot } from "../../app/controller/sincroAppTypes";
import { updateLookingGlassRuntimeConfig } from "../sincroVrm/lookingGlass/lookingGlassRuntimeConfig";
import { CharacterBehaviorState } from "../sincroVrm/vrmCharacter/characterBehaviorState";
import type { SincroAppDialogFacade } from "./sincroAppDialogFacade";

type LookingGlassRuntimeConfigPatch = Parameters<typeof updateLookingGlassRuntimeConfig>[0];

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
    applyTextAndDeviceSettings(dialogManager, partial);
    applyAudioSettings(dialogManager, partial);
    applyCharacterSettings(dialogManager, partial);
    applyInspectorSettings(dialogManager, partial);
    applyMotionScaleSettings(dialogManager, partial);
    applyLookingGlassSettings(partial);
}

function applyTextAndDeviceSettings(
    dialogManager: SincroAppDialogFacade,
    partial: Partial<SincroAppSettingsSnapshot>,
): void {
    // Dialog 設定（UI/RTC/描画系のトグル）は DialogManager facade 経由で即時反映する。
    if (partial.talkMode !== undefined) {
        dialogManager.setTalkMode(partial.talkMode);
        // RTCのtalk_modeは接続開始時の契約なので、実行中の音声経路変更は再接続で反映する。
        // ここではキャラクターのlocal motion policyだけを即時更新する。
        CharacterBehaviorState.getManager().setTalkMode(partial.talkMode);
    }
    if (partial.titleText !== undefined) {
        dialogManager.setTitleText(partial.titleText);
    }
    if ("audioInputDeviceId" in partial) {
        dialogManager.setAudioInputDeviceId(partial.audioInputDeviceId);
    }
    if ("videoInputDeviceId" in partial) {
        dialogManager.setVideoInputDeviceId(partial.videoInputDeviceId);
    }
}

function applyAudioSettings(
    dialogManager: SincroAppDialogFacade,
    partial: Partial<SincroAppSettingsSnapshot>,
): void {
    if (partial.enableAutoGainControl !== undefined) {
        dialogManager.setEnableAutoGainControl(partial.enableAutoGainControl);
    }
    if (partial.enableNoiseSuppression !== undefined) {
        dialogManager.setEnableNoiseSuppression(partial.enableNoiseSuppression);
    }
    if (partial.enableEchoCancellation !== undefined) {
        dialogManager.setEnableEchoCancellation(partial.enableEchoCancellation);
    }
    if (partial.enableVadGate !== undefined) {
        dialogManager.setEnableVadGate(partial.enableVadGate);
    }
    if (partial.enableVenueNoiseMode !== undefined) {
        dialogManager.setEnableVenueNoiseMode(partial.enableVenueNoiseMode);
    }
}

function applyCharacterSettings(
    dialogManager: SincroAppDialogFacade,
    partial: Partial<SincroAppSettingsSnapshot>,
): void {
    if (partial.enableCharacter !== undefined) {
        dialogManager.setEnableCharacter(partial.enableCharacter);
    }
    if (partial.enableTalk !== undefined) {
        dialogManager.setEnableTalk(partial.enableTalk);
    }
    if (partial.enableCharacterGaze !== undefined) {
        dialogManager.setEnableCharacterGaze(partial.enableCharacterGaze);
    }
    if (partial.enableSincroPoseTracking !== undefined) {
        dialogManager.setEnableSincroPoseTracking(partial.enableSincroPoseTracking);
    }
    if (partial.forceSincroPoseTracking !== undefined) {
        dialogManager.setForceSincroPoseTracking(partial.forceSincroPoseTracking);
    }
    if (partial.enableAutoMute !== undefined) {
        dialogManager.setEnableAutoMute(partial.enableAutoMute);
    }
}

function applyInspectorSettings(
    dialogManager: SincroAppDialogFacade,
    partial: Partial<SincroAppSettingsSnapshot>,
): void {
    if (partial.enableInspector !== undefined) {
        dialogManager.setEnableInspector(partial.enableInspector);
    }
    if (partial.enableVR !== undefined) {
        dialogManager.setEnableVR(partial.enableVR);
    }
}

function applyMotionScaleSettings(
    dialogManager: SincroAppDialogFacade,
    partial: Partial<SincroAppSettingsSnapshot>,
): void {
    if (partial.characterMotionScale !== undefined) {
        dialogManager.setCharacterMotionScale(
            clampAndRoundToStep(partial.characterMotionScale, 0, 1.2, 0.05),
        );
    }
    if (partial.sincroPoseRetargetScale !== undefined) {
        dialogManager.setSincroPoseRetargetScale(
            clampAndRoundToStep(partial.sincroPoseRetargetScale, 0, 1.2, 0.05),
        );
    }
    if (partial.characterEyeTrackingScale !== undefined) {
        dialogManager.setCharacterEyeTrackingScale(
            clampAndRoundToStep(partial.characterEyeTrackingScale, 0, 1.2, 0.05),
        );
    }
}

function applyLookingGlassSettings(partial: Partial<SincroAppSettingsSnapshot>): void {
    // Looking Glass 設定は runtime config に正規化して反映する。
    // polyfill への反映タイミング判定は別の tracker/status ロジックで扱う。
    const nextLookingGlassConfig = buildLookingGlassRuntimeConfig(partial);
    if (Object.keys(nextLookingGlassConfig).length > 0) {
        updateLookingGlassRuntimeConfig(nextLookingGlassConfig);
    }
}

function buildLookingGlassRuntimeConfig(
    partial: Partial<SincroAppSettingsSnapshot>,
): LookingGlassRuntimeConfigPatch {
    const nextLookingGlassConfig: LookingGlassRuntimeConfigPatch = {};
    if (partial.lgTileHeight !== undefined) {
        nextLookingGlassConfig.tileHeight = clampAndRoundToStep(partial.lgTileHeight, 256, 2048, 1);
    }
    if (partial.lgNumViews !== undefined) {
        nextLookingGlassConfig.numViews = clampAndRoundToStep(partial.lgNumViews, 8, 64, 1);
    }
    if (partial.lgTargetY !== undefined) {
        nextLookingGlassConfig.targetY = clampAndRoundToStep(partial.lgTargetY, -2, 4, 0.05);
    }
    if (partial.lgTargetZ !== undefined) {
        nextLookingGlassConfig.targetZ = clampAndRoundToStep(partial.lgTargetZ, -1, 2, 0.05);
    }
    if (partial.lgTargetDiam !== undefined) {
        nextLookingGlassConfig.targetDiam = clampAndRoundToStep(partial.lgTargetDiam, 0.1, 3, 0.05);
    }
    if (partial.lgDepthiness !== undefined) {
        nextLookingGlassConfig.depthiness = clampAndRoundToStep(partial.lgDepthiness, 0, 4, 0.05);
    }
    if (partial.lgFovyDeg !== undefined) {
        nextLookingGlassConfig.fovyDeg = clampAndRoundToStep(partial.lgFovyDeg, 5, 80, 0.5);
    }
    return nextLookingGlassConfig;
}
