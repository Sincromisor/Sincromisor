import { SincroController } from "./SincroController.js";
import { DialogManager } from "./Tools/DialogManager.js";
import { ChatMessageManager } from "./Tools/ChatMessageManager.js";
import { CharacterLoader } from "./Character/CharacterLoader.js";
import { SincroScene } from "./SincroScene.js";
import { TalkManager } from "./RTC/TalkManager.js";

function startRTC(dialogManager: DialogManager) {
    const chatBox: HTMLDivElement | null = document.querySelector('div#obsMessageBox');
    if (!chatBox) {
        throw 'div#obsMessageBox is not found.';
    }
    const chatMessageManager: ChatMessageManager = new ChatMessageManager(chatBox);
    chatMessageManager.writeSystemMessage("こんにちは～!");
    chatMessageManager.autoScroll();

    const charCanvas: HTMLCanvasElement | null = document.querySelector('canvas#gloriaCanvas');
    if (!charCanvas) {
        throw 'canvas#gloriaCanvas is not found.';
    }
    const talkManager: TalkManager = new TalkManager();
    const sincroController: SincroController = new SincroController(dialogManager, chatMessageManager, talkManager);

    if (dialogManager.enableCharacter()) {
        const sincroScene: SincroScene = new SincroScene(
            charCanvas, talkManager,
            dialogManager.enableVR(),
            dialogManager.enableCharacter(),
            dialogManager.enableInspector()
        );
        sincroScene.createScene();
        sincroScene.run();
    }
    dialogManager.setRTCStopButtonEventListener(() => {
        sincroController.stopRTC();
    });
    dialogManager.closeDialog();
}

window.addEventListener('load', () => {
    const dialogManager: DialogManager = new DialogManager();
    CharacterLoader.availabilityCheck(() => {
        dialogManager.updateCharacterStatus(true);
    }, () => {
        dialogManager.updateCharacterStatus(false);
    });
    dialogManager.setRTCStartButtonEventListener(() => {
        startRTC(dialogManager);
    });
    if ('obsstudio' in window) {
        startRTC(dialogManager);
    }
});
