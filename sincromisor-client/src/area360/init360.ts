import { SincroInitializer } from "../ts/SincroInitializer";
import { SincroScene } from "../ts/Scene/SincroScene";
import { Sincro360Scene } from "./Sincro360Scene";
import { DialogManager } from "../ts/UI/DialogManager";

class Sincro360Initializer extends SincroInitializer {
    protected override initializeSincroScene(): SincroScene {
        return new Sincro360Scene(
            this.charCanvas, this.talkManager,
            this.dialogManager.enableVR(),
            this.dialogManager.enableCharacter(),
            this.dialogManager.enableInspector()
        );
    }

}

window.addEventListener('load', () => {
    const dialogManager = DialogManager.getManager();
    dialogManager.updateEnableCharacterGazeStatus(false);
    dialogManager.updateAutoMuteStatus();
    new Sincro360Initializer();
});
