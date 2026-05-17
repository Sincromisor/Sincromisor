import type { TalkManager } from "../RTC/TalkManager";
import type { SincroController } from "../SincroController";
import type { ChatMessageService } from "../UI/ChatMessageService";
import type { DebugConsoleManager } from "../UI/DebugConsoleManager";
import type { DialogManager } from "../UI/DialogManager";
import type { PopMessageService } from "../UI/PopMessageService";
import { SincroAppActiveControllerRegistry } from "./SincroAppActiveControllerRegistry";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./SincroAppBridges";
import { buildSincroAppConnectionStateEvent } from "./SincroAppConnectionState";
import {
    createSincroAppRuntimeBundle,
    type SincroAppControllerRuntimeBundle,
} from "./SincroAppControllerRuntime";
import {
    emitSincroAppConnectionState,
    emitSincroAppLifecycle,
    emitSincroAppSettingsApplyEvents,
    emitSincroAppSettingsRelatedSnapshots,
} from "./SincroAppEmitHelpers";
import { SincroAppEventHub } from "./SincroAppEventHub";
import {
    emitLookingGlassConfigStatus,
    handleLookingGlassConfigUpdatedFlow,
    handleLookingGlassStateFlow,
} from "./SincroAppLookingGlassEventFlow";
import { SincroAppLookingGlassStateTracker } from "./SincroAppLookingGlassStateTracker";
import {
    bindChatServiceSubscription,
    bindDebugManagerSubscription,
    bindDialogManagerSubscriptions,
    bindPopServiceSubscription,
    bindTalkManagerSubscription,
} from "./SincroAppManagerSubscriptionBinder";
import { applySincroAppSettingsPartial } from "./SincroAppSettingsApply";
import type { SincroAppSettingsRelatedSnapshotPayload } from "./SincroAppSettingsRelatedSnapshotBuilder";
import { buildSincroAppSettingsRelatedSnapshotPayload } from "./SincroAppSettingsRelatedSnapshotBuilder";
import { buildSincroAppSettingsSnapshot } from "./SincroAppSettingsSnapshotBuilder";
import {
    buildStartupSettingsStatus,
    type SincroAppStartupAppliedSettings,
} from "./SincroAppStartupSettings";
import { emitSincroAppInitialSnapshot } from "./SincroAppSubscriptionSnapshot";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppLookingGlassConfigUpdatedEventDetail,
    SincroAppLookingGlassEventDetail,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartHooks,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./SincroAppTypes";
import { buildSincroAppUiStateSnapshot } from "./SincroAppUiStateSnapshotBuilder";
import { bindSincroAppWindowEvents } from "./SincroAppWindowEventBinder";

export type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./SincroAppBridges";
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
} from "./SincroAppTypes";

// UI層（現行Initializer/将来React）から使うアプリ制御の入口。
// 現段階では既存 SincroController / singleton manager・service 群への統一窓口。
// 型・bridge・判定ロジック・mapper は helper へ分離し、本体は orchestration と状態遷移に集中させる。
export class SincroAppController {
    private static readonly activeRegistry = new SincroAppActiveControllerRegistry();

