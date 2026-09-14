import { SincroVRM360Initializer } from "../../app/bootstrap/sincroVrm360Initializer";
import type { SincroVRMRoots } from "../../app/bootstrap/sincroVrmInitializer";

/** Reactの配置完了からページ固有の初期化を行う。失敗は呼び出し元の共通入口へ返す。 */
export function initializeVrm360Page(roots: SincroVRMRoots): void {
    SincroVRM360Initializer.bootstrap(roots);
}
