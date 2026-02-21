import { SincroController } from "../SincroController";
import { DialogManager } from "../UI/DialogManager";
import { ChatMessageManager } from "../UI/ChatMessageManager";
import { TalkManager } from "../RTC/TalkManager";
import { UserMediaManager } from "../RTC/UserMediaManager";
import { VRMScene } from './VRMScene/VRMScene';
import { DebugConsoleManager } from "../UI/DebugConsoleManager";


export class SincroVRMInitializer {
    protected readonly dialogManager: DialogManager;
    protected readonly chatMessageManager: ChatMessageManager;
    protected readonly talkManager: TalkManager;
    protected readonly charCanvas: HTMLDivElement;
    protected readonly controlTarget: HTMLElement;
    // 自前生成したblob URLのみ解放対象として保持する。
    private generatedSystemIconURL: string | null = null;

    constructor() {
        // Register debug console UI events at startup so touch/click toggles work before RTC start.
        DebugConsoleManager.getManager();
        this.dialogManager = DialogManager.getManager();
        this.chatMessageManager = ChatMessageManager.getManager();
        this.talkManager = TalkManager.getManager();
        this.charCanvas = this.getCharCanvasRoot();
        this.controlTarget = document.querySelector('div#sincroBody')!;

        this.getUserMediaAvailabilityCheck();
        this.dialogManager.updateCharacterStatus(true);
        // VRMロード完了前でも、前回キャッシュ済みのアイコンを即座に表示する。
        this.loadCachedSystemIcon();
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

    private loadCachedSystemIcon(): void {
        this.dialogManager.loadVrmThumbnailBlob().then((blob: Blob | null) => {
            if (!blob) {
                return;
            }
            const iconURL = URL.createObjectURL(blob);
            this.applySystemIcon(iconURL);
        }).catch((error) => {
            console.error('Failed to load cached VRM thumbnail.', error);
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
        const vrmScene: VRMScene = new VRMScene(this.charCanvas, this.controlTarget, DialogManager.vrmUrl, false, (thumbnailImage) => {
            this.updateSystemIconFromThumbnail(thumbnailImage);
        });
        vrmScene.start();
        return vrmScene;

        /*
            this.charCanvas, this.talkManager,
            this.dialogManager.enableVR(),
            this.dialogManager.enableCharacter(),
            this.dialogManager.enableInspector()
        */
    }

    protected updateSystemIconFromThumbnail(thumbnailImage: HTMLImageElement | null): void {
        if (!thumbnailImage) {
            return;
        }

        const canvas = document.createElement('canvas');
        const width = thumbnailImage.naturalWidth || thumbnailImage.width;
        const height = thumbnailImage.naturalHeight || thumbnailImage.height;
        if (width === 0 || height === 0) {
            return;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return;
        }

        try {
            ctx.drawImage(thumbnailImage, 0, 0, width, height);
        } catch (error) {
            // cross-origin等でdrawImageが失敗するケースはキャッシュ保存を諦めて表示だけ更新する
            console.warn('Failed to draw VRM thumbnail image.', error);
            this.applySystemIcon(thumbnailImage.src);
            return;
        }

        canvas.toBlob((blob: Blob | null) => {
            if (!blob) {
                // Blob化できない環境ではキャッシュなしでそのまま表示する。
                this.applySystemIcon(thumbnailImage.src);
                return;
            }
            this.dialogManager.saveVrmThumbnailBlob(blob).catch((error) => {
                console.error('Failed to cache VRM thumbnail.', error);
            });
            const iconURL = URL.createObjectURL(blob);
            this.applySystemIcon(iconURL);
        }, 'image/png');
    }

    protected applySystemIcon(iconURL: string): void {
        // 差し替えを繰り返してもblob URLがリークしないように先に解放する。
        this.revokeGeneratedSystemIconURL();
        if (iconURL.startsWith('blob:')) {
            this.generatedSystemIconURL = iconURL;
        }

        // ヘッダー左上は透過背景前提の見た目崩れがあるため更新対象外にし、
        // チャット内systemアイコンだけを更新する。
        this.chatMessageManager.setSystemIcon(iconURL);
    }

    private revokeGeneratedSystemIconURL(): void {
        if (!this.generatedSystemIconURL) {
            return;
        }
        URL.revokeObjectURL(this.generatedSystemIconURL);
        this.generatedSystemIconURL = null;
    }
}
