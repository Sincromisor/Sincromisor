import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import { updateLookingGlassRuntimeConfig } from "../../character/lookingGlass/lookingGlassRuntimeConfig";
import type { SincroAppDialogFacade } from "../bridges/sincroAppDialogFacade";
import type { SincroAppSettingsSnapshot } from "../controller/sincroAppTypes";
import {
    type SincroAppNumericSettingKey,
    sincroAppNumericSettingConstraints,
} from "./sincroAppSettingsDefaults";

type LookingGlassRuntimeConfigPatch = Parameters<typeof updateLookingGlassRuntimeConfig>[0];

/** UIの数値を指定範囲と刻みに正規化する。非有限値は下限へ戻す。 */
export function clampAndRoundToStep(value: number, min: number, max: number, step: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    const clamped = Math.min(max, Math.max(min, value));
    const rounded = Math.round(clamped / step) * step;
    // 浮動小数点誤差で 0.30000000004 のような値が出るのを防ぐ。
    return Number(rounded.toFixed(6));
}

/** UI入力の数値を正規化してダイアログへ一括反映し、会話モードとLooking Glass設定を同期する。 */
export function applySincroAppSettingsPartial(
    dialogManager: SincroAppDialogFacade,
    partial: Partial<SincroAppSettingsSnapshot>,
): void {
    const normalized = { ...partial };
    for (const key of [
        "characterMotionScale",
        "sincroPoseRetargetScale",
        "characterEyeTrackingScale",
    ] as const) {
        const value = partial[key];
        if (value !== undefined) {
            normalized[key] = clampSincroAppNumericSetting(key, value);
        }
    }
    dialogManager.updateSettings(normalized);
    if (partial.talkMode !== undefined) {
        // RTCの会話モードは再接続で反映する。ここでは適用後の値をキャラクター動作へ同期する。
        CharacterBehaviorState.getManager().setTalkMode(dialogManager.getSetting("talkMode"));
    }
    applyLookingGlassSettings(partial);
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
        nextLookingGlassConfig.tileHeight = clampSincroAppNumericSetting(
            "lgTileHeight",
            partial.lgTileHeight,
        );
    }
    if (partial.lgNumViews !== undefined) {
        nextLookingGlassConfig.numViews = clampSincroAppNumericSetting(
            "lgNumViews",
            partial.lgNumViews,
        );
    }
    if (partial.lgTargetY !== undefined) {
        nextLookingGlassConfig.targetY = clampSincroAppNumericSetting(
            "lgTargetY",
            partial.lgTargetY,
        );
    }
    if (partial.lgTargetZ !== undefined) {
        nextLookingGlassConfig.targetZ = clampSincroAppNumericSetting(
            "lgTargetZ",
            partial.lgTargetZ,
        );
    }
    if (partial.lgTargetDiam !== undefined) {
        nextLookingGlassConfig.targetDiam = clampSincroAppNumericSetting(
            "lgTargetDiam",
            partial.lgTargetDiam,
        );
    }
    if (partial.lgDepthiness !== undefined) {
        nextLookingGlassConfig.depthiness = clampSincroAppNumericSetting(
            "lgDepthiness",
            partial.lgDepthiness,
        );
    }
    if (partial.lgFovyDeg !== undefined) {
        nextLookingGlassConfig.fovyDeg = clampSincroAppNumericSetting(
            "lgFovyDeg",
            partial.lgFovyDeg,
        );
    }
    return nextLookingGlassConfig;
}

function clampSincroAppNumericSetting(key: SincroAppNumericSettingKey, value: number): number {
    const constraints = sincroAppNumericSettingConstraints[key];
    return clampAndRoundToStep(value, constraints.min, constraints.max, constraints.step);
}
