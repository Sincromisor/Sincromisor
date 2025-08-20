import { SincroVRM360Initializer } from "../ts/SincroVRM/SincroVRM360Initializer";
import { DialogManager } from "../ts/UI/DialogManager";

window.addEventListener('load', () => {
    const dialogManager = DialogManager.getManager();
    dialogManager.updateEnableCharacterGazeStatus(false);
    dialogManager.updateAutoMuteStatus();
    new SincroVRM360Initializer();
});
