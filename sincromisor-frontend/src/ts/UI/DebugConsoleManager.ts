type AudioMeterHandle = {
    audioContext: AudioContext;
    sourceNode: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    data: Uint8Array;
    frameId: number;
    lowInputFrames: number;
    clippingHoldFrames: number;
    displayLevel: number;
    lastMeterUpdateAt: number;
};

export type AudioFilterControlConfig = {
    highpassHz: number;
    lowpassEnabled: boolean;
    lowpassHz: number;
};
type RuntimeAudioConstraintKey = "autoGainControl" | "noiseSuppression" | "echoCancellation";
type RuntimeAudioConstraintApplyStatus = {
    key: RuntimeAudioConstraintKey;
    enabled: boolean;
    status: "pending" | "applied" | "failed";
    message?: string;
};

export type VadThresholdMode = "manual" | "auto" | "learned";
export type LearnedVadUiReport = {
    status: "idle" | "loading" | "ready" | "running" | "fallback" | "unavailable";
    probability: number | null;
    txFrames?: number;
    rxPredictions?: number;
    message?: string;
};

export type LearnedVadTuningUiConfig = {
    // Speech開始確率の境界。上げると誤反応減、下げると感度増。
    onThreshold: number;
    // Speech終了確率の境界。通常は onThreshold より低く設定する。
    offThreshold: number;
    // Speech状態を維持する保持時間(ms)。
    hangoverMs: number;
    // 推論実行間隔(ms)。短いほど追従性増/負荷増。
    minInferIntervalMs: number;
    // ON/OFF切替に必要な連続フレーム数（UIには露出せず内部プリセットで保持）。
    onConsecutiveFrames: number;
    offConsecutiveFrames: number;
};

export type LearnedVadPerformanceMode = "low_cpu" | "balanced" | "high_accuracy";
export type DebugConsoleManagerEvent =
    | { type: "local_vad_state"; isSpeech: boolean }
    | { type: "learned_vad_state"; report: LearnedVadUiReport }
    | { type: "face_x"; value: number }
    | { type: "face_y"; value: number }
    | { type: "facing"; value: number }
    | { type: "character_eye_status"; watching: boolean }
    | { type: "gaze_target_debug"; message: string }
    | { type: "rtc_event_log"; message: string }
    | { type: "ice_connection_state"; value: string }
    | { type: "signaling_state"; value: string };

export type CharacterGazeTrackingTuningUiConfig = {
    minimumHoldMs: number;
    switchMargin: number;
    relinkDistance: number;
    oneEuroMinCutoff: number;
    oneEuroBeta: number;
    oneEuroDCutoff: number;
    deadband: number;
};

type CharacterGazeTrackingTuningPresetKey = "stable" | "balanced" | "responsive";

const CHARACTER_GAZE_TRACKING_TUNING_PRESETS: Record<CharacterGazeTrackingTuningPresetKey, CharacterGazeTrackingTuningUiConfig> = {
    // 切替頻度を下げて揺れを抑える。複数人前提の展示/固定設置向け。
    stable: {
        minimumHoldMs: 1400,
        switchMargin: 0.22,
        relinkDistance: 0.18,
        oneEuroMinCutoff: 0.8,
        oneEuroBeta: 0.012,
        oneEuroDCutoff: 1.0,
        deadband: 0.0035,
    },
    // 現在の既定値に近い、最も無難なプリセット。
    balanced: {
        minimumHoldMs: 900,
        switchMargin: 0.15,
        relinkDistance: 0.2,
        oneEuroMinCutoff: 1.0,
        oneEuroBeta: 0.02,
        oneEuroDCutoff: 1.0,
        deadband: 0.0025,
    },
    // 追従性を優先。動きの多い場面向け（やや揺れやすくなる）。
    responsive: {
        minimumHoldMs: 450,
        switchMargin: 0.08,
        relinkDistance: 0.24,
        oneEuroMinCutoff: 1.4,
        oneEuroBeta: 0.04,
        oneEuroDCutoff: 1.0,
        deadband: 0.0015,
    },
};

// 既存デバッグUIのDOM更新と、React Control Panel向けの診断イベント配信を兼ねる管理クラス。
// 移行期間中は DebugConsole 自体を維持しつつ、React 側へ状態を橋渡しする役割を持つ。
export class DebugConsoleManager {
    private static instance: DebugConsoleManager;
    private static readonly EVENT_LOG_LINES = 80;
    private static readonly CHANNEL_LOG_LINES = 30;
    private static readonly TREND_POINTS = 60;
    private static readonly AUDIO_CLIP_THRESHOLD = 0.98;
    private static readonly AUDIO_LOW_INPUT_THRESHOLD = 0.015;
    private static readonly AUDIO_LOW_INPUT_HOLD_FRAMES = 120;
    private static readonly AUDIO_CLIP_HOLD_FRAMES = 30;
    private static readonly AUDIO_WARNING_SWITCH_HOLD_FRAMES = 18;
    private static readonly AUDIO_METER_UPDATE_INTERVAL_MS = 80;

    private readonly debugConsoleContainer: HTMLDivElement | null;
    private readonly debugConsoleRoot: HTMLDivElement | null;
    private readonly debugMenu: HTMLDivElement | null;
    private readonly debugMenuButton: HTMLButtonElement | null;
    private readonly debugMenuPanel: HTMLDivElement | null;
    private readonly debugConsoleToggleButton: HTMLButtonElement | null;
    private readonly debugConsoleCloseButton: HTMLButtonElement | null;
    private readonly rtcStopButton: HTMLButtonElement | null;
    private readonly reactSettingsPanelContainer: HTMLDivElement | null;
    private readonly reactSettingsPanelRoot: HTMLDivElement | null;
    private readonly reactSettingsPanelToggleButton: HTMLButtonElement | null;
    private readonly reactSettingsPanelCloseButton: HTMLButtonElement | null;
    private readonly debugTabButtons: NodeListOf<HTMLButtonElement>;
    private readonly debugPanels: NodeListOf<HTMLElement>;

    /* RTC */
    private readonly telopChannelLog: HTMLPreElement | null;
    private readonly textChannelLog: HTMLPreElement | null;
    private readonly rtcEventLog: HTMLPreElement | null;
    private readonly iceConnectionLog: HTMLSpanElement | null;
    private readonly iceGatheringLog: HTMLSpanElement | null;
    private readonly signalingLog: HTMLSpanElement | null;
    private readonly offerSDPLog: HTMLPreElement | null;
    private readonly answerSDPLog: HTMLPreElement | null;
    private readonly metricElements: Record<string, HTMLElement | null>;
    private readonly trendPolylines: Record<string, SVGPolylineElement | null>;
    private readonly trendSeries: Record<string, number[]> = {};
    private readonly trendMaxValues: Record<string, number> = {
        trendOutboundAudioBitrate: 256000, // 256 kbps
        trendInboundAudioBitrate: 256000, // 256 kbps
        trendRoundTripTime: 200, // 200 ms
        trendInboundPacketLossRate: 5, // 5%
    };

    /* CharacterGaze */
    private readonly faceXLog: HTMLElement | null;
    private readonly faceYLog: HTMLElement | null;
    private readonly facing: HTMLElement | null;
    private readonly characterGazeStatus: HTMLElement | null;
    private readonly characterGazeTargetDebug: HTMLElement | null;
    private readonly gazeHoldMsInput: HTMLInputElement | null;
    private readonly gazeSwitchMarginInput: HTMLInputElement | null;
    private readonly gazeRelinkDistanceInput: HTMLInputElement | null;
    private readonly gazeOneEuroMinCutoffInput: HTMLInputElement | null;
    private readonly gazeOneEuroBetaInput: HTMLInputElement | null;
    private readonly gazeDeadbandInput: HTMLInputElement | null;
    private readonly gazeTrackingPresetButtons: NodeListOf<HTMLButtonElement>;

