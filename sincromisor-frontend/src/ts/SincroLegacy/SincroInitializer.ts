import { SincroAppController } from "../App/SincroAppController";
import { CharacterManager } from "./Character/CharacterManager";
import { SincroScene } from "./Scene/SincroScene";
import { TalkManager } from "../RTC/TalkManager";
import { UserMediaManager } from "../RTC/UserMediaManager";

export class SincroInitializer {
    protected readonly talkManager: TalkManager;
    protected readonly charCanvas: HTMLCanvasElement;
    protected readonly appController: SincroAppController;
    private appUiStarted = false;

    constructor() {
        this.talkManager = TalkManager.getManager();
        this.charCanvas = this.getCharCanvas();
        this.appController = new SincroAppController();
        // legacy scene 初期化時には Inspector/VR 設定が反映される。enableTalk は現状未使用。
        this.appController.setStartupSettingsCapabilities({
            enableTalk: false,
            enableInspector: true,
            enableVR: true,
        });
        this.appController.setStartHooks({
            beforeStart: () => {
                this.writeWelcomeMessagesOnce();
            },
            afterStart: () => {
                this.startUiSideEffectsOnce();
            },
        });

        this.getUserMediaAvailabilityCheck();
        this.characterAvailabilityCheck();
        this.appController.debug.setRTCStopButtonEventListener(() => {
            this.appController.rtc.stop();
        });

        if ('obsstudio' in window) {
            this.start();
        }
    }

    private getCharCanvas(): HTMLCanvasElement {
        const charCanvas: HTMLCanvasElement | null = document.querySelector('canvas#sincroCharacterBox__canvas') as HTMLCanvasElement | null;
        if (!charCanvas) {
            throw 'canvas#sincroCharacterBox__canvas is not found.';
        }
        return charCanvas;
    }

    private getUserMediaAvailabilityCheck(): void {
        if (!UserMediaManager.hasGetUserMedia()) {
            this.appController.dialog.updateUserMediaAvailabilityStatus(false);
        }
    }

    private characterAvailabilityCheck(): void {
        CharacterManager.availabilityCheck(() => {
            this.appController.dialog.updateCharacterAvailabilityStatus(true);
        }, () => {
            this.appController.dialog.updateCharacterAvailabilityStatus(false);
        });
    }

    private start(): void {
        this.appController.start();
    }

    private writeWelcomeMessagesOnce(): void {
        if (this.appUiStarted) {
            return;
        }
        this.appController.chat.writeUnknownUserMessage("こんにちは!");
        this.appController.chat.writeSystemMessage("こんにちは～!");
        this.appController.chat.writeSystemMessage("音声は「VOICEVOX 四国めたん」でお送りします。");
    }

    private startUiSideEffectsOnce(): void {
        if (this.appUiStarted) {
            return;
        }
        if (this.appController.dialog.isCharacterEnabled()) {
            const sincroScene: SincroScene = this.initializeSincroScene();
            sincroScene.createScene();
            sincroScene.run();
        }

        this.appController.dialog.close();
        this.appUiStarted = true;
    }

    protected initializeSincroScene(): SincroScene {
        return new SincroScene(
            this.charCanvas, this.talkManager,
            this.appController.dialog.isVREnabled(),
            this.appController.dialog.isCharacterEnabled(),
            this.appController.dialog.isInspectorEnabled()
        );
    }
}
