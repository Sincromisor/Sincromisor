import type { SincroVRMRoots } from "../../app/bootstrap/sincroVrmInitializer";
import { SincroVRMInitializer } from "../../app/bootstrap/sincroVrmInitializer";

/** Reactの配置完了からページ固有の初期化を行う。失敗は呼び出し元の共通入口へ返す。 */
export function initializeSimpleVrmPage(roots: SincroVRMRoots): void {
    const talkMode = new URLSearchParams(window.location.search).get("talkMode");
    SincroVRMInitializer.bootstrap(
        roots,
        talkMode === "chat" || talkMode === "sincro" ? { talkMode } : {},
    );
}
