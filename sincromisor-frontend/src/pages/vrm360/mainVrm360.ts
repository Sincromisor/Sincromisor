import { frontendLogger } from "../../ts/logging/appLogger";
import { SincroVRM360Initializer } from "../../ts/sincroVrm/sincroVrm360Initializer";
import { DialogManager } from "../../ts/ui/dialogManager";

// 360 ページ専用の薄いエントリ。
// base の VRM 起動に加えて、load 前に 360 用の既定設定だけを dialog state へ反映する。
window.addEventListener("load", () => {
    const dialogManager = DialogManager.getManager();
    dialogManager.updateEnableCharacterGazeStatus(false);
    dialogManager.updateAutoMuteStatus();
    void SincroVRM360Initializer.bootstrap().catch((error) => {
        frontendLogger.error("Failed to bootstrap vrm360 page.", { error });
    });
});
