import { VRMScene } from "../../character/scene/vrmScene";
import { UserMediaManager } from "../../features/media/userMedia/userMediaManager";
import { SincroAppController, type SincroAppSettingsSnapshot } from "../controller";
import type { SincroSettingsPage } from "../settings/sincroAppSettingsPersistence";
import { SincroVrmThumbnailController } from "./sincroVrmThumbnailController";

/** Reactが配置済みの描画領域と操作領域。初期化処理はDOM探索を行わない。 */
export type SincroVRMRoots = {
    canvasRoot: HTMLDivElement;
    characterControlLayer: HTMLDivElement;
};

/** VRMページの機器確認・設定復元・アプリ開始を組み立て、描画資源はシーンへ委ねる。 */
export class SincroVRMInitializer {
    protected readonly charCanvas: HTMLDivElement;
    protected readonly characterControlLayer: HTMLDivElement;
    protected readonly appController: SincroAppController;
    private readonly thumbnails: SincroVrmThumbnailController;
    private selectionWasPending = true;
    private displayedVrmUrl?: string;
    private initialized = false;
    protected activeScene?: VRMScene;
    protected readonly settingsPage: SincroSettingsPage = "simple-vrm";
    protected readonly initialSettings: Partial<SincroAppSettingsSnapshot> = {};

    /** 配置済みの領域とページ設定を受け取り、初期化成功時だけOBS自動開始へ進む。 */
    public static bootstrap<TInitializer extends SincroVRMInitializer>(
        this: new (
            roots: SincroVRMRoots,
        ) => TInitializer,
        roots: SincroVRMRoots,
        initialSettings: Partial<SincroAppSettingsSnapshot> = {},
    ): TInitializer {
        const initializer = new this(roots);
        initializer.initialize(initialSettings);
        initializer.startAutomatically();
        return initializer;
    }

    constructor(roots: SincroVRMRoots) {
        this.charCanvas = roots.canvasRoot;
        this.characterControlLayer = roots.characterControlLayer;
        this.appController = new SincroAppController();
        this.thumbnails = new SincroVrmThumbnailController(this.appController);
        // startup toggles のページごとの有効性を先に知らせ、React UI の「未対応項目表示」に反映する。
        // simple-vrm 現行実装では startup toggles の Talk/Inspector/VR は scene初期化へ未接続。
        this.appController.setStartupSettingsCapabilities({
            enableTalk: false,
            enableInspector: false,
            enableVR: false,
        });
        this.appController.setStartHooks({
            prepareStart: (signal) => this.prepareStart(signal),
            onRelease: () => this.thumbnails.release(),
            beforeStart: () => {
                if (!this.initialized) throw new Error("VRM page is not initialized.");
            },
            afterStart: () => this.appController.dialog.close(),
        });
    }

    /** 機器状態・アイコン復元・シーン設定購読を開始する。同期失敗時は登録済み購読を解除する。 */
    initialize(initialSettings: Partial<SincroAppSettingsSnapshot> = {}): void {
        if (this.initialized) return;
        try {
            // 操作可能状態を確定してから、ページ既定値・保存値・許可済みURL設定を一括適用する。
            this.getUserMediaAvailabilityCheck();
            this.appController.dialog.updateCharacterAvailabilityStatus(true);
            this.appController.restoreSettings(
                this.settingsPage,
                this.initialSettings,
                initialSettings,
            );
            this.initializePageBindings();
            this.initialized = true;
        } catch (error) {
            this.appController.releaseEventSubscriptions();
            throw error;
        }
    }

    private initializePageBindings(): void {
        // VRMロード完了前でも、前回キャッシュ済みのアイコンを即座に表示する。
        this.thumbnails.restoreCached();
        this.appController.debug.setRTCStopButtonEventListener(() => {
            this.appController.rtc.stop();
        });
        this.appController.connectPoseSettings((config) => {
            this.activeScene?.setSincroPoseRetargetConfig(config);
        });
        this.bindRuntimeSettingsSync();
    }

    /** ページ設定と初期化が確定した後に呼ぶ。手動開始との重複はアプリが抑止する。 */
    startAutomatically(): void {
        if (!this.initialized) throw new Error("VRM page is not initialized.");
        if ("obsstudio" in window) this.appController.start();
    }

