import { SincroScene } from "./Scene/SincroScene";
import { SincroGlassScene } from "./Scene/SincroGlassScene";
import { SincroInitializer } from "./SincroInitializer";
import { DebugConsoleManager } from "./UI/DebugConsoleManager";

class SincroGlassInitializer extends SincroInitializer {
    override initializeSincroScene(): SincroScene {
        DebugConsoleManager.getManager().showDebugConsole();
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
