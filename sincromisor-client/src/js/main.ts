import { SincroController } from "./SincroController";
import { DialogManager } from "./UI/DialogManager";
import { ChatMessageManager } from "./UI/ChatMessageManager";
import { CharacterManager } from "./Character/CharacterManager";
import { SincroScene } from "./SincroScene";
import { TalkManager } from "./RTC/TalkManager";

function startRTC(dialogManager: DialogManager) {
    const chatMessageManager: ChatMessageManager = ChatMessageManager.getManager();
    chatMessageManager.writeSystemMessage("こんにちは～!");
    chatMessageManager.autoScroll();

    const talkManager: TalkManager = TalkManager.getManager();
    const sincroController: SincroController = new SincroController(dialogManager, chatMessageManager, talkManager);

    if (dialogManager.enableCharacter()) {
        const charCanvas: HTMLCanvasElement | null = document.querySelector('canvas#characterCanvas');
        if (!charCanvas) {
            throw 'canvas#characterCanvas is not found.';
        }
        const sincroScene: SincroScene = new SincroScene(
            charCanvas, talkManager,
            dialogManager.enableVR(),
            dialogManager.enableCharacter(),
            dialogManager.enableInspector()
        );
        sincroScene.createScene();
        sincroScene.run();
        if (sincroScene.character) {
            sincroController.setCharacterBone(sincroScene.character?.bones.root);
        }
    }
    dialogManager.setRTCStopButtonEventListener(() => {
        sincroController.stopRTC();
    });
    dialogManager.closeDialog();
}

window.addEventListener('load', () => {
    const dialogManager: DialogManager = DialogManager.getManager();
    CharacterManager.availabilityCheck(() => {
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
