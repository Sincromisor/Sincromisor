import { SincroAppController } from "../App/SincroAppController";
import { CharacterManager } from "./Character/CharacterManager";
import { SincroScene } from "./Scene/SincroScene";
import { TalkManager } from "../RTC/TalkManager";
import { UserMediaManager } from "../RTC/UserMediaManager";

// Babylon legacy ページの initializer。
// UI導線は AppController bridge を使って modern 側と揃えつつ、scene 初期化だけ legacy 実装を使う。
export class SincroInitializer {
    protected readonly talkManager: TalkManager;
    protected readonly charCanvas: HTMLCanvasElement;
    protected readonly appController: SincroAppController;
    private appUiStarted = false;

    constructor() {
        this.talkManager = TalkManager.getManager();
        this.charCanvas = this.getCharCanvas();
        this.appController = new SincroAppController();
        // legacy scene では Inspector/VR の startup toggles が scene 初期化に反映される。
        // legacy scene 初期化時には Inspector/VR 設定が反映される。enableTalk は現状未使用。
        this.appController.setStartupSettingsCapabilities({
            enableTalk: false,
            enableInspector: true,
            enableVR: true,
        });
        this.appController.setStartHooks({
            beforeStart: () => {
                // 挨拶メッセージは base UX を維持するため start hook で注入する。
                this.writeWelcomeMessagesOnce();
            },
            afterStart: () => {
                // scene 起動 / dialog close は RTC 開始後の副作用としてまとめる。
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
        // legacy では CharacterManager の availability 判定を dialog state に反映して開始前 UX を保つ。
        CharacterManager.availabilityCheck(() => {
            this.appController.dialog.updateCharacterAvailabilityStatus(true);
        }, () => {
            this.appController.dialog.updateCharacterAvailabilityStatus(false);
        });
    }

    private start(): void {
        // AppController 側の lifecycle/state 管理を通して開始する。
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
        // startup toggles の Inspector/VR は legacy scene constructor に渡して反映する。
        return new SincroScene(
            this.charCanvas, this.talkManager,
            this.appController.dialog.isVREnabled(),
            this.appController.dialog.isCharacterEnabled(),
            this.appController.dialog.isInspectorEnabled()
        );
    }
}