    private readonly coreController: SincroController;
    private readonly chatMessageService: ChatMessageService;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly talkManager: TalkManager;
    private readonly popMessageService: PopMessageService;
    private readonly dialogManager: DialogManager;
    private readonly eventHub = new SincroAppEventHub();
    private lifecycleState: SincroAppLifecycleState = "idle";
    private iceConnectionState: string = "";
    private signalingState: string = "";
    private beforeStartHook: () => void = () => {};
    private afterStartHook: () => void = () => {};
    private suppressSettingsSnapshotEvent: boolean = false;
    // 同一同期処理中だけ有効な短命キャッシュ。settings 系 snapshot の重複組み立てを避ける。
    private settingsRelatedPayloadCache: SincroAppSettingsRelatedSnapshotPayload | undefined;
    private settingsRelatedPayloadCacheDepth: number = 0;
    private startupAppliedSettings: SincroAppStartupAppliedSettings | undefined;
    private startupSettingsCapabilities: SincroAppStartupSettingsCapabilities = {
        enableTalk: false,
        enableInspector: false,
        enableVR: false,
    };
    private readonly lookingGlassTracker = new SincroAppLookingGlassStateTracker();
    readonly dialogBridge: SincroAppDialogBridge;
    // 呼び出し側では `appController.dialog.*` の方が意図が読み取りやすいため getter を用意する。
    get dialog(): SincroAppDialogBridge {
        return this.dialogBridge;
    }
    // initializer/React からのチャットUI更新をまとめる軽量 bridge。
    // ChatMessageService 直接参照を減らし、UI経路を AppController に集約する。
    readonly chatBridge: SincroAppChatBridge;
    get chat(): SincroAppChatBridge {
        return this.chatBridge;
    }
    // debug UI 側の配線も AppController 経由に寄せ、initializer の manager 直接依存を減らす。
    readonly debugBridge: SincroAppDebugBridge;
    get debug(): SincroAppDebugBridge {
        return this.debugBridge;
    }
    // UI層から見た RTC 操作の窓口。将来的に再接続/状態取得をここへ寄せる想定。
    readonly rtcBridge: SincroAppRtcBridge;
    get rtc(): SincroAppRtcBridge {
        return this.rtcBridge;
    }
    // snapshot getter 群をまとめた読み取り専用 bridge。呼び出し側で API の意図を揃えやすくする。
    readonly stateBridge: SincroAppStateBridge;
    get state(): SincroAppStateBridge {
        return this.stateBridge;
    }

