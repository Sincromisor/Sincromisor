import { getLookingGlassRuntimeConfig } from "../../character/lookingGlass/lookingGlassRuntimeConfig";
import type { SincroAppSettingsSnapshot } from "../controller/sincroAppTypes";
import type { SincroAppSettingsAccess } from "./sincroAppSettingsModel";

/** 通常設定とLooking Glass設定を合成し、起動前後のUIで共有する値を返す。 */
export function buildSincroAppSettingsSnapshot(
    settingsModel: SincroAppSettingsAccess,
): SincroAppSettingsSnapshot {
    const lg = getLookingGlassRuntimeConfig();
    return {
        ...settingsModel.getSettings(),
        lgTileHeight: lg.tileHeight,
        lgNumViews: lg.numViews,
        lgTargetY: lg.targetY,
        lgTargetZ: lg.targetZ,
        lgTargetDiam: lg.targetDiam,
        lgDepthiness: lg.depthiness,
        lgFovyDeg: lg.fovyDeg,
    };
}
