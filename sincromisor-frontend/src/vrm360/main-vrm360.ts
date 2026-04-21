import { SincroVRM360Initializer } from "../ts/SincroVRM/SincroVRM360Initializer";
import { DialogManager } from "../ts/UI/DialogManager";

// 360 ページ専用の薄いエントリ。
// base の VRM 起動に加えて、load 前に 360 用の既定設定だけを dialog state へ反映する。
window.addEventListener('load', () => {
    const dialogManager = DialogManager.getManager();
    dialogManager.updateEnableCharacterGazeStatus(false);
    dialogManager.updateAutoMuteStatus();
    new SincroVRM360Initializer();
});
