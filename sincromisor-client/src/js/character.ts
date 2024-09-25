import { CharacterManager } from "./Character/CharacterManager";
import { SincroScene } from "./SincroScene";
import { TalkManager } from "./RTC/TalkManager";

function start() {
    const charCanvas: HTMLCanvasElement | null = document.querySelector('canvas#characterCanvas');
    if (!charCanvas) {
        throw 'canvas#characterCanvas is not found.';
    }
    const talkManager: TalkManager = TalkManager.getManager();

    const sincroScene: SincroScene = new SincroScene(
        charCanvas, talkManager,
        false,
        true,
        true
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
