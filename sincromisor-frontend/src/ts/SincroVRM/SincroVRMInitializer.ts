import { SincroController } from "../SincroController";
import { DialogManager } from "../UI/DialogManager";
import { ChatMessageManager } from "../UI/ChatMessageManager";
import { TalkManager } from "../RTC/TalkManager";
import { UserMediaManager } from "../RTC/UserMediaManager";
import { VRMScene } from './VRMScene/VRMScene';


export class SincroVRMInitializer {
    protected readonly dialogManager: DialogManager;
    protected readonly chatMessageManager: ChatMessageManager;
    protected readonly talkManager: TalkManager;
    protected readonly charCanvas: HTMLDivElement;
    protected readonly controlTarget: HTMLElement;

    constructor() {
        this.dialogManager = DialogManager.getManager();
        this.chatMessageManager = ChatMessageManager.getManager();
        this.talkManager = TalkManager.getManager();
        this.charCanvas = this.getCharCanvasRoot();
        this.controlTarget = document.querySelector('div#sincroBody')!;

        this.getUserMediaAvailabilityCheck();
        this.dialogManager.updateCharacterStatus(true);
        this.setStartButtonEvent();

        if ('obsstudio' in window) {
            this.start();
        }
    }

    private getCharCanvasRoot(): HTMLDivElement {
        const charCanvas: HTMLDivElement | null = document.querySelector('div#sincroCharacterBox');
        if (!charCanvas) {
            throw 'canvas#sincroCharacterBox__canvas is not found.';
        }
        return charCanvas;
    }

    private getUserMediaAvailabilityCheck(): void {
        if (!UserMediaManager.hasGetUserMedia()) {
            this.dialogManager.updateUserMediaAvailabilityStatus(false);
        }
    }

    private setStartButtonEvent(): void {
        this.dialogManager.setRTCStartButtonEventListener(() => {
            this.start();
        });
    }

    private start(): void {
        this.chatMessageManager.writeUnknownUserMessage("こんにちは!");
        this.chatMessageManager.writeSystemMessage("こんにちは～!")
        this.chatMessageManager.writeSystemMessage("音声は「VOICEVOX 四国めたん」でお送りします。");

        const sincroController: SincroController = new SincroController();
        this.dialogManager.setRTCStopButtonEventListener(() => {
            sincroController.stopRTC();
        });

        if (this.dialogManager.enableCharacter()) {
            this.initializeSincroScene();
        }

        this.dialogManager.closeDialog();
    }

    protected initializeSincroScene(): VRMScene {
        const vrmScene: VRMScene = new VRMScene(this.charCanvas, this.controlTarget, DialogManager.vrmUrl);
        vrmScene.start();
        return vrmScene;

        /*
            this.charCanvas, this.talkManager,
            this.dialogManager.enableVR(),
            this.dialogManager.enableCharacter(),
            this.dialogManager.enableInspector()
        */
    }
}
