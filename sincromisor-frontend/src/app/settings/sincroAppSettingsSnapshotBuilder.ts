import { getLookingGlassRuntimeConfig } from "../../character/lookingGlass/lookingGlassRuntimeConfig";
import type { SincroAppDialogFacade } from "../bridges/sincroAppDialogFacade";
import type { SincroAppSettingsSnapshot } from "../controller/sincroAppTypes";

/** ダイアログ設定とLooking Glass設定を合成し、起動前後のUIで共有する値を返す。 */
export function buildSincroAppSettingsSnapshot(
    dialogManager: SincroAppDialogFacade,
): SincroAppSettingsSnapshot {
    const lg = getLookingGlassRuntimeConfig();
    return {
        ...dialogManager.getSettings(),
        lgTileHeight: lg.tileHeight,
        lgNumViews: lg.numViews,
        lgTargetY: lg.targetY,
        lgTargetZ: lg.targetZ,
        lgTargetDiam: lg.targetDiam,
        lgDepthiness: lg.depthiness,
        lgFovyDeg: lg.fovyDeg,
    };
}
