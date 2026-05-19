import { SincroVRM360Initializer } from "../../character/vrm360/sincroVrm360Initializer";
import { frontendLogger } from "../../shared/logging/appLogger";

// 360 ページ専用の薄いエントリ。
// 360 用の既定設定は initializer 内の AppController 設定へ閉じ、entry は起動だけを担当する。
window.addEventListener("load", () => {
    void SincroVRM360Initializer.bootstrap().catch((error) => {
        frontendLogger.error("Failed to bootstrap vrm360 page.", { error });
    });
});
