import { CharacterManager } from "./Character/CharacterManager";
import { SincroGlassScene } from "./Scene/SincroGlassScene";
import { TalkManager } from "./RTC/TalkManager";
import { DebugConsoleManager } from "./UI/DebugConsoleManager";

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
