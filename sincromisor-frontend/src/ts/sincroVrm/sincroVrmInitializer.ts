import { SincroAppController } from "../../app/controller";
import { frontendLogger } from "../logging/appLogger";
import { UserMediaManager } from "../rtc/userMediaManager";
import { DebugConsoleManager } from "../ui/debugConsoleManager";
import { VRMScene } from "./vrmScene/vrmScene";

const CHARACTER_BOX_SELECTOR = "div#sincroCharacterBox";
const CHARACTER_CONTROL_LAYER_SELECTOR = "div#sincroCharacterControlLayer";

// VRM1.0 系ページ（simple-vrm など）の初期化入口。
// 起動前 dialog / chat / debug / RTC 停止配線は SincroAppController 経由に寄せ、ページ差分は scene 初期化に閉じる。
export class SincroVRMInitializer {
    protected readonly charCanvas: HTMLDivElement;
    protected readonly characterControlLayer: HTMLDivElement;
    protected readonly appController: SincroAppController;
    // 自前生成したblob URLのみ解放対象として保持する。
    private generatedSystemIconURL?: string;
    private appUiStarted = false;
    protected activeScene?: VRMScene;

    public static async bootstrap<TInitializer extends SincroVRMInitializer>(
        this: new () => TInitializer,
    ): Promise<TInitializer> {
        await SincroVRMInitializer.waitForCharacterBoxRoot();
        return new this();
    }

    constructor() {
        this.charCanvas = this.getCharCanvasRoot();
        this.characterControlLayer = this.getCharacterControlLayer();
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
        DebugConsoleManager.getManager().setSincroPoseRetargetConfigChangeCallback((config) => {
            this.activeScene?.setSincroPoseRetargetConfig(config);
        });
        this.bindRuntimeSettingsSync();

        if ("obsstudio" in window) {
            this.start();
        }
    }

    private static waitForCharacterBoxRoot(timeoutMs = 5000): Promise<HTMLDivElement> {
        const existingCharCanvas = document.querySelector<HTMLDivElement>(CHARACTER_BOX_SELECTOR);
        if (existingCharCanvas) {
            return Promise.resolve(existingCharCanvas);
        }

        const observationTarget = document.body ?? document.documentElement;
        return new Promise((resolve, reject) => {
            const observer = new MutationObserver(() => {
                const charCanvas = document.querySelector<HTMLDivElement>(CHARACTER_BOX_SELECTOR);
                if (!charCanvas) {
                    return;
                }

                window.clearTimeout(timeoutId);
                observer.disconnect();
                resolve(charCanvas);
            });
            const timeoutId = window.setTimeout(() => {
                observer.disconnect();
                reject(new Error(`${CHARACTER_BOX_SELECTOR} is not found.`));
            }, timeoutMs);

            // React app shell が非同期に mount しても拾えるよう、DOM 追加を監視する。
            observer.observe(observationTarget, { childList: true, subtree: true });
        });
    }

    private getCharCanvasRoot(): HTMLDivElement {
        const charCanvas = document.querySelector<HTMLDivElement>(CHARACTER_BOX_SELECTOR);
        if (!charCanvas) {
            throw new Error(`${CHARACTER_BOX_SELECTOR} is not found.`);
        }
        return charCanvas;
    }

    private getCharacterControlLayer(): HTMLDivElement {
        const controlLayer = document.querySelector<HTMLDivElement>(
            CHARACTER_CONTROL_LAYER_SELECTOR,
        );
        if (!controlLayer) {
            throw new Error(`${CHARACTER_CONTROL_LAYER_SELECTOR} is not found.`);
        }
        return controlLayer;
    }

    private getUserMediaAvailabilityCheck(): void {
        // ブラウザ API 自体が無い環境では、起動前 dialog の開始ボタン状態へ即反映する。
        if (!UserMediaManager.hasGetUserMedia()) {
            this.appController.dialog.updateUserMediaAvailabilityStatus(false);
        }
    }

