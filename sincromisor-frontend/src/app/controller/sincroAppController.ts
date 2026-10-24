import type { SincroPoseRetargetConfig } from "../../character/retargeting/sincroPoseRetargeter";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppPoseBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "../bridges/sincroAppBridges";
import {
    createSincroAppRuntimeBundle,
    type SincroAppControllerRuntimeBundle,
} from "../bridges/sincroAppControllerRuntime";
import { buildSincroAppConnectionStateEvent } from "../events/sincroAppConnectionState";
import { emitSincroAppControllerInitialSnapshot } from "../events/sincroAppControllerInitialSnapshot";
import { bindSincroAppControllerSubscriptions } from "../events/sincroAppControllerSubscriptions";
import { bindSincroAppControllerWindowEvents } from "../events/sincroAppControllerWindowEvents";
import { emitSincroAppSettingsRelatedSnapshots } from "../events/sincroAppEmitHelpers";
import { SincroAppEventHub } from "../events/sincroAppEventHub";
import { SincroAppLookingGlassStateTracker } from "../events/sincroAppLookingGlassStateTracker";
import { applySincroAppControllerSettings } from "../settings/sincroAppSettingsApplyFlow";
import { createDefaultSincroAppStartupSettingsCapabilities } from "../settings/sincroAppSettingsDefaults";
import {
    SincroAppSettingsPersistence,
    type SincroSettingsPage,
} from "../settings/sincroAppSettingsPersistence";
import { buildSincroAppSettingsRelatedSnapshotPayload } from "../settings/sincroAppSettingsRelatedSnapshotBuilder";
import { buildSincroAppSettingsSnapshot } from "../settings/sincroAppSettingsSnapshotBuilder";
import { SincroAppSettingsStore } from "../settings/sincroAppSettingsStore";
import { buildSincroAppUiStateSnapshot } from "../settings/sincroAppUiStateSnapshotBuilder";
import { SincroAppActiveControllerRegistry } from "./sincroAppActiveControllerRegistry";
import { SincroAppCalibration } from "./sincroAppCalibration";
import { SincroAppLifecycleController } from "./sincroAppLifecycleController";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppSettingsSnapshot,
    SincroAppStartHooks,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./sincroAppTypes";

