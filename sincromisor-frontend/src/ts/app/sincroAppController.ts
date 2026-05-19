import { SincroAppActiveControllerRegistry } from "./sincroAppActiveControllerRegistry";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./sincroAppBridges";
import {
    buildSincroAppControllerConnectionStateEvent,
    emitSincroAppControllerConnectionState,
} from "./sincroAppControllerConnectionState";
import { emitSincroAppControllerInitialSnapshot } from "./sincroAppControllerInitialSnapshot";
import {
    createSincroAppRuntimeBundle,
    type SincroAppControllerRuntimeBundle,
} from "./sincroAppControllerRuntime";
import { bindSincroAppControllerSubscriptions } from "./sincroAppControllerSubscriptions";
import { bindSincroAppControllerWindowEvents } from "./sincroAppControllerWindowEvents";
import {
    emitSincroAppLifecycle,
    emitSincroAppSettingsRelatedSnapshots,
} from "./sincroAppEmitHelpers";
import { SincroAppEventHub } from "./sincroAppEventHub";
import { SincroAppLookingGlassStateTracker } from "./sincroAppLookingGlassStateTracker";
import { applySincroAppControllerSettings } from "./sincroAppSettingsApplyFlow";
import { SincroAppSettingsRelatedPayloadCache } from "./sincroAppSettingsRelatedPayloadCache";
import { buildSincroAppSettingsSnapshot } from "./sincroAppSettingsSnapshotBuilder";
import {
    buildStartupSettingsStatus,
    type SincroAppStartupAppliedSettings,
} from "./sincroAppStartupSettings";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartHooks,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./sincroAppTypes";
import { buildSincroAppUiStateSnapshot } from "./sincroAppUiStateSnapshotBuilder";

export type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./sincroAppBridges";
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

// UI層（現行Initializer/将来React）から使うアプリ制御の入口。
// 現段階では既存 SincroController / singleton manager・service 群への統一窓口。
// 型・bridge・判定ロジック・mapper は helper へ分離し、本体は orchestration と状態遷移に集中させる。
export class SincroAppController {
    private static readonly activeRegistry = new SincroAppActiveControllerRegistry();

    private readonly runtime: SincroAppControllerRuntimeBundle;
    private readonly eventHub = new SincroAppEventHub();
    private lifecycleState: SincroAppLifecycleState = "idle";
    private iceConnectionState: string = "";
    private signalingState: string = "";
    private beforeStartHook: () => void = () => {};
    private afterStartHook: () => void = () => {};
    private suppressSettingsSnapshotEvent: boolean = false;
    private readonly settingsRelatedPayloadCache: SincroAppSettingsRelatedPayloadCache;
    private startupAppliedSettings: SincroAppStartupAppliedSettings | undefined;
    private startupSettingsCapabilities: SincroAppStartupSettingsCapabilities = {
        enableTalk: false,
        enableInspector: false,
        enableVR: false,
    };
    private readonly lookingGlassTracker = new SincroAppLookingGlassStateTracker();
    // 呼び出し側では `appController.dialog.*` の方が意図が読み取りやすいため getter を用意する。
    get dialog(): SincroAppDialogBridge {
        return this.runtime.dialogBridge;
    }
    // initializer/React からのチャットUI更新をまとめる軽量 bridge。
    // ChatMessageService 直接参照を減らし、UI経路を AppController に集約する。
    get chat(): SincroAppChatBridge {
        return this.runtime.chatBridge;
    }
    // debug UI 側の配線も AppController 経由に寄せ、initializer の manager 直接依存を減らす。
    get debug(): SincroAppDebugBridge {
        return this.runtime.debugBridge;
    }
    // UI層から見た RTC 操作の窓口。将来的に再接続/状態取得をここへ寄せる想定。
    get rtc(): SincroAppRtcBridge {
        return this.runtime.rtcBridge;
    }
    // snapshot getter 群をまとめた読み取り専用 bridge。呼び出し側で API の意図を揃えやすくする。
    get state(): SincroAppStateBridge {
        return this.runtime.stateBridge;
    }

    constructor() {
        // 依存の組み立てが終わる前に購読/イベント登録を始めないよう、初期化順を固定する。
        const runtime = this.initializeRuntime();
        this.runtime = runtime;
        this.settingsRelatedPayloadCache = new SincroAppSettingsRelatedPayloadCache({
            dialogManager: runtime.dialogManager,
            buildStartupSettingsStatus: (currentSettings) =>
                this.buildStartupSettingsStatusFromSnapshot(currentSettings),
        });
        SincroAppController.setCurrent(this);
        this.bindUiSubscriptions();
        bindSincroAppControllerWindowEvents({
            lookingGlassTracker: this.lookingGlassTracker,
            emitEvent: (event) => this.emitEvent(event),
            openDialog: () => this.dialog.open(),
        });
    }

