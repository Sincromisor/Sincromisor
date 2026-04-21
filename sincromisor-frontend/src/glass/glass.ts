import { SincroScene } from "../ts/SincroLegacy/Scene/SincroScene";
import { SincroGlassScene } from "../ts/SincroLegacy/Scene/SincroGlassScene";
import { SincroInitializer } from "../ts/SincroLegacy/SincroInitializer";
import { DebugConsoleManager } from "../ts/UI/DebugConsoleManager";

class SincroGlassInitializer extends SincroInitializer {
    protected override initializeSincroScene(): SincroScene {
        DebugConsoleManager.getManager().showDebugConsole();
        return new SincroGlassScene(this.charCanvas, this.talkManager,
            this.appController.dialog.isVREnabled(),
            this.appController.dialog.isCharacterEnabled(),
            this.appController.dialog.isInspectorEnabled()
        );
    }
}
window.addEventListener('load', () => {
    new SincroGlassInitializer();
});
