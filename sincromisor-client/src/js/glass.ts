import { SincroScene } from "./Scene/SincroScene";
import { SincroGlassScene } from "./Scene/SincroGlassScene";
import { SincroInitializer } from "./SincroInitializer";

class SincroGlassInitializer extends SincroInitializer {
    initializeSincroController(): SincroScene {
        return new SincroGlassScene(this.charCanvas, this.talkManager,
            this.dialogManager.enableVR(),
            this.dialogManager.enableCharacter(),
            this.dialogManager.enableInspector()
        );
    }
}
window.addEventListener('load', () => {
    new SincroGlassInitializer();
});
