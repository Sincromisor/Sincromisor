import { SincroLookingGlassVRMInitializer } from "../../character/lookingGlass/sincroLookingGlassVrmInitializer";

import type { SincroVRMRoots } from "../../character/scene/sincroVrmInitializer";

/** Reactの配置完了からページ固有の初期化を行う。失敗は呼び出し元の共通入口へ返す。 */
export function initializeLookingGlassVrmPage(roots: SincroVRMRoots): void {
    SincroLookingGlassVRMInitializer.bootstrap(roots);
}
