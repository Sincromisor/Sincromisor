import { SincroVRMInitializer } from "./SincroVRMInitializer";
import { VRM360Scene } from "./VRM360/VRM360Scene";
import { DialogManager } from "../UI/DialogManager";

export class SincroVRM360Initializer extends SincroVRMInitializer {
    protected override initializeSincroScene(): VRM360Scene {
        const vrmScene: VRM360Scene =  new VRM360Scene(this.charCanvas, this.controlTarget, DialogManager.vrmUrl, true);
        vrmScene.start();
        return vrmScene;
        /*
            this.charCanvas, this.talkManager,
            this.dialogManager.enableVR(),
            this.dialogManager.enableCharacter(),
            this.dialogManager.enableInspector()
        */
    }
}