    constructor() {
        // 依存の組み立てが終わる前に購読/イベント登録を始めないよう、初期化順を固定する。
        const runtime = this.initializeRuntime();
        this.chatMessageService = runtime.chatMessageService;
        this.debugConsoleManager = runtime.debugConsoleManager;
        this.talkManager = runtime.talkManager;
        this.popMessageService = runtime.popMessageService;
        this.dialogManager = runtime.dialogManager;
        this.coreController = runtime.coreController;
        this.dialogBridge = runtime.dialogBridge;
        this.chatBridge = runtime.chatBridge;
        this.debugBridge = runtime.debugBridge;
        this.rtcBridge = runtime.rtcBridge;
        this.stateBridge = runtime.stateBridge;
        SincroAppController.setCurrent(this);
        this.bindUiSubscriptions();
        bindSincroAppWindowEvents({
            onLookingGlassState: this.handleLookingGlassStateEvent,
            onLookingGlassConfigUpdated: this.handleLookingGlassConfigUpdated,
            onLookingGlassPolyfillReinitReady: this.handleLookingGlassPolyfillReinitReady,
            onOpenConfigurationDialog: this.handleOpenConfigurationDialogEvent,
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
        this.withSettingsRelatedSnapshotPayloadCache(() => {
            const uiStateSnapshot = this.getUiStateSnapshot();
            const settingsPayload = this.buildSettingsRelatedSnapshotPayload();
            emitSincroAppInitialSnapshot(listener, {
                lifecycleState: this.lifecycleState,
                settings: settingsPayload.settings,
                settingsUiState: settingsPayload.settingsUiState,
                settingsUiHints: settingsPayload.settingsUiHints,
                dialogUiState: uiStateSnapshot.dialogUiState,
                dialogVrmUiState: uiStateSnapshot.dialogVrmUiState,
                startupSettingsStatus: settingsPayload.startupSettingsStatus,
                startupSettingsCapabilities: this.startupSettingsCapabilities,
                lookingGlassState: this.lookingGlassTracker.getState(),
                lookingGlassConfigStatus: this.lookingGlassTracker.getConfigStatus(),
                connectionStateEvent: this.buildConnectionStateEvent(),
            });
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
        this.coreController.start();
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
        this.coreController.stopRTC();
        this.emitLifecycle("stopped");
        this.emitDerivedConnectionState();
    }

    stop(): void {
        this.stopRTC();
    }

    // Public state snapshot API
    getSettingsSnapshot(): SincroAppSettingsSnapshot {
        return buildSincroAppSettingsSnapshot(this.dialogManager);
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
        return this.talkManager.getTelopTextSegmentsSnapshot();
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
        // settings は dialog 設定と Looking Glass runtime config をまたいで更新されるため、
        // 反映後に snapshot/status をまとめて emit して UI の整合を保つ。
        // DialogManager の変更イベントが同期通知を返してくるため、一時的に再入防止する。
        this.suppressSettingsSnapshotEvent = true;
        try {
            applySincroAppSettingsPartial(this.dialogManager, partial);
        } finally {
            this.suppressSettingsSnapshotEvent = false;
        }
        const currentSettingsSnapshot = this.getSettingsSnapshot();
        this.withSettingsRelatedSnapshotPayloadCache(() => {
            const settingsPayload =
                this.buildSettingsRelatedSnapshotPayload(currentSettingsSnapshot);
            emitSincroAppSettingsApplyEvents((event) => this.emitEvent(event), {
                ...settingsPayload,
                lookingGlassConfigStatus: this.lookingGlassTracker.getConfigStatus(),
            });
        }, currentSettingsSnapshot);
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

    private readonly handleLookingGlassStateEvent = (
        event: CustomEvent<SincroAppLookingGlassEventDetail>,
    ): void => {
        // Looking Glass 側の状態変化は React パネルの表示制御（案内文/再読込表示）に使う。
        handleLookingGlassStateFlow({
            tracker: this.lookingGlassTracker,
            detail: event.detail,
            emit: (appEvent) => this.emitEvent(appEvent),
        });
    };

    // LG設定変更（runtime config 更新）を tracker + UI通知に反映する。
    private readonly handleLookingGlassConfigUpdated = (
        event: CustomEvent<SincroAppLookingGlassConfigUpdatedEventDetail>,
    ): void => {
        handleLookingGlassConfigUpdatedFlow({
            tracker: this.lookingGlassTracker,
            detail: event.detail,
            emit: (appEvent) => this.emitEvent(appEvent),
        });
    };

    private readonly handleLookingGlassPolyfillReinitReady = (): void => {
        // 非active時の polyfill 再初期化準備完了後、UIに「nextSession反映」に戻ったことを再通知する。
        emitLookingGlassConfigStatus({
            tracker: this.lookingGlassTracker,
            emit: (appEvent) => this.emitEvent(appEvent),
        });
    };

    // グローバル custom event で起動前 dialog を開く（旧UI/DebugMenu 互換経路）。
    private readonly handleOpenConfigurationDialogEvent = (): void => {
        this.dialog.open();
    };

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

    // singleton manager / service 群の購読を集約する。constructor から直接羅列しないのは読み順維持のため。
    private bindUiSubscriptions(): void {
        // singleton manager / service 群を機能別に購読し、AppController 統一イベントへ正規化する。
        this.bindChatSubscriptions();
        this.bindDebugSubscriptions();
        this.bindTalkSubscriptions();
        this.bindPopSubscriptions();
        this.bindDialogSubscriptions();
    }

    private bindChatSubscriptions(): void {
        // chat 系は service -> app event の 1:1 変換のみなので、その場で emit して順序差分を作らない。
        bindChatServiceSubscription(this.chatMessageService, (event) => this.emitEvent(event));
    }

    private bindDebugSubscriptions(): void {
        // debug 系だけは ICE/signaling の内部状態更新 -> rtc_state emit -> connection_state 再計算の
        // 順序制御が必要なので helper に委譲し、戻り値で保持状態を更新する。
        bindDebugManagerSubscription({
            debugConsoleManager: this.debugConsoleManager,
            emitEvent: (event) => this.emitEvent(event),
            emitDerivedConnectionState: () => this.emitDerivedConnectionState(),
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

    private bindTalkSubscriptions(): void {
        // telop は UI 表示用イベントとして独立配信し、chat 系ログと混ぜない。
        bindTalkManagerSubscription(this.talkManager, (event) => this.emitEvent(event));
    }

    private bindPopSubscriptions(): void {
        // dialog 内通知も AppController 経由に集約し、React 側が PopMessageService を直接参照しない構成へ寄せる。
        bindPopServiceSubscription(this.popMessageService, (event) => this.emitEvent(event));
    }

    private bindDialogSubscriptions(): void {
        // settings 系は snapshot 群をまとめて emit し、UI 側で設定/disabled/hints の整合を取りやすくする。
        // Dialog 固有の見た目状態（開閉/開始ボタン/VRM D&D）も AppController 経由で配信し、React 購読先を一本化する。
        bindDialogManagerSubscriptions({
            dialogManager: this.dialogManager,
            emitEvent: (event) => this.emitEvent(event),
            emitSettingsRelatedSnapshots: () => this.emitSettingsRelatedSnapshots(),
        });
    }

    // settings系 event はまとまって発火させ、UI 側で disabled/hints/snapshot を同一世代として扱えるようにする。
    private emitSettingsRelatedSnapshots(): void {
        if (this.suppressSettingsSnapshotEvent) {
            return;
        }
        this.withSettingsRelatedSnapshotPayloadCache(() => {
            emitSincroAppSettingsRelatedSnapshots(
                (event) => this.emitEvent(event),
                this.buildSettingsRelatedSnapshotPayload(),
            );
        });
    }

    // settings関連 event 群で共通に使う payload を組み立てる。
    // 連続 emit 中は短命 cache を再利用して重複計算を避ける。
    private buildSettingsRelatedSnapshotPayload(settings?: SincroAppSettingsSnapshot) {
        if (this.settingsRelatedPayloadCache) {
            return this.settingsRelatedPayloadCache;
        }
        // 通常経路では毎回最新 snapshot を組み立て、連続 emit 中だけ短命 cache を使う。
        return buildSincroAppSettingsRelatedSnapshotPayload({
            dialogManager: this.dialogManager,
            settings,
            buildStartupSettingsStatus: (currentSettings) =>
                this.buildStartupSettingsStatusFromSnapshot(currentSettings),
        });
    }

    // 同一同期処理の中で settings系 snapshot を複数回使う場合にだけ共有し、
    // 処理を抜けたら必ず破棄して stale cache を残さない。
    private withSettingsRelatedSnapshotPayloadCache<T>(
        run: () => T,
        settings?: SincroAppSettingsSnapshot,
    ): T {
        const shouldSeedCache = this.settingsRelatedPayloadCacheDepth === 0;
        this.settingsRelatedPayloadCacheDepth += 1;
        if (shouldSeedCache) {
            this.settingsRelatedPayloadCache = buildSincroAppSettingsRelatedSnapshotPayload({
                dialogManager: this.dialogManager,
                settings,
                buildStartupSettingsStatus: (currentSettings) =>
                    this.buildStartupSettingsStatusFromSnapshot(currentSettings),
            });
        }
        try {
            return run();
        } finally {
            this.settingsRelatedPayloadCacheDepth -= 1;
            if (this.settingsRelatedPayloadCacheDepth === 0) {
                this.settingsRelatedPayloadCache = undefined;
            }
        }
    }

    // DialogManager 由来の UI状態はまとめて取得し、同一タイミングでの整合を取りやすくする。
    private getUiStateSnapshot() {
        // dialog/settings UI 状態はまとめて取得し、同一時点の整合を取りやすくする。
        return buildSincroAppUiStateSnapshot(this.dialogManager);
    }

    private static setCurrent(controller: SincroAppController | undefined): void {
        // active controller の static 購読は React mount 後の attach 判定に使われる。
        SincroAppController.activeRegistry.setCurrent(controller);
    }

    // ICE/signaling/lifecycle の保持状態から UI向け connection_state を導出して通知する。
    private emitDerivedConnectionState(): void {
        emitSincroAppConnectionState(
            (event) => this.emitEvent(event),
            this.buildConnectionStateEvent(),
        );
    }

    private buildConnectionStateEvent(): SincroAppEvent {
        return buildSincroAppConnectionStateEvent({
            lifecycleState: this.lifecycleState,
            iceConnectionState: this.iceConnectionState,
            signalingState: this.signalingState,
        });
    }
}
