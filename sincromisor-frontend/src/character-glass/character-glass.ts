import { CharacterManager } from "../ts/SincroLegacy/Character/CharacterManager";
import { SincroGlassScene } from "../ts/SincroLegacy/Scene/SincroGlassScene";
import { TalkManager } from "../ts/RTC/TalkManager";
import { DebugConsoleManager } from "../ts/UI/DebugConsoleManager";

function start() {
    const charCanvas: HTMLCanvasElement | null = document.querySelector('canvas#sincroCharacterBox__canvas') as HTMLCanvasElement | null;
    if (!charCanvas) {
        throw 'canvas#sincroCharacterBox__canvas is not found.';
    }
    const talkManager: TalkManager = TalkManager.getManager();
    DebugConsoleManager.getManager().showDebugConsole();
    const sincroScene: SincroGlassScene = new SincroGlassScene(
        charCanvas, talkManager,
        false,
        true,
        false
    );
    sincroScene.createScene();
    sincroScene.run();
}

window.addEventListener('load', () => {
    CharacterManager.availabilityCheck(() => {
        start();
    }, () => {
        console.error('Character is not available.');
    });
});
