import { SincroVRMInitializer } from "./SincroVRMInitializer";
import { VRMScene } from "./VRMScene/VRMScene";
import { VRM360Scene } from "./VRM360/VRM360Scene";

export class SincroVRM360Initializer extends SincroVRMInitializer {
    protected override initializeSincroScene(): VRMScene {
        return new VRM360Scene(this.charCanvas);
        /*
            this.charCanvas, this.talkManager,
            this.dialogManager.enableVR(),
            this.dialogManager.enableCharacter(),
            this.dialogManager.enableInspector()
        */
    }
}