    /* Audio meter */
    private readonly localAudioLevelMeter: HTMLElement | null;
    private readonly remoteAudioLevelMeter: HTMLElement | null;
    private readonly localAudioLevelValue: HTMLElement | null;
    private readonly remoteAudioLevelValue: HTMLElement | null;
    private readonly localAudioRmsValue: HTMLElement | null;
    private readonly localAudioPeakValue: HTMLElement | null;
    private readonly localAudioVadValue: HTMLElement | null;
    private readonly localVadEngineValue: HTMLElement | null;
    private readonly localVadProbValue: HTMLElement | null;
    private readonly localVadModelStateValue: HTMLElement | null;
    private readonly localVadFramesValue: HTMLElement | null;
    private readonly localAudioWarning: HTMLElement | null;
    private readonly localAudioConstraintStatus: HTMLElement | null;
    private readonly localAudioHighpassCutoffInput: HTMLInputElement | null;
    private readonly localAudioHighpassCutoffValue: HTMLElement | null;
    private readonly localAudioLowpassEnabledInput: HTMLInputElement | null;
    private readonly localAudioLowpassCutoffInput: HTMLInputElement | null;
    private readonly localAudioLowpassCutoffValue: HTMLElement | null;
    private readonly localVadLearnedEnabledInput: HTMLInputElement | null;
    private readonly localVadLearnedPerformanceModeSelect: HTMLSelectElement | null;
    private readonly localVadLearnedOnThresholdInput: HTMLInputElement | null;
    private readonly localVadLearnedOnThresholdValue: HTMLElement | null;
    private readonly localVadLearnedOffThresholdInput: HTMLInputElement | null;
    private readonly localVadLearnedOffThresholdValue: HTMLElement | null;
    private readonly localVadLearnedHangoverMsInput: HTMLInputElement | null;
    private readonly localVadLearnedHangoverMsValue: HTMLElement | null;
    private readonly localVadLearnedInferIntervalMsInput: HTMLInputElement | null;
    private readonly localVadLearnedInferIntervalMsValue: HTMLElement | null;
    private readonly localVadLearnedStrictModeInput: HTMLInputElement | null;
    private readonly localVadThresholdAutoEnabledInput: HTMLInputElement | null;
    private readonly localVadRmsThresholdInput: HTMLInputElement | null;
    private readonly localVadRmsThresholdValue: HTMLElement | null;
    private readonly localVadRmsPresetButtons: NodeListOf<HTMLButtonElement>;
    private localAudioMeterHandle: AudioMeterHandle | null = null;
    private remoteAudioMeterHandle: AudioMeterHandle | null = null;
    private localAudioWarningState: "ok" | "silent" | "error" = "ok";
    private localAudioWarningPendingState: "ok" | "silent" | "error" = "ok";
    private localAudioWarningPendingFrames: number = 0;
    private readonly localAudioConstraintApplyState: Partial<Record<RuntimeAudioConstraintKey, RuntimeAudioConstraintApplyStatus>> = {};
    private onLocalAudioFilterChange: (config: AudioFilterControlConfig) => void = () => { };
    private onLocalLearnedVadTuningChange: (config: LearnedVadTuningUiConfig) => void = () => { };
    private onLocalLearnedVadPerformanceModeChange: (mode: LearnedVadPerformanceMode) => void = () => { };
    private onLocalLearnedVadStrictModeChange: (enabled: boolean) => void = () => { };
    private onLocalVadThresholdModeChange: (mode: VadThresholdMode) => void = () => { };
    private onLocalVadRmsThresholdChange: (threshold: number) => void = () => { };
    private onCharacterGazeTrackingTuningChange: (config: CharacterGazeTrackingTuningUiConfig) => void = () => { };
    // 連続フレーム条件はプリセット依存のため内部保持し、UIスライダー更新時に合わせて渡す。
    private learnedVadOnConsecutiveFrames: number = 2;
    private learnedVadOffConsecutiveFrames: number = 2;
    private readonly listeners = new Set<(event: DebugConsoleManagerEvent) => void>();

    // シングルトンインスタンスを返す。
    static getManager(): DebugConsoleManager {
        if (!DebugConsoleManager.instance) {
            DebugConsoleManager.instance = new DebugConsoleManager();
        }
        return DebugConsoleManager.instance;
    }

    // デバッグUI要素を取得し、イベントハンドラの初期化を行う。
    private constructor() {
        this.debugConsoleContainer = document.querySelector("div#sincroDebugConsoleContainer");
        this.debugConsoleRoot = document.querySelector("div#debugConsole");
        this.debugMenu = document.querySelector("div#debugMenu");
        this.debugMenuButton = document.querySelector("button#debugMenuButton");
        this.debugMenuPanel = document.querySelector("div#debugMenuPanel");
        this.debugConsoleToggleButton = document.querySelector("button#debugConsoleToggle");
        this.debugConsoleCloseButton = document.querySelector("button#debugConsoleClose");
        this.rtcStopButton = document.querySelector("button#rtcStop");
        this.reactSettingsPanelContainer = document.querySelector("div#sincroReactSettingsPanelContainer");
        this.reactSettingsPanelRoot = document.querySelector("div#reactSettingsPanel");
        this.reactSettingsPanelToggleButton = document.querySelector("button#reactSettingsPanelToggle");
        this.reactSettingsPanelCloseButton = document.querySelector("button#reactSettingsPanelClose");
        this.debugTabButtons = document.querySelectorAll("button[data-debug-tab]");
        this.debugPanels = document.querySelectorAll("[data-debug-panel]");

        /* RTC */
        this.telopChannelLog = document.querySelector("pre#telopChannel");
        this.textChannelLog = document.querySelector("pre#textChannel");
        this.rtcEventLog = document.querySelector("pre#rtcEventLog");
        this.iceConnectionLog = document.querySelector("span#iceConnectionState");
        this.iceGatheringLog = document.querySelector("span#iceGatheringState");
        this.signalingLog = document.querySelector("span#signalingState");
        this.offerSDPLog = document.querySelector("pre#offerSDP");
        this.answerSDPLog = document.querySelector("pre#answerSDP");
        this.metricElements = {
            rtcRoundTripTime: document.querySelector("#rtcRoundTripTime"),
            rtcAvailableOutgoingBitrate: document.querySelector("#rtcAvailableOutgoingBitrate"),
            rtcCandidatePair: document.querySelector("#rtcCandidatePair"),
            rtcTransportProtocol: document.querySelector("#rtcTransportProtocol"),
            rtcLocalCandidate: document.querySelector("#rtcLocalCandidate"),
            rtcRemoteCandidate: document.querySelector("#rtcRemoteCandidate"),
            outboundAudioBitrate: document.querySelector("#outboundAudioBitrate"),
            inboundAudioBitrate: document.querySelector("#inboundAudioBitrate"),
            outboundPacketsSent: document.querySelector("#outboundPacketsSent"),
            inboundPacketsLost: document.querySelector("#inboundPacketsLost"),
            inboundPacketLossRate: document.querySelector("#inboundPacketLossRate"),
            inboundJitter: document.querySelector("#inboundJitter"),
        };
        this.trendPolylines = {
            trendOutboundAudioBitrate: document.querySelector("#trendOutboundAudioBitrate polyline"),
            trendInboundAudioBitrate: document.querySelector("#trendInboundAudioBitrate polyline"),
            trendRoundTripTime: document.querySelector("#trendRoundTripTime polyline"),
            trendInboundPacketLossRate: document.querySelector("#trendInboundPacketLossRate polyline"),
        };

        /* CharacterGaze */
        this.faceXLog = document.querySelector("dd#faceX");
        this.faceYLog = document.querySelector("dd#faceY");
        this.facing = document.querySelector("dd#facing");
        this.characterGazeStatus = document.querySelector("dd#characterGazeStatus");
        this.characterGazeTargetDebug = document.querySelector("dd#characterGazeTargetDebug");
        this.gazeHoldMsInput = document.querySelector("#gazeHoldMs");
        this.gazeSwitchMarginInput = document.querySelector("#gazeSwitchMargin");
        this.gazeRelinkDistanceInput = document.querySelector("#gazeRelinkDistance");
        this.gazeOneEuroMinCutoffInput = document.querySelector("#gazeOneEuroMinCutoff");
        this.gazeOneEuroBetaInput = document.querySelector("#gazeOneEuroBeta");
        this.gazeDeadbandInput = document.querySelector("#gazeDeadband");
        this.gazeTrackingPresetButtons = document.querySelectorAll("button[data-gaze-tuning-preset]");

        /* Audio meter */
        this.localAudioLevelMeter = document.querySelector("#localAudioLevelMeter");
        this.remoteAudioLevelMeter = document.querySelector("#remoteAudioLevelMeter");
        this.localAudioLevelValue = document.querySelector("#localAudioLevelValue");
        this.remoteAudioLevelValue = document.querySelector("#remoteAudioLevelValue");
        this.localAudioRmsValue = document.querySelector("#localAudioRmsValue");
        this.localAudioPeakValue = document.querySelector("#localAudioPeakValue");
        this.localAudioVadValue = document.querySelector("#localAudioVadValue");
        this.localVadEngineValue = document.querySelector("#localVadEngineValue");
        this.localVadProbValue = document.querySelector("#localVadProbValue");
        this.localVadModelStateValue = document.querySelector("#localVadModelStateValue");
        this.localVadFramesValue = document.querySelector("#localVadFramesValue");
        this.localAudioWarning = document.querySelector("#localAudioWarning");
        this.localAudioConstraintStatus = document.querySelector("#localAudioConstraintStatus");
        this.localAudioHighpassCutoffInput = document.querySelector("#localAudioHighpassCutoff");
        this.localAudioHighpassCutoffValue = document.querySelector("#localAudioHighpassCutoffValue");
        this.localAudioLowpassEnabledInput = document.querySelector("#localAudioLowpassEnabled");
        this.localAudioLowpassCutoffInput = document.querySelector("#localAudioLowpassCutoff");
        this.localAudioLowpassCutoffValue = document.querySelector("#localAudioLowpassCutoffValue");
        this.localVadLearnedEnabledInput = document.querySelector("#localVadLearnedEnabled");
        this.localVadLearnedPerformanceModeSelect = document.querySelector("#localVadLearnedPerformanceMode");
        this.localVadLearnedOnThresholdInput = document.querySelector("#localVadLearnedOnThreshold");
        this.localVadLearnedOnThresholdValue = document.querySelector("#localVadLearnedOnThresholdValue");
        this.localVadLearnedOffThresholdInput = document.querySelector("#localVadLearnedOffThreshold");
        this.localVadLearnedOffThresholdValue = document.querySelector("#localVadLearnedOffThresholdValue");
        this.localVadLearnedHangoverMsInput = document.querySelector("#localVadLearnedHangoverMs");
        this.localVadLearnedHangoverMsValue = document.querySelector("#localVadLearnedHangoverMsValue");
        this.localVadLearnedInferIntervalMsInput = document.querySelector("#localVadLearnedInferIntervalMs");
        this.localVadLearnedInferIntervalMsValue = document.querySelector("#localVadLearnedInferIntervalMsValue");
        this.localVadLearnedStrictModeInput = document.querySelector("#localVadLearnedStrictMode");
        this.localVadThresholdAutoEnabledInput = document.querySelector("#localVadThresholdAutoEnabled");
        this.localVadRmsThresholdInput = document.querySelector("#localVadRmsThreshold");
        this.localVadRmsThresholdValue = document.querySelector("#localVadRmsThresholdValue");
        this.localVadRmsPresetButtons = document.querySelectorAll("button[data-vad-rms-preset]");

        this.setDebugConsoleButtons();
        // 3Dシーン側のポインター制御と干渉しないよう、デバッグUI上のイベントを遮断する。
        this.blockPropagationToSceneControls();
        // 1366px以下ではタブUIで1パネルずつ切り替えるため、常にタブイベントを登録する。
        this.setTabEvents();
        // キーボード運用(PC)向けショートカットは継続しつつ、
        // タブレット向けにはボタン操作でも同等機能を提供する。
        this.setShortcutKeyEvent();
        // モーダル的に扱えるよう、コンソール外クリックで閉じる。
        this.bindOutsideClickClose();
        // AudioWorklet前段のHPF/LPF設定を操作できるようにする。
        this.bindLocalAudioFilterControls();
        // VAD閾値の手動/自動モード切替を設定する。
        this.bindLocalVadThresholdModeControl();
        this.bindLearnedVadPerformanceModeControl();
        // 学習VADチューニング値の変更イベントを登録する。
        this.bindLearnedVadTuningControls();
        this.bindLearnedVadStrictModeControl();
        // VAD閾値スライダーを初期化し、変更時の通知を有効化する。
        this.bindLocalVadThresholdControl();
        // 環境別プリセットをボタンで即時反映できるようにする。
        this.bindLocalVadPresetButtons();
        this.bindCharacterGazeTrackingTuningControls();
        this.bindCharacterGazeTrackingTuningPresetButtons();
        this.updateLearnedVadState({ status: "idle", probability: null });
        this.renderLocalAudioConstraintApplyStatus();
    }

