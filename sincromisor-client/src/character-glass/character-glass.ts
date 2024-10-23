import { CharacterManager } from "../ts/Character/CharacterManager";
import { SincroGlassScene } from "../ts/Scene/SincroGlassScene";
import { TalkManager } from "../ts/RTC/TalkManager";
import { DebugConsoleManager } from "../ts/UI/DebugConsoleManager";

function start() {
    const charCanvas: HTMLCanvasElement | null = document.querySelector('canvas#characterCanvas') as HTMLCanvasElement | null;
    if (!charCanvas) {
        throw 'canvas#characterCanvas is not found.';
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
