import { SincroController } from "./SincroController";
import { DialogManager } from "./Tools/DialogManager";
import { ChatMessageManager } from "./Tools/ChatMessageManager";
import { CharacterLoader } from "./Character/CharacterLoader";
import { SincroScene } from "./SincroScene";
import { TalkManager } from "./RTC/TalkManager";

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
        if (sincroScene.character){
            sincroController.setCharacterBone(sincroScene.character?.bones.root);
        }
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
