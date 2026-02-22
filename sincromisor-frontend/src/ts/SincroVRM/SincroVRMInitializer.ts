import { SincroAppController } from "../App/SincroAppController";
import { UserMediaManager } from "../RTC/UserMediaManager";
import { VRMScene } from './VRMScene/VRMScene';


export class SincroVRMInitializer {
    protected readonly charCanvas: HTMLDivElement;
    protected readonly controlTarget: HTMLElement;
    protected readonly appController: SincroAppController;
    // 自前生成したblob URLのみ解放対象として保持する。
    private generatedSystemIconURL: string | null = null;
    private appUiStarted = false;

    constructor() {
        this.charCanvas = this.getCharCanvasRoot();
        this.controlTarget = document.querySelector('div#sincroBody')!;
        this.appController = new SincroAppController();
        // simple-vrm 現行実装では startup toggles の Talk/Inspector/VR は scene初期化へ未接続。
        this.appController.setStartupSettingsCapabilities({
            enableTalk: false,
            enableInspector: false,
            enableVR: false,
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
        this.appController.dialog.updateCharacterAvailabilityStatus(true);
        // VRMロード完了前でも、前回キャッシュ済みのアイコンを即座に表示する。
        this.loadCachedSystemIcon();
        this.appController.debug.setRTCStopButtonEventListener(() => {
            this.appController.rtc.stop();
        });

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
            this.appController.dialog.updateUserMediaAvailabilityStatus(false);
        }
    }

    private loadCachedSystemIcon(): void {
        this.appController.dialog.loadVrmThumbnailBlob().then((blob: Blob | null) => {
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
            this.initializeSincroScene();
        }

        this.appController.dialog.close();
        this.appUiStarted = true;
    }

    protected initializeSincroScene(): VRMScene {
        const vrmScene: VRMScene = new VRMScene(this.charCanvas, this.controlTarget, this.appController.dialog.getSelectedVrmUrl(), false, (thumbnailImage) => {
            this.updateSystemIconFromThumbnail(thumbnailImage);
        });
        vrmScene.start();
        return vrmScene;

        /*
            this.charCanvas, talkManager,
            this.appController.dialog.isVREnabled(),
            this.appController.dialog.isCharacterEnabled(),
            this.appController.dialog.isInspectorEnabled()
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
            this.appController.dialog.saveVrmThumbnailBlob(blob).catch((error) => {
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
        this.appController.chat.setSystemIcon(iconURL);
    }

    private revokeGeneratedSystemIconURL(): void {
        if (!this.generatedSystemIconURL) {
            return;
        }
        URL.revokeObjectURL(this.generatedSystemIconURL);
        this.generatedSystemIconURL = null;
    }
}