export type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "../bridges/sincroAppBridges";
export type {
    SincroAppDialogPopMessage,
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLookingGlassConfigStatus,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartHooks,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./sincroAppTypes";

/** 起動処理とReactの共通窓口。下位サービスを束ね、設定購読と起動・接続イベントを公開する。 */
export class SincroAppController {
    // reason: structure-threshold-exception 既存の公開窓口と購読の所有権を同じクラスで保つ。保存の検証・I/Oは設定層へ分離する。
    private static readonly activeRegistry = new SincroAppActiveControllerRegistry();

    private readonly runtime: SincroAppControllerRuntimeBundle;
    private readonly eventHub = new SincroAppEventHub();
    /** このインスタンスが登録した外部通知だけを所有し、差し替え時に解除する。 */
    private readonly eventUnsubscribers: (() => void)[] = [];
    /** 開始入口とPose観測が共有する、このアプリ専用の較正。 */
    readonly calibration = new SincroAppCalibration();
    private released = false;
    private readonly lifecycle: SincroAppLifecycleController;
    private get lifecycleState() {
        return this.lifecycle.state;
    }
    private iceConnectionState: string = "";
    private signalingState: string = "";
    private suppressSettingsSnapshotEvent: boolean = false;
    /** 設定値・操作可否・案内の同時点スナップショットをReactへ公開する。 */
    readonly settingsStore: SincroAppSettingsStore;
    private startupSettingsCapabilities: SincroAppStartupSettingsCapabilities =
        createDefaultSincroAppStartupSettingsCapabilities();
    private persistence?: SincroAppSettingsPersistence;
    private readonly lookingGlassTracker = new SincroAppLookingGlassStateTracker();
    /** 起動前ダイアログの操作とVRM選択を公開する。 */
    get dialog(): SincroAppDialogBridge {
        return this.runtime.dialogBridge;
    }
    /** 初期化処理のチャット書き込みとReactの初期履歴取得を公開する。 */
    get chat(): SincroAppChatBridge {
        return this.runtime.chatBridge;
    }
    /** 診断画面の停止操作登録と右側パネルの表示・購読を公開する。 */
    get debug(): SincroAppDebugBridge {
        return this.runtime.debugBridge;
    }
    /** アプリが所有する姿勢設定モデルの現在値と変更操作を公開する。 */
    get pose(): SincroAppPoseBridge {
        return this.runtime.poseBridge;
    }

    /** シーン生成前の診断調整も接続先へ届け、差し替え時には旧シーンの購読を解除する。 */
    connectPoseSettings(listener: (config: Partial<SincroPoseRetargetConfig>) => void): () => void {
        const unsubscribe = this.pose.subscribe(listener);
        // 通常設定と保存調整の適用はrestoreSettingsで完了済み。接続時はモデルの現在値を渡すだけにする。
        listener(this.pose.getConfig());
        this.eventUnsubscribers.push(unsubscribe);
        return unsubscribe;
    }

    /** アプリの状態遷移を通したRTC停止操作を公開する。 */
    get rtc(): SincroAppRtcBridge {
        return this.runtime.rtcBridge;
    }
    /** シーン設定と個別画面状態の取得窓口。Reactの設定表示はsettingsStoreを使う。 */
    get state(): SincroAppStateBridge {
        return this.runtime.stateBridge;
    }

    /** 設定の初期値を確定してから、有効な制御処理として公開し通知を接続する。 */
    constructor() {
        // 依存の組み立てが終わる前に購読/イベント登録を始めないよう、初期化順を固定する。
        const runtime = createSincroAppRuntimeBundle({
            emitEvent: (event) => this.emitEvent(event),
            stopRTC: () => this.stopRTC(),
            calibrationController: this.calibration.controller,
            state: {
                getSettingsSnapshot: () => this.getSettingsSnapshot(),
                getDialogUiState: () => this.getDialogUiState(),
                getDialogVrmUiState: () => this.getDialogVrmUiState(),
                getStartupSettingsStatus: () => this.getStartupSettingsStatus(),
                getTelopTextSegmentsSnapshot: () => this.getTelopTextSegmentsSnapshot(),
            },
        });
        this.runtime = runtime;
        this.lifecycle = new SincroAppLifecycleController({
            core: runtime.coreController,
            calibration: this.calibration,
            getSettings: () => this.getSettingsSnapshot(),
            isReleased: () => this.released,
            emitEvent: (event) => this.emitEvent(event),
            emitConnectionState: () => this.emitDerivedConnectionState(),
        });
        const initialSettings = buildSincroAppSettingsRelatedSnapshotPayload({
            settingsModel: runtime.settingsModel,
            buildStartupSettingsStatus: (settings) =>
                this.buildStartupSettingsStatusFromSnapshot(settings),
        });
        this.settingsStore = new SincroAppSettingsStore({
            settings: initialSettings.settings,
            settingsUiState: initialSettings.settingsUiState,
            settingsUiHints: initialSettings.settingsUiHints,
        });
        // 旧制御の外部購読を解除してReactを切り替え、登録時の即時通知を新購読へ届ける。
        SincroAppController.setCurrent(this);
        this.eventUnsubscribers.push(this.bindUiSubscriptions());
        // 診断画面の有無にかかわらず、所有モデルの現在値を表示用コピーへ接続する。
        this.eventUnsubscribers.push(
            runtime.poseSettings.subscribe((config) =>
                runtime.debugConsoleManager.setSincroPoseRetargetConfig(config),
            ),
        );
        this.eventUnsubscribers.push(
            runtime.debugConsoleManager.setSincroPoseRetargetConfigEditCallback(
                (partial, source) => {
                    const edited = runtime.poseSettings.applyConfig(partial);
                    if (source === "user") this.persistence?.savePoseTuning(edited);
                },
            ),
        );
        this.pose.applyConfig({ intensityScale: initialSettings.settings.sincroPoseRetargetScale });
        this.eventUnsubscribers.push(this.calibration.connectSettings(runtime.settingsModel));
        this.eventUnsubscribers.push(
            runtime.dialogManager.subscribeVrmSelectionChange(() =>
                this.calibration.cancel("vrm_source_changed"),
            ),
        );
        this.eventUnsubscribers.push(runtime.settingsModel.connectMediaDevices());
        this.eventUnsubscribers.push(
            runtime.settingsModel.subscribeSettingsEdit((partial) => {
                this.persistence?.save(partial);
                if (partial.sincroPoseRetargetScale !== undefined) {
                    // 同値の再指定も通常設定の明示操作として優先し、古い診断強度を解除する。
                    this.persistence?.clearPoseIntensity();
                    this.pose.applyConfig({ intensityScale: partial.sincroPoseRetargetScale });
                }
            }),
        );
        this.eventUnsubscribers.push(
            bindSincroAppControllerWindowEvents({
                lookingGlassTracker: this.lookingGlassTracker,
                emitEvent: (event) => this.emitEvent(event),
                openDialog: () => this.dialog.open(),
            }),
        );
    }

    /** 現在有効な制御処理をReactやページ初期化処理へ公開する。 */
    static getCurrent(): SincroAppController | undefined {
        return SincroAppController.activeRegistry.getCurrent();
    }

    /** 有効な制御処理を即時通知し、以後の差し替えも購読する。戻り値で購読を解除する。 */
    static subscribeCurrent(
        listener: (controller: SincroAppController | undefined) => void,
    ): () => void {
        return SincroAppController.activeRegistry.subscribe(listener);
    }

    /** 外部購読・較正・追跡結果の反映を終了する。再実行は無処理とし、RTCや機器は停止しない。 */
    releaseEventSubscriptions(): void {
        if (this.released) return;
        this.released = true;
        this.calibration.cancel("app_released");
        this.runtime.coreController.releaseTrackingSubscriptions();
        for (const unsubscribe of this.eventUnsubscribers.splice(0)) {
            unsubscribe();
        }
    }

    /** アプリイベントを購読し、起動・接続・シーン設定などの初期状態も直ちに通知する。 */
    subscribe(listener: (event: SincroAppEvent) => void): () => void {
        // 購読直後にスナップショットを送ることで、React 側は初回描画時の「空状態」を減らせる。
        const unsubscribe = this.eventHub.subscribe(listener);
        listener({ type: "media_state", state: { ...this.lifecycle.mediaState } });
        listener({ type: "audio_input_state", state: this.lifecycle.audioInputState });
        emitSincroAppControllerInitialSnapshot({
            listener,
            lifecycleState: this.lifecycleState,
            startupSettingsCapabilities: this.startupSettingsCapabilities,
            settings: this.settingsStore.getSnapshot().settings,
            startupSettingsStatus: this.getStartupSettingsStatus(),
            getUiStateSnapshot: () => this.getUiStateSnapshot(),
            getLookingGlassState: () => this.lookingGlassTracker.getState(),
            getLookingGlassConfigStatus: () => this.lookingGlassTracker.getConfigStatus(),
            buildConnectionStateEvent: () =>
                buildSincroAppConnectionStateEvent({
                    lifecycleState: this.lifecycleState,
                    iceConnectionState: this.iceConnectionState,
                    signalingState: this.signalingState,
                    audioInputState: this.lifecycle.audioInputState,
                }),
        });
        return unsubscribe;
    }

    /** 開始時のシーン・ダイアログ操作をライフサイクル所有者へ渡す。 */
    setStartHooks(hooks: SincroAppStartHooks): void {
        this.lifecycle.setStartHooks(hooks);
    }

    /** 設定を保持した明示開始。重複操作と非同期結果はライフサイクル所有者が制御する。 */
    start(): void {
        this.lifecycle.start();
    }

    /** 設定と稼働中のカメラを保ったまま、失敗した音声取得だけを再試行する。 */
    retryAudioInput(): void {
        this.lifecycle.retryAudioInput();
    }

    /** 診断・再接続用のRTC停止。機器全体の終了とは区別する。 */
    stopRTC(): void {
        this.lifecycle.stopRTC();
    }

    /** 既存の内部停止窓口はRTCだけを停止する。 */
    stop(): void {
        this.stopRTC();
    }

    /** 通常画面から較正・全機器・取得待ちを終了する。 */
    endExperience(): void {
        this.lifecycle.endExperience();
    }

    /** シーン反映と設定適用処理のため、現在の通常設定・実行時設定を取得する。 */
    getSettingsSnapshot(): SincroAppSettingsSnapshot {
        return buildSincroAppSettingsSnapshot(this.runtime.settingsModel);
    }

    /** ダイアログの開閉・開始ボタンの現在状態を初期表示へ渡す。 */
    getDialogUiState(): SincroAppDialogUiState {
        return this.getUiStateSnapshot().dialogUiState;
    }

    /** VRM選択と読込結果の現在状態を初期表示へ渡す。 */
    getDialogVrmUiState(): SincroAppDialogVrmUiState {
        return this.getUiStateSnapshot().dialogVrmUiState;
    }

    /** 起動時に適用した設定と現在値を比べ、再起動の要否を取得する。 */
    getStartupSettingsStatus(): SincroAppStartupSettingsStatus {
        return this.buildStartupSettingsStatusFromSnapshot(this.getSettingsSnapshot());
    }

    /** Reactの初期表示へ、TalkManagerが保持するテロップ履歴を渡す。 */
    getTelopTextSegmentsSnapshot() {
        return this.runtime.talkManager.getTelopTextSegmentsSnapshot();
    }

    private buildStartupSettingsStatusFromSnapshot(
        current: SincroAppSettingsSnapshot,
    ): SincroAppStartupSettingsStatus {
        return this.lifecycle.getStartupSettingsStatus(current);
    }

    // Public startup capability API
    setStartupSettingsCapabilities(
        capabilities: Partial<SincroAppStartupSettingsCapabilities>,
    ): void {
        this.startupSettingsCapabilities = {
            ...this.startupSettingsCapabilities,
            ...capabilities,
        };
        this.emitEvent({
            type: "startup_settings_capabilities",
            capabilities: this.startupSettingsCapabilities,
        });
    }

    /** 利用可否確定後、ページ既定値・保存値・URL指定の順で復元し、その後の利用者操作を保存する。 */
    restoreSettings(
        page: SincroSettingsPage,
        defaults: Partial<SincroAppSettingsSnapshot>,
        url: Partial<SincroAppSettingsSnapshot>,
    ): void {
        this.persistence = new SincroAppSettingsPersistence(page);
        const persistence = this.persistence;
        this.settingsStore.setSaveFailed(persistence.hasUnsavedChanges());
        this.eventUnsubscribers.push(
            persistence.subscribe(() =>
                this.settingsStore.setSaveFailed(persistence.hasUnsavedChanges()),
            ),
        );
        this.applySettings({ ...defaults, ...this.persistence.load(), ...url }, "restore");
        this.runtime.coreController.restoreAudioTuning(this.persistence);
        const debug = this.runtime.debugConsoleManager;
        const gaze = this.persistence.getGazeTuning();
        if (gaze !== undefined) debug.applyCharacterGazeTrackingTuning(gaze, "sync");
        this.pose.applyConfig({
            intensityScale: this.getSettingsSnapshot().sincroPoseRetargetScale,
            ...this.persistence.getPoseTuning(),
        });
        this.eventUnsubscribers.push(
            debug.subscribe((event) => {
                if (event.type === "gaze_tuning_edit")
                    this.persistence?.saveGazeTuning(event.config);
            }),
        );
    }

    /** 未保存の最新文書を再試行し、結果は設定ストアの購読で画面へ伝える。 */
    retrySettingsSave(): void {
        this.persistence?.retry();
    }

    /** 設定を正本へ一括適用し、完了後の値と操作可否を設定購読へ同時に公開する。 */
    applySettings(
        partial: Partial<SincroAppSettingsSnapshot>,
        source: "user" | "restore" = "user",
    ): void {
        applySincroAppControllerSettings({
            settingsModel: this.runtime.settingsModel,
            partial,
            source,
            settingsStore: this.settingsStore,
            buildStartupSettingsStatus: (settings) =>
                this.buildStartupSettingsStatusFromSnapshot(settings),
            lookingGlassTracker: this.lookingGlassTracker,
            emitEvent: (event) => this.emitEvent(event),
            getSettingsSnapshot: () => this.getSettingsSnapshot(),
            setSuppressSettingsSnapshotEvent: (value) => {
                this.suppressSettingsSnapshotEvent = value;
            },
        });
        if (source === "user") {
            // 通常設定は設定モデルが適用済み入力を通知する。別所有のLooking Glass値だけをここで保存する。
            const current = this.getSettingsSnapshot();
            const lookingGlass = Object.fromEntries(
                Object.entries(current).filter(([key]) => key.startsWith("lg") && key in partial),
            );
            if (Object.keys(lookingGlass).length > 0) this.persistence?.save(lookingGlass);
        }
    }

    // 状態を保持してから配信し、音声取得結果と接続表示を同じ通知回に揃える。
    private emitEvent(event: SincroAppEvent): void {
        if (event.type === "media_state") this.lifecycle?.updateMediaState(event.state);
        if (event.type === "audio_input_state" && this.lifecycle) {
            this.lifecycle.audioInputState = event.state;
            this.eventHub.emit(event);
            this.emitDerivedConnectionState();
            return;
        }
        this.eventHub.emit(event);
    }

    /** 共有サービスの通知をこのアプリへ接続し、差し替え時の解除処理を返す。 */
    private bindUiSubscriptions(): () => void {
        return bindSincroAppControllerSubscriptions({
            chatMessageService: this.runtime.chatMessageService,
            debugConsoleManager: this.runtime.debugConsoleManager,
            talkManager: this.runtime.talkManager,
            popMessageService: this.runtime.popMessageService,
            dialogManager: this.runtime.dialogManager,
            settingsModel: this.runtime.settingsModel,
            emitEvent: (event) => this.emitEvent(event),
            emitDerivedConnectionState: () => this.emitDerivedConnectionState(),
            emitSettingsRelatedSnapshots: () => this.emitSettingsRelatedSnapshots(),
            getRtcState: () => ({
                iceConnectionState: this.iceConnectionState,
                signalingState: this.signalingState,
            }),
            setRtcState: (state) => {
                this.iceConnectionState = state.iceConnectionState;
                this.signalingState = state.signalingState;
            },
        });
    }

    // settings系 event はまとまって発火させ、UI 側で disabled/hints/snapshot を同一世代として扱えるようにする。
    private emitSettingsRelatedSnapshots(): void {
        if (this.suppressSettingsSnapshotEvent) {
            return;
        }
        emitSincroAppSettingsRelatedSnapshots(
            (event) => this.emitEvent(event),
            this.settingsStore,
            buildSincroAppSettingsRelatedSnapshotPayload({
                settingsModel: this.runtime.settingsModel,
                buildStartupSettingsStatus: (settings) =>
                    this.buildStartupSettingsStatusFromSnapshot(settings),
            }),
        );
    }

    // DialogManager 由来の UI状態はまとめて取得し、同一タイミングでの整合を取りやすくする。
    private getUiStateSnapshot() {
        // dialog/settings UI 状態はまとめて取得し、同一時点の整合を取りやすくする。
        return buildSincroAppUiStateSnapshot(this.runtime.dialogManager);
    }

    private static setCurrent(controller: SincroAppController | undefined): void {
        // active controller の static 購読は React mount 後の attach 判定に使われる。
        if (controller === undefined) {
            SincroAppController.activeRegistry.getCurrent()?.emitEvent({
                type: "camera-quality-reset",
            });
        }
        SincroAppController.activeRegistry.setCurrent(controller);
    }

    // ICE/signaling/lifecycle の保持状態から UI向け connection_state を導出して通知する。
    private emitDerivedConnectionState(): void {
        this.emitEvent(
            buildSincroAppConnectionStateEvent({
                lifecycleState: this.lifecycleState,
                iceConnectionState: this.iceConnectionState,
                signalingState: this.signalingState,
                audioInputState: this.lifecycle.audioInputState,
            }),
        );
    }
}
