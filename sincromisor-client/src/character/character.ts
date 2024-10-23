import { CharacterManager } from "../ts/Character/CharacterManager";
import { SincroScene } from "../ts/Scene/SincroScene";
import { TalkManager } from "../ts/RTC/TalkManager";

function start() {
    const charCanvas: HTMLCanvasElement | null = document.querySelector('canvas#characterCanvas') as HTMLCanvasElement | null;
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
