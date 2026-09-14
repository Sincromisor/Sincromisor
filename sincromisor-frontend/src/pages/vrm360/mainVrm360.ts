import type { SincroVRMRoots } from "../../character/scene/sincroVrmInitializer";
import { SincroVRM360Initializer } from "../../character/vrm360/sincroVrm360Initializer";

/** Reactの配置完了からページ固有の初期化を行う。失敗は呼び出し元の共通入口へ返す。 */
export function initializeVrm360Page(roots: SincroVRMRoots): void {
    SincroVRM360Initializer.bootstrap(roots);
}