    private getUserMediaAvailabilityCheck(): void {
        // ブラウザ API 自体が無い環境では、起動前 dialog の開始ボタン状態へ即反映する。
        if (!UserMediaManager.hasGetUserMedia()) {
            this.appController.dialog.updateUserMediaAvailabilityStatus(false);
        }
    }

    /** 保存確定とモデル反映を待ち、取消し・失敗後はダイアログと機器を開始しない。 */
    private async prepareStart(signal: AbortSignal): Promise<void> {
        await this.appController.dialog.waitForVrmSelection();
        if (signal.aborted) return;
        if (!this.initialized) throw new Error("VRM page is not initialized.");
        if (!this.appController.dialog.isCharacterEnabled()) return;
        const url = this.appController.dialog.getSelectedVrmUrl();
        this.appController.dialog.setVrmModelStatus("選択したモデルを読み込んでいます");
        if (signal.aborted) return;
        try {
            if (!this.activeScene) {
                const scene = this.initializeSincroScene(signal);
                await scene.ready;
            } else {
                await this.activeScene.replaceVrm(url, signal);
            }
            if (signal.aborted) return;
            this.displayedVrmUrl = url;
            this.appController.dialog.setVrmModelStatus("選択したモデルを表示中");
        } catch (error) {
            if (!signal.aborted) {
                this.appController.dialog.setVrmModelStatus(
                    this.displayedVrmUrl
                        ? "選択したモデルを反映できませんでした。前のモデルを表示しています。「開始する」で再試行できます"
                        : "キャラクターを表示できませんでした。別のVRMを選ぶか「開始する」で再試行できます",
                );
            }
            throw error;
        }
    }

    /** ページ固有のシーンを開始し、保持した現在設定を初回描画へ渡す。 */
    protected initializeSincroScene(signal?: AbortSignal): VRMScene {
        const vrmScene = this.createScene(signal);
        vrmScene.start();
        this.activeScene = vrmScene;
        vrmScene.setSincroPoseRetargetConfig(this.appController.pose.getConfig());
        this.syncSceneRuntimeSettings(this.appController.state.getSettingsSnapshot());
        return vrmScene;
    }

    /** 通常ページはXRを無効にし、初期表示を上半身構図にする。開始と設定接続は基底が担う。 */
    protected createScene(signal?: AbortSignal): VRMScene {
        // scene 初期値（VRM URL）は dialog bridge 経由で取得し、DialogManager 実装に直接依存しない。
        const vrmScene: VRMScene = new VRMScene({
            diagnostics: this.appController.debug.vrmDiagnostics,
            canvasRoot: this.charCanvas,
            characterControlLayer: this.characterControlLayer,
            vrmUrl: this.appController.dialog.getSelectedVrmUrl(),
            loadSignal: signal,
            retainVrmUrl: (url) => this.appController.dialog.retainVrmUrl(url),
            xrMode: false,
            onThumbnailLoaded: (thumbnailImage, isCurrent) => {
                this.updateSystemIconFromThumbnail(thumbnailImage, isCurrent);
            },
            enableInitialUpperBodyFraming: true,
        });
        return vrmScene;
    }

    /** モデル読込世代とサムネイル世代の両方が有効な画像だけを反映する。 */
    protected updateSystemIconFromThumbnail(
        image: HTMLImageElement | undefined,
        isCurrent: () => boolean,
    ): void {
        this.thumbnails.update(image, isCurrent);
    }

    /** 起動後の通常設定を生成済みシーンへ通知する。生成前の通知は初回接続時に補う。 */
    protected bindRuntimeSettingsSync(): void {
        this.appController.subscribe((event) => {
            if (event.type === "dialog_vrm_ui_state") {
                const pending = event.uiState.isSelectionPending;
                if (pending && !this.selectionWasPending) this.thumbnails.invalidate();
                this.selectionWasPending = pending;
            }
            if (event.type !== "settings_snapshot") {
                return;
            }
            this.syncSceneRuntimeSettings(event.settings);
        });
    }

    /** シーン生成後の可視性・動作強度を同期する。姿勢調整は専用購読で反映する。 */
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
    }
}
