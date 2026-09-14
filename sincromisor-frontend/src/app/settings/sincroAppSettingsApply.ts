import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import { updateLookingGlassRuntimeConfig } from "../../character/lookingGlass/lookingGlassRuntimeConfig";
import type { SincroAppSettingsSnapshot } from "../controller/sincroAppTypes";
import {
    type SincroAppNumericSettingKey,
    sincroAppNumericSettingConstraints,
} from "./sincroAppSettingsDefaults";
import type { SincroAppSettingsAccess } from "./sincroAppSettingsModel";

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

/** 利用者入力だけ数値を正規化し、検証済み復元値は精度を保って会話・表示処理へ一括反映する。 */
export function applySincroAppSettingsPartial(
    settingsModel: SincroAppSettingsAccess,
    partial: Partial<SincroAppSettingsSnapshot>,
    source: "user" | "restore" = "user",
): void {
    const normalized = { ...partial };
    for (const key of [
        "lgTileHeight",
        "lgNumViews",
        "lgTargetY",
        "lgTargetZ",
        "lgTargetDiam",
        "lgDepthiness",
        "lgFovyDeg",
    ] as const) {
        const value = partial[key];
        if (value !== undefined && source === "user") {
            normalized[key] = clampSincroAppNumericSetting(key, value);
        }
    }
    settingsModel.updateSettings(normalized, source);
    if (partial.talkMode !== undefined) {
        // RTCの会話モードは再接続で反映する。ここでは適用後の値をキャラクター動作へ同期する。
        CharacterBehaviorState.getManager().setTalkMode(settingsModel.getSetting("talkMode"));
    }
    applyLookingGlassSettings(normalized);
}

function applyLookingGlassSettings(partial: Partial<SincroAppSettingsSnapshot>): void {
    // 入力正規化または保存検証を終えたLooking Glass設定を実行時設定へ反映する。
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
    const keys = {
        lgTileHeight: "tileHeight",
        lgNumViews: "numViews",
        lgTargetY: "targetY",
        lgTargetZ: "targetZ",
        lgTargetDiam: "targetDiam",
        lgDepthiness: "depthiness",
        lgFovyDeg: "fovyDeg",
    } as const;
    for (const [key, runtimeKey] of Object.entries(keys)) {
        const value = Object.entries(partial).find(([name]) => name === key)?.[1];
        if (typeof value === "number") nextLookingGlassConfig[runtimeKey] = value;
    }
    return nextLookingGlassConfig;
}

function clampSincroAppNumericSetting(key: SincroAppNumericSettingKey, value: number): number {
    const constraints = sincroAppNumericSettingConstraints[key];
    return clampAndRoundToStep(value, constraints.min, constraints.max, constraints.step);
}