    // React/AppController が購読するイベント口。各 update* 系メソッドの末尾で通知される。
    subscribe(listener: (event: DebugConsoleManagerEvent) => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    // デバッグコンソールを表示状態にする。
    showDebugConsole(): void {
        if (!this.debugConsoleContainer) {
            return;
        }
        // 右側ツール領域では大型 overlay を重ねず、常に片側だけを見せる。
        this.hideReactSettingsPanel();
        this.debugConsoleContainer.classList.add("is-open");
        this.debugConsoleContainer.style.visibility = "visible";
        this.debugConsoleContainer.style.overflow = "visible";
        if (this.debugConsoleToggleButton) {
            this.debugConsoleToggleButton.innerText = "開発者向け診断";
        }
        this.closeDebugMenu();
    }

    // デバッグコンソールを非表示状態にする。
    hideDebugConsole(): void {
        if (!this.debugConsoleContainer) {
            return;
        }
        this.debugConsoleContainer.classList.remove("is-open");
        this.debugConsoleContainer.style.visibility = "hidden";
        this.debugConsoleContainer.style.overflow = "hidden";
        if (this.debugConsoleToggleButton) {
            this.debugConsoleToggleButton.innerText = "開発者向け診断";
        }
        this.closeDebugMenu();
    }

    // React設定パネル(現在の Control Panel)を Debug Menu から開く。
    // ページごとの React UI は共通 root にマウントされるため、ここではコンテナ表示だけ切り替える。
    showReactSettingsPanel(): void {
        if (!this.reactSettingsPanelContainer) {
            return;
        }
        // 設定導線を開く時は診断画面を閉じ、同じツール領域の切替として扱う。
        this.hideDebugConsole();
        this.reactSettingsPanelContainer.classList.add("is-open");
        this.reactSettingsPanelContainer.style.visibility = "visible";
        if (this.reactSettingsPanelToggleButton) {
            this.reactSettingsPanelToggleButton.innerText = "設定";
        }
        this.closeDebugMenu();
    }

    // Debug Console 上の RTC Stop ボタンに停止処理を接続する。
    // 起動前 dialog の責務と分離し、DialogManager が debug UI のボタンを持たない構成へ寄せる。
    setRTCStopButtonEventListener(stopFunction: () => void): void {
        if (!this.rtcStopButton) {
            throw new Error("button#rtcStop is not found.");
        }
        this.rtcStopButton.addEventListener("click", stopFunction);
    }

    // React設定パネルを非表示状態にする。
    hideReactSettingsPanel(): void {
        if (!this.reactSettingsPanelContainer) {
            return;
        }
        this.reactSettingsPanelContainer.classList.remove("is-open");
        this.reactSettingsPanelContainer.style.visibility = "hidden";
        if (this.reactSettingsPanelToggleButton) {
            this.reactSettingsPanelToggleButton.innerText = "設定";
        }
        this.closeDebugMenu();
    }

    // 現在の表示状態に応じて設定パネル表示をトグルする。
    private toggleReactSettingsPanel(): void {
        if (!this.reactSettingsPanelContainer) {
            return;
        }
        if (this.reactSettingsPanelContainer.classList.contains("is-open")) {
            this.hideReactSettingsPanel();
            return;
        }
        this.showReactSettingsPanel();
    }

    // 現在の表示状態に応じてコンソール表示をトグルする。
    private toggleDebugConsole(): void {
        if (!this.debugConsoleContainer) {
            return;
        }
        if (this.debugConsoleContainer.classList.contains("is-open")) {
            this.hideDebugConsole();
            return;
        }
        this.showDebugConsole();
    }

    // メニュー/開閉ボタン類のクリックイベントを登録する。
    private setDebugConsoleButtons(): void {
        if (this.debugMenuButton) {
            this.blockPointerEvent(this.debugMenuButton);
            this.debugMenuButton.addEventListener("click", () => {
                if (this.debugMenu?.classList.contains("is-open")) {
                    this.closeDebugMenu();
                } else {
                    this.openDebugMenu();
                }
            });
        }
        if (this.debugConsoleToggleButton) {
            this.blockPointerEvent(this.debugConsoleToggleButton);
            this.debugConsoleToggleButton.addEventListener("click", () => {
                this.toggleDebugConsole();
            });
        }
        if (this.debugConsoleCloseButton) {
            this.blockPointerEvent(this.debugConsoleCloseButton);
            this.debugConsoleCloseButton.addEventListener("click", () => {
                this.hideDebugConsole();
            });
        }
        if (this.reactSettingsPanelToggleButton) {
            this.blockPointerEvent(this.reactSettingsPanelToggleButton);
            this.reactSettingsPanelToggleButton.addEventListener("click", () => {
                this.toggleReactSettingsPanel();
            });
        }
        if (this.reactSettingsPanelCloseButton) {
            this.blockPointerEvent(this.reactSettingsPanelCloseButton);
            this.reactSettingsPanelCloseButton.addEventListener("click", () => {
                this.hideReactSettingsPanel();
            });
        }
        this.bindDocumentMenuClose();
    }

    // 右上のデバッグメニューを開く。
    private openDebugMenu(): void {
        if (!this.debugMenu || !this.debugMenuButton || !this.debugMenuPanel) {
            return;
        }
        this.debugMenu.classList.add("is-open");
        this.debugMenuButton.setAttribute("aria-expanded", "true");
        this.debugMenuPanel.setAttribute("aria-hidden", "false");
    }

    // 右上のデバッグメニューを閉じる。
    private closeDebugMenu(): void {
        if (!this.debugMenu || !this.debugMenuButton || !this.debugMenuPanel) {
            return;
        }
        this.debugMenu.classList.remove("is-open");
        this.debugMenuButton.setAttribute("aria-expanded", "false");
        this.debugMenuPanel.setAttribute("aria-hidden", "true");
    }

    // メニュー外クリックでデバッグメニューを閉じる。
    private bindDocumentMenuClose(): void {
        document.addEventListener("click", (event) => {
            if (!this.debugMenu) {
                return;
            }
            const target = event.target as Node | null;
            if (target && this.debugMenu.contains(target)) {
                return;
            }
            this.closeDebugMenu();
        });
    }

    // コンソール外クリックでコンソール全体を閉じる。
    private bindOutsideClickClose(): void {
        document.addEventListener(
            "click",
            (event) => {
                if (!this.debugConsoleContainer || !this.debugConsoleRoot) {
                    // debug console が無いページでも設定パネル外クリック閉じは有効にする
                }
                const target = event.target as Node | null;
                if (!target) {
                    return;
                }
                if (
                    this.debugConsoleContainer &&
                    this.debugConsoleRoot &&
                    this.debugConsoleContainer.classList.contains("is-open")
                ) {
                    if (this.debugConsoleRoot.contains(target)) {
                        return;
                    }
                    if (this.debugMenu && this.debugMenu.contains(target)) {
                        return;
                    }
                    // コンソール外かつメニュー外のクリックのみ閉じる。
                    this.hideDebugConsole();
                    return;
                }
                if (
                    this.reactSettingsPanelContainer &&
                    this.reactSettingsPanelRoot &&
                    this.reactSettingsPanelContainer.classList.contains("is-open")
                ) {
                    if (this.reactSettingsPanelRoot.contains(target)) {
                        return;
                    }
                    if (this.debugMenu && this.debugMenu.contains(target)) {
                        return;
                    }
                    // 設定パネル外かつメニュー外のクリックのみ閉じる。
                    this.hideReactSettingsPanel();
                }
            },
            { capture: true },
        );
    }

    // 指定要素上のポインターイベント伝播を止める。
    private blockPointerEvent(element: HTMLElement): void {
        const stop = (event: Event): void => {
            event.stopPropagation();
        };
        // Use bubble phase so target controls (buttons/tabs) still receive events.
        element.addEventListener("pointerdown", stop);
        element.addEventListener("pointerup", stop);
        element.addEventListener("touchstart", stop);
        element.addEventListener("touchend", stop);
        element.addEventListener("mousedown", stop);
        element.addEventListener("mouseup", stop);
        element.addEventListener("wheel", stop);
        element.addEventListener("click", stop);
    }

    // デバッグコンソール上のイベントが3Dシーンへ伝播しないようにする。
    private blockPropagationToSceneControls(): void {
        if (this.debugConsoleRoot) {
            this.blockPointerEvent(this.debugConsoleRoot);
        }
        if (this.reactSettingsPanelRoot) {
            this.blockPointerEvent(this.reactSettingsPanelRoot);
        }
    }

    // タブ名に対応するパネルだけを表示状態にする。
    private setActiveTab(tabName: string): void {
        this.debugTabButtons.forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.debugTab === tabName);
        });
        this.debugPanels.forEach((panel) => {
            panel.classList.toggle("is-active", panel.getAttribute("data-debug-panel") === tabName);
        });
    }

    // タブボタンのイベント登録と初期タブ選択を行う。
    private setTabEvents(): void {
        this.debugTabButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const tabName = btn.dataset.debugTab;
                if (!tabName) {
                    return;
                }
                this.setActiveTab(tabName);
            });
        });
        this.setActiveTab("status");
    }

    // キーボードショートカット(Ctrl+Alt+D)を登録する。
    private setShortcutKeyEvent(): void {
        if (!this.debugConsoleContainer) {
            console.error("DebugConsole is not found!");
            return;
        }
        window.addEventListener("keydown", (e) => {
            // macOSのChromeではalt+dでkeyの値がδになる
            if (e.ctrlKey && e.altKey && (e.key == "d" || e.code == "KeyD")) {
                this.toggleDebugConsole();
            }
        });
    }

    // ログ行数上限を超えたテキストを末尾優先で切り詰める。
    private trimTextContent(text: string, lines: number): string {
        return text.split("\n").slice(-lines).join("\n");
    }

    // 指定ログ要素へ追記し、行数上限を維持する。
    private appendLog(logElement: HTMLPreElement | null, msg: string, lines: number): void {
        if (!logElement) {
            return;
        }
        logElement.textContent += msg;
        logElement.textContent = this.trimTextContent(logElement.textContent, lines);
        logElement.scrollTo(0, logElement.scrollHeight);
    }

    // ICE/Signaling状態に応じた表示色クラスを付与する。
    private setStateClass(stateElement: HTMLSpanElement, state: string): void {
        const normalizedState = state.toLowerCase();
        stateElement.classList.remove("state-ok", "state-warn", "state-error");
        if (normalizedState.includes("connected") || normalizedState.includes("completed")) {
            stateElement.classList.add("state-ok");
            return;
        }
        if (normalizedState.includes("checking") || normalizedState.includes("disconnected")) {
            stateElement.classList.add("state-warn");
            return;
        }
        if (normalizedState.includes("failed") || normalizedState.includes("closed")) {
            stateElement.classList.add("state-error");
        }
    }

    // 状態ラベル文字列を更新し、必要なら履歴形式で連結する。
    private updateStateLog(stateElement: HTMLSpanElement | null, state: string, append: boolean): void {
        if (!stateElement) {
            return;
        }
        if (append && stateElement.textContent) {
            stateElement.textContent += ` -> ${state}`;
        } else {
            stateElement.textContent = state;
        }
        this.setStateClass(stateElement, state);
    }

    // オーディオメーターのバー幅と数値を更新する。
    private updateAudioMeter(level: number, meter: HTMLElement | null, valueElement: HTMLElement | null): void {
        if (!meter || !valueElement) {
            return;
        }
        const clampedLevel = Math.max(0, Math.min(1, level));
        meter.style.width = `${(clampedLevel * 100).toFixed(1)}%`;
        valueElement.textContent = `${Math.round(clampedLevel * 100)}%`;
    }

    // Local MicのRMS/Peak数値表示を更新する。
    private updateLocalMicMetrics(rms: number, peak: number): void {
        if (this.localAudioRmsValue) {
            this.localAudioRmsValue.textContent = `${(Math.max(0, Math.min(1, rms)) * 100).toFixed(1)}%`;
        }
        if (this.localAudioPeakValue) {
            this.localAudioPeakValue.textContent = `${(Math.max(0, Math.min(1, peak)) * 100).toFixed(1)}%`;
        }
    }

    // VAD RMS閾値表示を更新する。
    private updateLocalVadThresholdLabel(value: number): void {
        if (!this.localVadRmsThresholdValue) {
            return;
        }
        this.localVadRmsThresholdValue.textContent = `${(Math.max(0, value) * 100).toFixed(1)}%`;
    }

    // HPF/LPFの現在値ラベルを更新する。
    private updateLocalAudioFilterLabels(config: AudioFilterControlConfig): void {
        if (this.localAudioHighpassCutoffValue) {
            this.localAudioHighpassCutoffValue.textContent = `${Math.round(config.highpassHz)}Hz`;
        }
        if (this.localAudioLowpassCutoffValue) {
            this.localAudioLowpassCutoffValue.textContent = `${Math.round(config.lowpassHz)}Hz`;
        }
    }

    // HPF/LPF設定コントロールの入力を監視し、外部へ通知する。
    private bindLocalAudioFilterControls(): void {
        if (!this.localAudioHighpassCutoffInput || !this.localAudioLowpassEnabledInput || !this.localAudioLowpassCutoffInput) {
            return;
        }
        const emit = (): void => {
            const config = this.readLocalAudioFilterConfig();
            this.updateLocalAudioFilterLabels(config);
            this.onLocalAudioFilterChange(config);
        };

        this.updateLocalAudioFilterLabels(this.readLocalAudioFilterConfig());
        this.localAudioHighpassCutoffInput.addEventListener("input", emit);
        this.localAudioLowpassEnabledInput.addEventListener("change", emit);
        this.localAudioLowpassCutoffInput.addEventListener("input", emit);
    }

    // HPF/LPFの現在入力値を読み取って外部へ渡す設定値に変換する。
    private readLocalAudioFilterConfig(): AudioFilterControlConfig {
        const highpassHz = Number.parseFloat(this.localAudioHighpassCutoffInput?.value ?? "120");
        const lowpassEnabled = !!this.localAudioLowpassEnabledInput?.checked;
        const lowpassHz = Number.parseFloat(this.localAudioLowpassCutoffInput?.value ?? "4200");
        return {
            highpassHz: Number.isFinite(highpassHz) ? highpassHz : 120,
            lowpassEnabled,
            lowpassHz: Number.isFinite(lowpassHz) ? lowpassHz : 4200,
        };
    }

    // 学習VADチューニング値表示を更新する。
    private updateLearnedVadTuningLabels(config: LearnedVadTuningUiConfig): void {
        if (this.localVadLearnedOnThresholdValue) {
            this.localVadLearnedOnThresholdValue.textContent = `${config.onThreshold.toFixed(4)}`;
        }
        if (this.localVadLearnedOffThresholdValue) {
            this.localVadLearnedOffThresholdValue.textContent = `${config.offThreshold.toFixed(4)}`;
        }
        if (this.localVadLearnedHangoverMsValue) {
            this.localVadLearnedHangoverMsValue.textContent = `${Math.round(config.hangoverMs)}ms`;
        }
        if (this.localVadLearnedInferIntervalMsValue) {
            this.localVadLearnedInferIntervalMsValue.textContent = `${Math.round(config.minInferIntervalMs)}ms`;
        }
    }

    // 学習VADチューニング入力欄の現在値を読み取る。
    private readLearnedVadTuningConfig(): LearnedVadTuningUiConfig {
        const onThreshold = Number.parseFloat(this.localVadLearnedOnThresholdInput?.value ?? "0.0008");
        const offThreshold = Number.parseFloat(this.localVadLearnedOffThresholdInput?.value ?? "0.0004");
        const hangoverMs = Number.parseFloat(this.localVadLearnedHangoverMsInput?.value ?? "180");
        const minInferIntervalMs = Number.parseFloat(this.localVadLearnedInferIntervalMsInput?.value ?? "80");
        return {
            onThreshold: Number.isFinite(onThreshold) ? onThreshold : 0.0008,
            offThreshold: Number.isFinite(offThreshold) ? offThreshold : 0.0004,
            hangoverMs: Number.isFinite(hangoverMs) ? hangoverMs : 180,
            minInferIntervalMs: Number.isFinite(minInferIntervalMs) ? minInferIntervalMs : 80,
            onConsecutiveFrames: this.learnedVadOnConsecutiveFrames,
            offConsecutiveFrames: this.learnedVadOffConsecutiveFrames,
        };
    }

    // 学習VADの性能プリセット選択変更を監視する。
    private bindLearnedVadPerformanceModeControl(): void {
        if (!this.localVadLearnedPerformanceModeSelect) {
            return;
        }
        this.localVadLearnedPerformanceModeSelect.addEventListener("change", () => {
            const mode = this.localVadLearnedPerformanceModeSelect?.value as LearnedVadPerformanceMode;
            if (mode !== "low_cpu" && mode !== "balanced" && mode !== "high_accuracy") {
                return;
            }
            this.onLocalLearnedVadPerformanceModeChange(mode);
        });
    }

    // 学習VADチューニング入力の変更を監視する。
    private bindLearnedVadTuningControls(): void {
        if (
            !this.localVadLearnedOnThresholdInput
            || !this.localVadLearnedOffThresholdInput
            || !this.localVadLearnedHangoverMsInput
            || !this.localVadLearnedInferIntervalMsInput
        ) {
            return;
        }
        const emit = (): void => {
            const config = this.readLearnedVadTuningConfig();
            this.updateLearnedVadTuningLabels(config);
            this.onLocalLearnedVadTuningChange(config);
        };
        this.updateLearnedVadTuningLabels(this.readLearnedVadTuningConfig());
        this.localVadLearnedOnThresholdInput.addEventListener("input", emit);
        this.localVadLearnedOffThresholdInput.addEventListener("input", emit);
        this.localVadLearnedHangoverMsInput.addEventListener("input", emit);
        this.localVadLearnedInferIntervalMsInput.addEventListener("input", emit);
    }

    private bindLearnedVadStrictModeControl(): void {
        if (!this.localVadLearnedStrictModeInput) {
            return;
        }
        this.localVadLearnedStrictModeInput.addEventListener("change", () => {
            this.onLocalLearnedVadStrictModeChange(!!this.localVadLearnedStrictModeInput?.checked);
        });
    }

    // VAD閾値の手動/自動モード切替を監視する。
    private bindLocalVadThresholdModeControl(): void {
        if (!this.localVadThresholdAutoEnabledInput || !this.localVadLearnedEnabledInput) {
            return;
        }
        this.localVadLearnedEnabledInput.addEventListener("change", () => {
            const mode: VadThresholdMode = this.localVadLearnedEnabledInput?.checked
                ? "learned"
                : (this.localVadThresholdAutoEnabledInput?.checked ? "auto" : "manual");
            this.setLocalVadThresholdMode(mode);
            this.onLocalVadThresholdModeChange(mode);
        });
        this.localVadThresholdAutoEnabledInput.addEventListener("change", () => {
            const mode: VadThresholdMode = this.localVadLearnedEnabledInput?.checked
                ? "learned"
                : (this.localVadThresholdAutoEnabledInput?.checked ? "auto" : "manual");
            this.setLocalVadThresholdMode(mode);
            this.onLocalVadThresholdModeChange(mode);
        });
        this.setLocalVadThresholdMode(
            this.localVadLearnedEnabledInput.checked
                ? "learned"
                : (this.localVadThresholdAutoEnabledInput.checked ? "auto" : "manual"),
        );
    }

    // 手動/自動モードに合わせてVAD閾値入力の有効状態を更新する。
    setLocalVadThresholdMode(mode: VadThresholdMode): void {
        const isAuto = mode === "auto";
        const isLearned = mode === "learned";
        const disableManualControls = isAuto || isLearned;
        if (this.localVadLearnedEnabledInput) {
            this.localVadLearnedEnabledInput.checked = isLearned;
        }
        if (this.localVadThresholdAutoEnabledInput) {
            this.localVadThresholdAutoEnabledInput.checked = isAuto;
            this.localVadThresholdAutoEnabledInput.disabled = isLearned;
        }
        if (this.localVadRmsThresholdInput) {
            this.localVadRmsThresholdInput.disabled = disableManualControls;
        }
        this.localVadRmsPresetButtons.forEach((button) => {
            button.disabled = disableManualControls;
        });
        const learnedControlsDisabled = !isLearned;
        if (this.localVadLearnedOnThresholdInput) {
            this.localVadLearnedOnThresholdInput.disabled = learnedControlsDisabled;
        }
        if (this.localVadLearnedOffThresholdInput) {
            this.localVadLearnedOffThresholdInput.disabled = learnedControlsDisabled;
        }
        if (this.localVadLearnedHangoverMsInput) {
            this.localVadLearnedHangoverMsInput.disabled = learnedControlsDisabled;
        }
        if (this.localVadLearnedInferIntervalMsInput) {
            this.localVadLearnedInferIntervalMsInput.disabled = learnedControlsDisabled;
        }
        if (this.localVadLearnedStrictModeInput) {
            this.localVadLearnedStrictModeInput.disabled = learnedControlsDisabled;
        }
        if (this.localVadEngineValue) {
            this.localVadEngineValue.textContent = isLearned ? "Silero" : (isAuto ? "Auto RMS" : "RMS");
        }
    }

    // VAD閾値モード変更の通知先を登録する。
    setLocalVadThresholdModeChangeCallback(callback: (mode: VadThresholdMode) => void): void {
        this.onLocalVadThresholdModeChange = callback;
    }

    // 学習VADチューニング変更の通知先を登録する。
    setLocalLearnedVadTuningChangeCallback(callback: (config: LearnedVadTuningUiConfig) => void): void {
        this.onLocalLearnedVadTuningChange = callback;
    }

    // 外部から学習VADチューニングをUIへ反映する。
    setLocalLearnedVadTuning(config: LearnedVadTuningUiConfig): void {
        this.learnedVadOnConsecutiveFrames = Math.max(1, Math.round(config.onConsecutiveFrames));
        this.learnedVadOffConsecutiveFrames = Math.max(1, Math.round(config.offConsecutiveFrames));
        if (this.localVadLearnedOnThresholdInput) {
            this.localVadLearnedOnThresholdInput.value = config.onThreshold.toFixed(4);
        }
        if (this.localVadLearnedOffThresholdInput) {
            this.localVadLearnedOffThresholdInput.value = config.offThreshold.toFixed(4);
        }
        if (this.localVadLearnedHangoverMsInput) {
            this.localVadLearnedHangoverMsInput.value = `${Math.round(config.hangoverMs)}`;
        }
        if (this.localVadLearnedInferIntervalMsInput) {
            this.localVadLearnedInferIntervalMsInput.value = `${Math.round(config.minInferIntervalMs)}`;
        }
        this.updateLearnedVadTuningLabels(config);
    }

    // 外部から学習VAD性能プリセット選択値をUIへ反映する。
    setLocalLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        if (!this.localVadLearnedPerformanceModeSelect) {
            return;
        }
        this.localVadLearnedPerformanceModeSelect.value = mode;
    }

    // 学習VAD性能プリセット変更時の通知先を登録する。
    setLocalLearnedVadPerformanceModeChangeCallback(
        callback: (mode: LearnedVadPerformanceMode) => void,
    ): void {
        this.onLocalLearnedVadPerformanceModeChange = callback;
    }

    setLocalLearnedVadStrictMode(enabled: boolean): void {
        if (!this.localVadLearnedStrictModeInput) {
            return;
        }
        this.localVadLearnedStrictModeInput.checked = enabled;
    }

    setLocalLearnedVadStrictModeChangeCallback(callback: (enabled: boolean) => void): void {
        this.onLocalLearnedVadStrictModeChange = callback;
    }

    // 外部からHPF/LPF設定値をUIへ反映する（初期同期用）。
    setLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        if (this.localAudioHighpassCutoffInput) {
            this.localAudioHighpassCutoffInput.value = `${Math.round(config.highpassHz)}`;
        }
        if (this.localAudioLowpassEnabledInput) {
            this.localAudioLowpassEnabledInput.checked = config.lowpassEnabled;
        }
        if (this.localAudioLowpassCutoffInput) {
            this.localAudioLowpassCutoffInput.value = `${Math.round(config.lowpassHz)}`;
        }
        this.updateLocalAudioFilterLabels(config);
    }

    // HPF/LPF設定変更の通知先を登録する。
    setLocalAudioFilterChangeCallback(callback: (config: AudioFilterControlConfig) => void): void {
        this.onLocalAudioFilterChange = callback;
    }

    // VAD RMS閾値スライダーのイベント登録と初期表示を行う。
    private bindLocalVadThresholdControl(): void {
        if (!this.localVadRmsThresholdInput) {
            return;
        }
        const initial = Number.parseFloat(this.localVadRmsThresholdInput.value);
        this.updateLocalVadThresholdLabel(Number.isFinite(initial) ? initial : 0);
        this.localVadRmsThresholdInput.addEventListener("input", () => {
            const threshold = Number.parseFloat(this.localVadRmsThresholdInput?.value ?? "0");
            if (!Number.isFinite(threshold)) {
                return;
            }
            this.updateLocalVadThresholdLabel(threshold);
            this.onLocalVadRmsThresholdChange(threshold);
        });
    }

    // VAD RMS閾値プリセットボタンのイベントを登録する。
    private bindLocalVadPresetButtons(): void {
        this.localVadRmsPresetButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const preset = Number.parseFloat(button.dataset.vadRmsPreset ?? "");
                if (!Number.isFinite(preset)) {
                    return;
                }
                this.setLocalVadRmsThreshold(preset);
                this.onLocalVadRmsThresholdChange(preset);
            });
        });
    }

    // 外部からVAD RMS閾値を反映する（初期値同期用）。
    setLocalVadRmsThreshold(value: number): void {
        if (!this.localVadRmsThresholdInput) {
            return;
        }
        const clamped = Math.max(0.005, Math.min(0.2, value));
        this.localVadRmsThresholdInput.value = clamped.toFixed(3);
        this.updateLocalVadThresholdLabel(clamped);
    }

    // VAD RMS閾値の変更通知先を登録する。
    setLocalVadRmsThresholdChangeCallback(callback: (threshold: number) => void): void {
        this.onLocalVadRmsThresholdChange = callback;
    }

    // AudioWorklet側VADの判定状態を表示する。
    // React側はこのイベントを受けて Control Panel の VAD 表示へ反映する。
    updateLocalVadState(isSpeech: boolean): void {
        if (!this.localAudioVadValue) {
            this.emitEvent({ type: "local_vad_state", isSpeech });
            return;
        }
        this.localAudioVadValue.textContent = isSpeech ? "Speech" : "Silence";
        this.emitEvent({ type: "local_vad_state", isSpeech });
    }

    // 学習VADのモデル状態と確率表示を更新する。
    updateLearnedVadState(report: LearnedVadUiReport): void {
        if (this.localVadModelStateValue) {
            this.localVadModelStateValue.textContent = report.status;
            this.localVadModelStateValue.title = report.message ?? "";
        }
        if (this.localVadFramesValue) {
            const tx = Number.isFinite(report.txFrames) ? Math.max(0, Math.floor(report.txFrames ?? 0)) : 0;
            const rx = Number.isFinite(report.rxPredictions) ? Math.max(0, Math.floor(report.rxPredictions ?? 0)) : 0;
            this.localVadFramesValue.textContent = `tx:${tx} rx:${rx}`;
        }
        if (this.localVadProbValue) {
            if (report.probability == null || !Number.isFinite(report.probability)) {
                this.localVadProbValue.textContent = "-";
            } else {
                this.localVadProbValue.textContent = `${(Math.max(0, Math.min(1, report.probability)) * 100).toFixed(1)}%`;
            }
        }
        this.emitEvent({ type: "learned_vad_state", report });
    }

    // Local Micの状態表示テキストと色を更新する。
    private updateLocalMicWarning(state: "ok" | "silent" | "error", message: string): void {
        if (!this.localAudioWarning) {
            return;
        }
        this.localAudioWarning.textContent = message;
        this.localAudioWarning.classList.remove("warn", "error", "silent");
        if (state === "silent") {
            this.localAudioWarning.classList.add("silent");
            return;
        }
        if (state === "error") {
            this.localAudioWarning.classList.add("error");
        }
    }

    // NS/EC/AGC の「実行中トラックへの適用結果」を表示する。
    // 起動前設定・Control Panel・Debug Console の設定と実際の挙動差を確認しやすくする目的。
    updateLocalAudioConstraintApplyStatus(report: RuntimeAudioConstraintApplyStatus): void {
        this.localAudioConstraintApplyState[report.key] = report;
        this.renderLocalAudioConstraintApplyStatus();
    }

    private renderLocalAudioConstraintApplyStatus(): void {
        if (!this.localAudioConstraintStatus) {
            return;
        }
        const order: RuntimeAudioConstraintKey[] = ["noiseSuppression", "echoCancellation", "autoGainControl"];
        const labels: Record<RuntimeAudioConstraintKey, string> = {
            noiseSuppression: "NS",
            echoCancellation: "EC",
            autoGainControl: "AGC",
        };
        const text = order.map((key) => {
            const state = this.localAudioConstraintApplyState[key];
            if (!state) {
                return `${labels[key]}:未確認`;
            }
            if (state.status === "pending") {
                return `${labels[key]}:${state.enabled ? "ON" : "OFF"}(次回開始時)`;
            }
            if (state.status === "applied") {
                return `${labels[key]}:${state.enabled ? "ON" : "OFF"}(反映)`;
            }
            return `${labels[key]}:${state.enabled ? "ON" : "OFF"}(未反映)`;
        }).join(" / ");
        this.localAudioConstraintStatus.textContent = text;
        this.localAudioConstraintStatus.title = order
            .map((key) => {
                const state = this.localAudioConstraintApplyState[key];
                if (!state?.message) {
                    return "";
                }
                return `${labels[key]}: ${state.message}`;
            })
            .filter((line) => line.length > 0)
            .join("\n");
        this.localAudioConstraintStatus.classList.remove("state-ok", "state-warn", "state-error");
        const hasFailed = order.some((key) => this.localAudioConstraintApplyState[key]?.status === "failed");
        const hasPending = order.some((key) => this.localAudioConstraintApplyState[key]?.status === "pending");
        if (hasFailed) {
            this.localAudioConstraintStatus.classList.add("state-error");
        } else if (hasPending) {
            this.localAudioConstraintStatus.classList.add("state-warn");
        } else {
            this.localAudioConstraintStatus.classList.add("state-ok");
        }
    }

    // 状態変化のフリッカーを抑えるため、一定継続後に表示状態を切り替える。
    private applyLocalWarningState(nextState: "ok" | "silent" | "error"): void {
        if (nextState === this.localAudioWarningState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 0;
            return;
        }
        if (nextState !== this.localAudioWarningPendingState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 1;
            return;
        }
        this.localAudioWarningPendingFrames += 1;
        if (this.localAudioWarningPendingFrames < DebugConsoleManager.AUDIO_WARNING_SWITCH_HOLD_FRAMES) {
            return;
        }

        this.localAudioWarningState = nextState;
        this.localAudioWarningPendingFrames = 0;
        switch (nextState) {
            case "error":
                this.updateLocalMicWarning("error", "Clipping");
                break;
            case "silent":
                this.updateLocalMicWarning("silent", "Silence");
                break;
            default:
                this.updateLocalMicWarning("ok", "Normal");
        }
    }

    // 音声メーター処理を停止し、関連リソースを解放する。
    private stopAudioMeter(handle: AudioMeterHandle | null, target: "local" | "remote"): void {
        if (!handle) {
            return;
        }
        cancelAnimationFrame(handle.frameId);
        handle.sourceNode.disconnect();
        handle.analyser.disconnect();
        handle.audioContext.close().catch((e) => console.error(e));
        if (target === "local") {
            this.localAudioMeterHandle = null;
            this.updateAudioMeter(0, this.localAudioLevelMeter, this.localAudioLevelValue);
            this.updateLocalMicMetrics(0, 0);
            this.updateLocalVadState(false);
            this.localAudioWarningState = "ok";
            this.localAudioWarningPendingState = "ok";
            this.localAudioWarningPendingFrames = 0;
            this.updateLocalMicWarning("ok", "Normal");
            return;
        }
        this.remoteAudioMeterHandle = null;
        this.updateAudioMeter(0, this.remoteAudioLevelMeter, this.remoteAudioLevelValue);
    }

    // 指定トラックのリアルタイム音量監視を開始する。
    private startAudioMeter(track: MediaStreamTrack, target: "local" | "remote"): void {
        if (typeof window.AudioContext === "undefined") {
            return;
        }
        if (target === "local") {
            this.stopAudioMeter(this.localAudioMeterHandle, "local");
        } else {
            this.stopAudioMeter(this.remoteAudioMeterHandle, "remote");
        }

        const stream = new MediaStream([track]);
        const audioContext = new window.AudioContext();
        const sourceNode = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        sourceNode.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const meter = target === "local" ? this.localAudioLevelMeter : this.remoteAudioLevelMeter;
        const meterValue = target === "local" ? this.localAudioLevelValue : this.remoteAudioLevelValue;

        const loop = (): number => {
            analyser.getByteTimeDomainData(data);
            let squaredSum = 0;
            let peak = 0;
            for (let i = 0; i < data.length; i += 1) {
                const centered = (data[i] - 128) / 128;
                const absCentered = Math.abs(centered);
                squaredSum += centered * centered;
                if (absCentered > peak) {
                    peak = absCentered;
                }
            }
            const rms = Math.sqrt(squaredSum / data.length);
            const now = performance.now();
            const targetLevel = Math.min(1, rms * 4.5);
            handle.displayLevel = handle.displayLevel * 0.82 + targetLevel * 0.18;
            if (
                now - handle.lastMeterUpdateAt >= DebugConsoleManager.AUDIO_METER_UPDATE_INTERVAL_MS
            ) {
                this.updateAudioMeter(handle.displayLevel, meter, meterValue);
                handle.lastMeterUpdateAt = now;
                if (target === "local") {
                    this.updateLocalMicMetrics(rms, peak);
                }
            }
            if (target === "local") {
                if (peak >= DebugConsoleManager.AUDIO_CLIP_THRESHOLD) {
                    handle.clippingHoldFrames = DebugConsoleManager.AUDIO_CLIP_HOLD_FRAMES;
                } else {
                    handle.clippingHoldFrames = Math.max(0, handle.clippingHoldFrames - 1);
                }
                if (rms <= DebugConsoleManager.AUDIO_LOW_INPUT_THRESHOLD) {
                    handle.lowInputFrames += 1;
                } else {
                    handle.lowInputFrames = 0;
                }

                if (handle.clippingHoldFrames > 0) {
                    this.applyLocalWarningState("error");
                } else if (handle.lowInputFrames >= DebugConsoleManager.AUDIO_LOW_INPUT_HOLD_FRAMES) {
                    this.applyLocalWarningState("silent");
                } else {
                    this.applyLocalWarningState("ok");
                }
            }
            return requestAnimationFrame(loop);
        };

        const frameId = requestAnimationFrame(loop);
        const handle: AudioMeterHandle = {
            audioContext,
            sourceNode,
            analyser,
            data,
            frameId,
            lowInputFrames: 0,
            clippingHoldFrames: 0,
            displayLevel: 0,
            lastMeterUpdateAt: 0,
        };
        if (target === "local") {
            this.localAudioMeterHandle = handle;
        } else {
            this.remoteAudioMeterHandle = handle;
        }

        if (audioContext.state === "suspended") {
            audioContext.resume().catch((e) => console.error(e));
        }

        track.addEventListener(
            "ended",
            () => {
                if (target === "local") {
                    this.stopAudioMeter(this.localAudioMeterHandle, "local");
                } else {
                    this.stopAudioMeter(this.remoteAudioMeterHandle, "remote");
                }
            },
            { once: true },
        );
    }

    // ローカル音声トラックをメーター監視対象として登録する。
    setLocalAudioTrack(track: MediaStreamTrack): void {
        if (track.kind !== "audio") {
            return;
        }
        this.startAudioMeter(track, "local");
    }

    // リモート音声トラックをメーター監視対象として登録する。
    setRemoteAudioTrack(track: MediaStreamTrack): void {
        if (track.kind !== "audio") {
            return;
        }
        this.startAudioMeter(track, "remote");
    }

    // getStats再開時にメトリクス表示とトレンド履歴を初期化する。
    resetRealtimeStats(): void {
        // 接続再試行時に古い値を残さないよう、メトリクスとトレンドを初期化する。
        Object.keys(this.metricElements).forEach((key) => {
            this.updateMetricValue(key, "-");
        });
        Object.keys(this.trendPolylines).forEach((key) => {
            this.trendSeries[key] = [];
            this.renderTrend(key);
        });
    }

    // 指定キーのメトリクス表示値を更新する。
    updateMetricValue(key: string, value: string): void {
        const metricElement = this.metricElements[key];
        if (metricElement) {
            metricElement.textContent = value;
        }
    }

    // 1本分のトレンド折れ線を再描画する。
    private renderTrend(trendKey: string): void {
        const polyline = this.trendPolylines[trendKey];
        if (!polyline) {
            return;
        }
        const points = this.trendSeries[trendKey] ?? [];
        if (points.length <= 1) {
            polyline.setAttribute("points", "");
            return;
        }
        const width = 300;
        const height = 86;
        const upper = this.trendMaxValues[trendKey] ?? 1;
        const xStep = width / (DebugConsoleManager.TREND_POINTS - 1);
        // 直近60点(=約60秒)を固定スケールへ正規化し、比較しやすい折れ線にする。
        const polylinePoints = points.map((v, i) => {
            const x = i * xStep;
            const normalized = Math.max(0, Math.min(1, v / upper));
            const y = height - normalized * (height - 4) - 2;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });
        polyline.setAttribute("points", polylinePoints.join(" "));
    }

    // 新しいトレンド点を追加し、固定長バッファを保って再描画する。
    pushTrendPoint(trendKey: string, value: number | null): void {
        const normalizedValue = value != null && Number.isFinite(value) && value >= 0 ? value : 0;
        if (!this.trendSeries[trendKey]) {
            this.trendSeries[trendKey] = [];
        }
        const series = this.trendSeries[trendKey];
        series.push(normalizedValue);
        // 固定長バッファで描画コストを抑え、レイアウトを安定させる。
        if (series.length > DebugConsoleManager.TREND_POINTS) {
            series.splice(0, series.length - DebugConsoleManager.TREND_POINTS);
        }
        this.renderTrend(trendKey);
    }

    // RTCイベントログにタイムスタンプ付きで追記する。
    // React側には整形前メッセージを渡し、表示件数や見せ方を UI 側で制御できるようにする。
    addRtcEventLog(msg: string): void {
        const now = new Date();
        const ts = now.toISOString().split("T")[1]?.replace("Z", "") || now.toISOString();
        this.appendLog(this.rtcEventLog, `[${ts}] ${msg}\n`, DebugConsoleManager.EVENT_LOG_LINES);
        this.emitEvent({ type: "rtc_event_log", message: msg });
    }

    // telop_chログへ追記する。
    addTelopChannelLog(msg: string): void {
        this.appendLog(this.telopChannelLog, msg, DebugConsoleManager.CHANNEL_LOG_LINES);
    }

    // text_chログへ追記する。
    addTextChannelLog(msg: string): void {
        this.appendLog(this.textChannelLog, msg, DebugConsoleManager.CHANNEL_LOG_LINES);
    }

    // ICE connectionの初期状態表示をセットする。
    newIceConnectionState(msg: string): void {
        this.updateStateLog(this.iceConnectionLog, msg, false);
        this.addRtcEventLog(`ICE connection state = ${msg}`);
        this.emitEvent({ type: "ice_connection_state", value: msg });
    }

    // ICE connectionの遷移状態表示を追記形式で更新する。
    updateIceConnectionState(msg: string): void {
        this.updateStateLog(this.iceConnectionLog, msg, true);
        this.addRtcEventLog(`ICE connection state -> ${msg}`);
        this.emitEvent({ type: "ice_connection_state", value: msg });
    }

    // ICE gatheringの初期状態表示をセットする。
    newIceGatheringState(msg: string): void {
        this.updateStateLog(this.iceGatheringLog, msg, false);
        this.addRtcEventLog(`ICE gathering state = ${msg}`);
    }

    // ICE gatheringの遷移状態表示を追記形式で更新する。
    updateIceGatheringState(msg: string): void {
        this.updateStateLog(this.iceGatheringLog, msg, true);
        this.addRtcEventLog(`ICE gathering state -> ${msg}`);
    }

    // signalingの初期状態表示をセットする。
    newSignalingState(msg: string): void {
        this.updateStateLog(this.signalingLog, msg, false);
        this.addRtcEventLog(`Signaling state = ${msg}`);
        this.emitEvent({ type: "signaling_state", value: msg });
    }

    // signalingの遷移状態表示を追記形式で更新する。
    updateSignalingState(msg: string): void {
        this.updateStateLog(this.signalingLog, msg, true);
        this.addRtcEventLog(`Signaling state -> ${msg}`);
        this.emitEvent({ type: "signaling_state", value: msg });
    }

    // Offer SDP全文を表示欄へ出力する。
    offerSDP(msg: string): void {
        if (this.offerSDPLog) {
            this.offerSDPLog.textContent = msg;
        }
    }

    // Answer SDP全文を表示欄へ出力する。
    answerSDP(msg: string): void {
        if (this.answerSDPLog) {
            this.answerSDPLog.textContent = msg;
        }
    }

    /* CharacterGaze */
    // 顔検出X座標表示を更新する。
    updateFaceXLog(value: number): void {
        if (this.faceXLog) {
            this.faceXLog.textContent = `${value}`;
        }
        this.emitEvent({ type: "face_x", value });
    }

    // 顔検出Y座標表示を更新する。
    updateFaceYLog(value: number): void {
        if (this.faceYLog) {
            this.faceYLog.textContent = `${value}`;
        }
        this.emitEvent({ type: "face_y", value });
    }

    // 正面向き判定の数値表示を更新する。
    updateFacing(value: number): void {
        if (this.facing) {
            this.facing.textContent = `${value}`;
        }
        this.emitEvent({ type: "facing", value });
    }

    // CharacterGazeによる注視状態を表示する。
    updateCharacterEyeStatus(watching: boolean): void {
        if (!this.characterGazeStatus) {
            this.emitEvent({ type: "character_eye_status", watching });
            return;
        }
        this.characterGazeStatus.innerText = watching ? "みてる" : "みてない";
        this.emitEvent({ type: "character_eye_status", watching });
    }

    // 複数人検出時のターゲット選択状態（対象index / 候補数 / 固定中）を簡易表示する。
    updateCharacterGazeTargetDebug(message: string): void {
        if (this.characterGazeTargetDebug) {
            this.characterGazeTargetDebug.textContent = message;
        }
        this.emitEvent({ type: "gaze_target_debug", message });
    }

    // Gaze 機能を停止した時の Debug 表示。数値イベントは送らず、見た目だけを「停止中」にする。
    setCharacterGazePaused(paused: boolean): void {
        if (paused) {
            if (this.faceXLog) {
                this.faceXLog.textContent = "停止中";
            }
            if (this.faceYLog) {
                this.faceYLog.textContent = "停止中";
            }
            if (this.facing) {
                this.facing.textContent = "停止中";
            }
            if (this.characterGazeStatus) {
                this.characterGazeStatus.innerText = "停止中";
            }
            if (this.characterGazeTargetDebug) {
                this.characterGazeTargetDebug.textContent = "停止中";
            }
            return;
        }
        if (this.characterGazeStatus) {
            // 再開直後は未検出の可能性があるため、在席状態だけ中立値へ戻す。
            this.characterGazeStatus.innerText = "みてない";
        }
        if (this.characterGazeTargetDebug) {
            this.characterGazeTargetDebug.textContent = "-";
        }
    }

    setCharacterGazeTrackingTuning(config: CharacterGazeTrackingTuningUiConfig): void {
        if (this.gazeHoldMsInput) this.gazeHoldMsInput.value = `${Math.round(config.minimumHoldMs)}`;
        if (this.gazeSwitchMarginInput) this.gazeSwitchMarginInput.value = `${config.switchMargin}`;
        if (this.gazeRelinkDistanceInput) this.gazeRelinkDistanceInput.value = `${config.relinkDistance}`;
        if (this.gazeOneEuroMinCutoffInput) this.gazeOneEuroMinCutoffInput.value = `${config.oneEuroMinCutoff}`;
        if (this.gazeOneEuroBetaInput) this.gazeOneEuroBetaInput.value = `${config.oneEuroBeta}`;
        if (this.gazeDeadbandInput) this.gazeDeadbandInput.value = `${config.deadband}`;
        this.updateCharacterGazeTrackingTuningLabels(config);
    }

    setCharacterGazeTrackingTuningChangeCallback(callback: (config: CharacterGazeTrackingTuningUiConfig) => void): void {
        this.onCharacterGazeTrackingTuningChange = callback;
    }

    private bindCharacterGazeTrackingTuningControls(): void {
        const emit = () => {
            const cfg = this.readCharacterGazeTrackingTuningUiConfig();
            if (!cfg) {
                return;
            }
            this.updateCharacterGazeTrackingTuningLabels(cfg);
            this.onCharacterGazeTrackingTuningChange(cfg);
        };
        [
            this.gazeHoldMsInput,
            this.gazeSwitchMarginInput,
            this.gazeRelinkDistanceInput,
            this.gazeOneEuroMinCutoffInput,
            this.gazeOneEuroBetaInput,
            this.gazeDeadbandInput,
        ].forEach((input) => input?.addEventListener("input", emit));
    }

    // 実機での調整を素早くするため、よく使う値セットをボタンで一括反映する。
    private bindCharacterGazeTrackingTuningPresetButtons(): void {
        this.gazeTrackingPresetButtons.forEach((button) => {
            button.addEventListener("click", () => {
                const presetKey = button.dataset.gazeTuningPreset as CharacterGazeTrackingTuningPresetKey | undefined;
                if (!presetKey) {
                    return;
                }
                const preset = CHARACTER_GAZE_TRACKING_TUNING_PRESETS[presetKey];
                if (!preset) {
                    return;
                }
                this.setCharacterGazeTrackingTuning(preset);
                this.onCharacterGazeTrackingTuningChange(preset);
            });
        });
    }

    private readCharacterGazeTrackingTuningUiConfig(): CharacterGazeTrackingTuningUiConfig | null {
        const minimumHoldMs = Number.parseFloat(this.gazeHoldMsInput?.value ?? "");
        const switchMargin = Number.parseFloat(this.gazeSwitchMarginInput?.value ?? "");
        const relinkDistance = Number.parseFloat(this.gazeRelinkDistanceInput?.value ?? "");
        const oneEuroMinCutoff = Number.parseFloat(this.gazeOneEuroMinCutoffInput?.value ?? "");
        const oneEuroBeta = Number.parseFloat(this.gazeOneEuroBetaInput?.value ?? "");
        const deadband = Number.parseFloat(this.gazeDeadbandInput?.value ?? "");
        if (![minimumHoldMs, switchMargin, relinkDistance, oneEuroMinCutoff, oneEuroBeta, deadband].every(Number.isFinite)) {
            return null;
        }
        return {
            minimumHoldMs,
            switchMargin,
            relinkDistance,
            oneEuroMinCutoff,
            oneEuroBeta,
            oneEuroDCutoff: 1.0,
            deadband,
        };
    }

    private updateCharacterGazeTrackingTuningLabels(config: CharacterGazeTrackingTuningUiConfig): void {
        this.setAudioControlLabelValue(this.gazeHoldMsInput, `${Math.round(config.minimumHoldMs)}ms`);
        this.setAudioControlLabelValue(this.gazeSwitchMarginInput, config.switchMargin.toFixed(2));
        this.setAudioControlLabelValue(this.gazeRelinkDistanceInput, config.relinkDistance.toFixed(2));
        this.setAudioControlLabelValue(this.gazeOneEuroMinCutoffInput, config.oneEuroMinCutoff.toFixed(2));
        this.setAudioControlLabelValue(this.gazeOneEuroBetaInput, config.oneEuroBeta.toFixed(3));
        this.setAudioControlLabelValue(this.gazeDeadbandInput, config.deadband.toFixed(4));
    }

    // audioControlLabel レイアウト（label末尾の span）を再利用して、Gaze tuning の現在値を表示する。
    private setAudioControlLabelValue(input: HTMLInputElement | null, text: string): void {
        const label = input?.closest("label.audioControlLabel");
        const valueSpan = label?.querySelector("span");
        if (!valueSpan) {
            return;
        }
        valueSpan.textContent = text;
    }

    private emitEvent(event: DebugConsoleManagerEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}