    private loadCachedSystemIcon(): void {
        // VRMロード完了前でもチャット system icon を出せるよう、キャッシュ済みサムネイルを先に復元する。
        this.appController.dialog
            .loadVrmThumbnailBlob()
            .then((blob: Blob | undefined) => {
                if (!blob) {
                    return;
                }
                const iconURL = URL.createObjectURL(blob);
                this.applySystemIcon(iconURL);
            })
            .catch((error) => {
                frontendLogger.warn("Failed to load cached VRM thumbnail.", { error });
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
        const vrmScene: VRMScene = new VRMScene({
            canvasRoot: this.charCanvas,
            characterControlLayer: this.characterControlLayer,
            vrmUrl: this.appController.dialog.getSelectedVrmUrl(),
            xrMode: false,
            onThumbnailLoaded: (thumbnailImage) => {
                this.updateSystemIconFromThumbnail(thumbnailImage);
            },
            enableInitialUpperBodyFraming: true,
        });
        vrmScene.start();
        this.activeScene = vrmScene;
        this.syncSceneRuntimeSettings(this.appController.state.getSettingsSnapshot());
        return vrmScene;

        /*
            this.charCanvas, talkManager,
            this.appController.dialog.isVREnabled(),
            this.appController.dialog.isCharacterEnabled(),
            this.appController.dialog.isInspectorEnabled()
        */
    }

    protected updateSystemIconFromThumbnail(thumbnailImage: HTMLImageElement | undefined): void {
        if (!thumbnailImage) {
            return;
        }

        const canvas = document.createElement("canvas");
        const width = positiveDimensionOrDefault(thumbnailImage.naturalWidth, thumbnailImage.width);
        const height = positiveDimensionOrDefault(
            thumbnailImage.naturalHeight,
            thumbnailImage.height,
        );
        if (width === 0 || height === 0) {
            return;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            return;
        }

        try {
            ctx.drawImage(thumbnailImage, 0, 0, width, height);
        } catch (error) {
            // cross-origin等でdrawImageが失敗するケースはキャッシュ保存を諦めて表示だけ更新する
            frontendLogger.warn("Failed to draw VRM thumbnail image.", { error });
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
                frontendLogger.warn("Failed to cache VRM thumbnail.", { error });
            });
            const iconURL = URL.createObjectURL(blob);
            this.applySystemIcon(iconURL);
        }, "image/png");
    }

    protected applySystemIcon(iconURL: string): void {
        // 差し替えを繰り返してもblob URLがリークしないように先に解放する。
        this.revokeGeneratedSystemIconURL();
        if (iconURL.startsWith("blob:")) {
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
        this.generatedSystemIconURL = undefined;
    }

    // Character ON/OFF は起動後の設定変更でも見た目に反映されるよう、scene へ追従させる。
    protected bindRuntimeSettingsSync(): void {
        this.appController.subscribe((event) => {
            if (event.type !== "settings_snapshot") {
                return;
            }
            this.syncSceneRuntimeSettings(event.settings);
        });
    }

    protected syncSceneRuntimeSettings(settings: {
        enableCharacter: boolean;
        characterMotionScale: number;
        sincroPoseRetargetScale: number;
        characterEyeTrackingScale: number;
    }): void {
        if (!this.activeScene) {
            return;
        }
        this.activeScene.setCharacterVisible(settings.enableCharacter);
        this.activeScene.setCharacterMotionTuning({
            motionScale: settings.characterMotionScale,
            eyeTrackingScale: settings.characterEyeTrackingScale,
        });
        const poseRetargetConfig = {
            ...DebugConsoleManager.getManager().getSnapshot().sincroMotion.poseRetarget,
            intensityScale: settings.sincroPoseRetargetScale,
        };
        DebugConsoleManager.getManager().setSincroPoseRetargetConfig(poseRetargetConfig);
        this.activeScene.setSincroPoseRetargetConfig(poseRetargetConfig);
    }
}

function positiveDimensionOrDefault(...values: number[]): number {
    return values.find((value) => value > 0) ?? 0;
}