    // Static active controller registry API
    // React側が「今アクティブなページの AppController」を購読するための入口。
    static getCurrent(): SincroAppController | undefined {
        return SincroAppController.activeRegistry.getCurrent();
    }

    // MPAページ切り替えや initializer 差し替えを考慮し、active controller の変化も購読可能にする。
    static subscribeCurrent(
        listener: (controller: SincroAppController | undefined) => void,
    ): () => void {
        return SincroAppController.activeRegistry.subscribe(listener);
    }

    // Public runtime subscription API
    subscribe(listener: (event: SincroAppEvent) => void): () => void {
        // 購読直後にスナップショットを送ることで、React 側は初回描画時の「空状態」を減らせる。
        const unsubscribe = this.eventHub.subscribe(listener);
        emitSincroAppControllerInitialSnapshot({
            listener,
            lifecycleState: this.lifecycleState,
            startupSettingsCapabilities: this.startupSettingsCapabilities,
            settingsRelatedPayloadCache: this.settingsRelatedPayloadCache,
            getUiStateSnapshot: () => this.getUiStateSnapshot(),
            getLookingGlassState: () => this.lookingGlassTracker.getState(),
            getLookingGlassConfigStatus: () => this.lookingGlassTracker.getConfigStatus(),
            buildConnectionStateEvent: () =>
                buildSincroAppControllerConnectionStateEvent({
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

    // Public state snapshot API
    getSettingsSnapshot(): SincroAppSettingsSnapshot {
        return buildSincroAppSettingsSnapshot(this.runtime.dialogManager);
    }

    getSettingsUiState(): SincroAppSettingsUiState {
        return this.getUiStateSnapshot().settingsUiState;
    }

    getSettingsUiHints(): SincroAppSettingsUiHints {
        return this.getUiStateSnapshot().settingsUiHints;
    }

    getDialogUiState(): SincroAppDialogUiState {
        return this.getUiStateSnapshot().dialogUiState;
    }

    getDialogVrmUiState(): SincroAppDialogVrmUiState {
        return this.getUiStateSnapshot().dialogVrmUiState;
    }

    getStartupSettingsStatus(): SincroAppStartupSettingsStatus {
        return this.buildStartupSettingsStatusFromSnapshot(this.getSettingsSnapshot());
    }

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

    applySettings(partial: Partial<SincroAppSettingsSnapshot>): void {
        applySincroAppControllerSettings({
            dialogManager: this.runtime.dialogManager,
            partial,
            settingsRelatedPayloadCache: this.settingsRelatedPayloadCache,
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

    // constructor の見通しを維持するため、singleton取得 + bridge組み立て + bind をここへ集約する。
    private initializeRuntime(): SincroAppControllerRuntimeBundle {
        return createSincroAppRuntimeBundle({
            stopRTC: () => this.stopRTC(),
            getSettingsSnapshot: () => this.getSettingsSnapshot(),
            getSettingsUiState: () => this.getSettingsUiState(),
            getSettingsUiHints: () => this.getSettingsUiHints(),
            getDialogUiState: () => this.getDialogUiState(),
            getDialogVrmUiState: () => this.getDialogVrmUiState(),
            getStartupSettingsStatus: () => this.getStartupSettingsStatus(),
            getTelopTextSegmentsSnapshot: () => this.getTelopTextSegmentsSnapshot(),
        });
    }

    private bindUiSubscriptions(): void {
        // singleton manager / service 群を機能別に購読し、AppController 統一イベントへ正規化する。
        bindSincroAppControllerSubscriptions({
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
        this.settingsRelatedPayloadCache.withCache(() => {
            emitSincroAppSettingsRelatedSnapshots(
                (event) => this.emitEvent(event),
                this.settingsRelatedPayloadCache.build(),
            );
        });
    }

    // DialogManager 由来の UI状態はまとめて取得し、同一タイミングでの整合を取りやすくする。
    private getUiStateSnapshot() {
        // dialog/settings UI 状態はまとめて取得し、同一時点の整合を取りやすくする。
        return buildSincroAppUiStateSnapshot(this.runtime.dialogManager);
    }

    private static setCurrent(controller: SincroAppController | undefined): void {
        // active controller の static 購読は React mount 後の attach 判定に使われる。
        SincroAppController.activeRegistry.setCurrent(controller);
    }

    // ICE/signaling/lifecycle の保持状態から UI向け connection_state を導出して通知する。
    private emitDerivedConnectionState(): void {
        emitSincroAppControllerConnectionState((event) => this.emitEvent(event), {
            lifecycleState: this.lifecycleState,
            iceConnectionState: this.iceConnectionState,
            signalingState: this.signalingState,
        });
    }
}
