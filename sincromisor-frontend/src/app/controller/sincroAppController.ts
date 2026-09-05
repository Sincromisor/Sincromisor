import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
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
import {
    emitSincroAppLifecycle,
    emitSincroAppSettingsRelatedSnapshots,
} from "../events/sincroAppEmitHelpers";
import { SincroAppEventHub } from "../events/sincroAppEventHub";
import { SincroAppLookingGlassStateTracker } from "../events/sincroAppLookingGlassStateTracker";
import { applySincroAppControllerSettings } from "../settings/sincroAppSettingsApplyFlow";
import { createDefaultSincroAppStartupSettingsCapabilities } from "../settings/sincroAppSettingsDefaults";
import { buildSincroAppSettingsRelatedSnapshotPayload } from "../settings/sincroAppSettingsRelatedSnapshotBuilder";
import { buildSincroAppSettingsSnapshot } from "../settings/sincroAppSettingsSnapshotBuilder";
import { SincroAppSettingsStore } from "../settings/sincroAppSettingsStore";
import {
    buildStartupSettingsStatus,
    type SincroAppStartupAppliedSettings,
} from "../settings/sincroAppStartupSettings";
import { buildSincroAppUiStateSnapshot } from "../settings/sincroAppUiStateSnapshotBuilder";
import { SincroAppActiveControllerRegistry } from "./sincroAppActiveControllerRegistry";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
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
    SincroAppLifecycleState,
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
    private static readonly activeRegistry = new SincroAppActiveControllerRegistry();

    private readonly runtime: SincroAppControllerRuntimeBundle;
    private readonly eventHub = new SincroAppEventHub();
    /** このインスタンスが登録した外部通知だけを所有し、差し替え時に解除する。 */
    private readonly eventUnsubscribers: (() => void)[] = [];
    private lifecycleState: SincroAppLifecycleState = "idle";
    private iceConnectionState: string = "";
    private signalingState: string = "";
    private beforeStartHook: () => void = () => {};
    private afterStartHook: () => void = () => {};
    private suppressSettingsSnapshotEvent: boolean = false;
    /** 設定値・操作可否・案内の同時点スナップショットをReactへ公開する。 */
    readonly settingsStore: SincroAppSettingsStore;
    private startupAppliedSettings: SincroAppStartupAppliedSettings | undefined;
    private startupSettingsCapabilities: SincroAppStartupSettingsCapabilities =
        createDefaultSincroAppStartupSettingsCapabilities();
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
            state: {
                getSettingsSnapshot: () => this.getSettingsSnapshot(),
                getDialogUiState: () => this.getDialogUiState(),
                getDialogVrmUiState: () => this.getDialogVrmUiState(),
                getStartupSettingsStatus: () => this.getStartupSettingsStatus(),
                getTelopTextSegmentsSnapshot: () => this.getTelopTextSegmentsSnapshot(),
            },
        });
        this.runtime = runtime;
        const initialSettings = buildSincroAppSettingsRelatedSnapshotPayload({
            dialogManager: runtime.dialogManager,
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

    /** 外部イベント購読だけを解除する。再実行は無処理とし、RTCや共有サービスは停止しない。 */
    releaseEventSubscriptions(): void {
        for (const unsubscribe of this.eventUnsubscribers.splice(0)) {
            unsubscribe();
        }
    }

    /** アプリイベントを購読し、起動・接続・シーン設定などの初期状態も直ちに通知する。 */
    subscribe(listener: (event: SincroAppEvent) => void): () => void {
        // 購読直後にスナップショットを送ることで、React 側は初回描画時の「空状態」を減らせる。
        const unsubscribe = this.eventHub.subscribe(listener);
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
                }),
        });
        return unsubscribe;
    }

    // Public lifecycle / control API
    setStartHooks(hooks: SincroAppStartHooks): void {
        // initializer 側に残る UI副作用（挨拶、シーン開始、ダイアログclose）をここ経由で組み込む。
        this.beforeStartHook = hooks.beforeStart ?? (() => {});
        this.afterStartHook = hooks.afterStart ?? (() => {});
    }

    start(): void {
        if (this.lifecycleState === "starting" || this.lifecycleState === "running") {
            return;
        }
        const startupSnapshot = this.getSettingsSnapshot();
        this.emitLifecycle("starting", startupSnapshot);
        this.emitDerivedConnectionState();
        // 起動時点の startup 設定を保存し、後で「再起動推奨」判定に使う。
        this.startupAppliedSettings = {
            enableTalk: startupSnapshot.enableTalk,
            enableInspector: startupSnapshot.enableInspector,
            enableVR: startupSnapshot.enableVR,
        };
        this.beforeStartHook();
        this.runtime.coreController.start();
        this.afterStartHook();
        this.emitLifecycle("running");
        this.emitDerivedConnectionState();
    }

    /** RTCだけを停止して状態を通知する。設定などの外部購読は維持し、未起動・停止済みなら何もしない。 */
    stopRTC(): void {
        if (
            this.lifecycleState === "stopping" ||
            this.lifecycleState === "stopped" ||
            this.lifecycleState === "idle"
        ) {
            return;
        }
        this.emitLifecycle("stopping");
        this.emitDerivedConnectionState();
        this.runtime.coreController.stopRTC();
        this.emitLifecycle("stopped");
        this.emitDerivedConnectionState();
    }

    stop(): void {
        this.stopRTC();
    }

    /** シーン反映と設定適用処理のため、現在のダイアログ・実行時設定を取得する。 */
    getSettingsSnapshot(): SincroAppSettingsSnapshot {
        return buildSincroAppSettingsSnapshot(this.runtime.dialogManager);
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
        return buildStartupSettingsStatus({
            lifecycleState: this.lifecycleState,
            current,
            applied: this.startupAppliedSettings,
        });
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

    /** 設定を正本へ一括適用し、完了後の値と操作可否を設定購読へ同時に公開する。 */
    applySettings(partial: Partial<SincroAppSettingsSnapshot>): void {
        applySincroAppControllerSettings({
            dialogManager: this.runtime.dialogManager,
            partial,
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
    }

    // lifecycle event は startup settings status と一緒に流し、UI 側の再起動案内判定を安定させる。
    private emitLifecycle(
        state: SincroAppLifecycleState,
        settingsSnapshot?: SincroAppSettingsSnapshot,
    ): void {
        this.lifecycleState = state;
        emitSincroAppLifecycle(
            (event) => this.emitEvent(event),
            state,
            settingsSnapshot
                ? this.buildStartupSettingsStatusFromSnapshot(settingsSnapshot)
                : this.getStartupSettingsStatus(),
        );
    }

    // 実配信は EventHub に委譲し、本体は emit 順序制御に集中する。
    private emitEvent(event: SincroAppEvent): void {
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
                dialogManager: this.runtime.dialogManager,
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
            }),
        );
    }
}
