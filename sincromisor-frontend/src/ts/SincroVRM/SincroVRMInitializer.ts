import { SincroAppController } from "../App/SincroAppController";
import { UserMediaManager } from "../RTC/UserMediaManager";
import { VRMScene } from './VRMScene/VRMScene';

// VRM1.0 系ページ（simple-vrm など）の初期化入口。
// 起動前 dialog / chat / debug / RTC 停止配線は SincroAppController 経由に寄せ、ページ差分は scene 初期化に閉じる。
export class SincroVRMInitializer {
    protected readonly charCanvas: HTMLDivElement;
    protected readonly controlTarget: HTMLElement;
    protected readonly appController: SincroAppController;
    // 自前生成したblob URLのみ解放対象として保持する。
    private generatedSystemIconURL: string | null = null;
    private appUiStarted = false;
    protected activeScene: VRMScene | null = null;

    constructor() {
        this.charCanvas = this.getCharCanvasRoot();
        this.controlTarget = document.querySelector('div#sincroBody')!;
        this.appController = new SincroAppController();
        // startup toggles のページごとの有効性を先に知らせ、React UI の「未対応項目表示」に反映する。
        // simple-vrm 現行実装では startup toggles の Talk/Inspector/VR は scene初期化へ未接続。
        this.appController.setStartupSettingsCapabilities({
            enableTalk: false,
            enableInspector: false,
            enableVR: false,
        });
        this.appController.setStartHooks({
            beforeStart: () => {
                // 既存 UX を崩さないよう、挨拶メッセージは初回 start 前に注入する。
                this.writeWelcomeMessagesOnce();
            },
            afterStart: () => {
                // scene 起動や dialog close は RTC 開始後の副作用として hook 側へ寄せる。
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
        this.bindRuntimeSettingsSync();

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
        // ブラウザ API 自体が無い環境では、起動前 dialog の開始ボタン状態へ即反映する。
        if (!UserMediaManager.hasGetUserMedia()) {
            this.appController.dialog.updateUserMediaAvailabilityStatus(false);
        }
    }

    private loadCachedSystemIcon(): void {
        // VRMロード完了前でもチャット system icon を出せるよう、キャッシュ済みサムネイルを先に復元する。
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
        // start の順序制御（lifecycle / hooks / RTC 起動）は AppController に集約。
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
        // Character 無効時は scene を起動せず、RTC/UI だけ動かせる構成にしている。
        if (this.appController.dialog.isCharacterEnabled()) {
            this.initializeSincroScene();
        }

        this.appController.dialog.close();
        this.appUiStarted = true;
    }

    protected initializeSincroScene(): VRMScene {
        // scene 初期値（VRM URL）は dialog bridge 経由で取得し、DialogManager 実装に直接依存しない。
        const vrmScene: VRMScene = new VRMScene(
            this.charCanvas,
            this.controlTarget,
            this.appController.dialog.getSelectedVrmUrl(),
            false,
            (thumbnailImage) => {
                this.updateSystemIconFromThumbnail(thumbnailImage);
            },
            true,
        );
        vrmScene.start();
        this.activeScene = vrmScene;
        this.syncSceneCharacterVisibility(this.appController.state.getSettingsSnapshot());
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
            // 次回起動で即復元できるよう、チャット用サムネイルを dialog 側キャッシュへ保存する。
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
        // チャット内 system アイコンだけを更新する。
        this.appController.chat.setSystemIcon(iconURL);
    }

    private revokeGeneratedSystemIconURL(): void {
        if (!this.generatedSystemIconURL) {
            return;
        }
        URL.revokeObjectURL(this.generatedSystemIconURL);
        this.generatedSystemIconURL = null;
    }

    // Character ON/OFF は起動後の設定変更でも見た目に反映されるよう、scene へ追従させる。
    protected bindRuntimeSettingsSync(): void {
        this.appController.subscribe((event) => {
            if (event.type !== "settings_snapshot") {
                return;
            }
            this.syncSceneCharacterVisibility(event.settings);
        });
    }

    protected syncSceneCharacterVisibility(settings: { enableCharacter: boolean }): void {
        if (!this.activeScene) {
            return;
        }
        this.activeScene.setCharacterVisible(settings.enableCharacter);
    }
}
