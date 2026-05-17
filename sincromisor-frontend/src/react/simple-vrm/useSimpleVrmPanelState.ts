import { useEffect, useState } from "react";
import { SincroAppController } from "../../ts/App/SincroAppController";
import type {
    SincroAppEvent,
    SincroAppLifecycleState,
    SincroAppSettingsSnapshot,
} from "../../ts/App/SincroAppTypes";
import { prependPanelMessageLog } from "../app/panelLogHelpers";
import {
    hydrateSettingsSnapshotsFromController,
    hydrateStartupSettingsStatusFromController,
} from "../app/sincroAppStateSnapshotHydrators";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";
import { UI_TUNING } from "../app/uiTuning";
import { useSincroMediaDeviceState } from "../app/useSincroMediaDeviceState";
import type {
    ApplySettingsFn,
    PanelConnectionState,
    PanelGazeState,
    PanelLearnedVadState,
    PanelLookingGlassConfigStatus,
    PanelLookingGlassState,
    PanelMessageLog,
    PanelRtcState,
    PanelTelopLog,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "./panelTypes";

const defaultSettings: SincroAppSettingsSnapshot = {
    titleText: "Sincromisor",
    talkMode: "chat",
    audioInputDeviceId: undefined,
    videoInputDeviceId: undefined,
    enableCharacter: true,
    enableTalk: true,
    enableCharacterGaze: true,
    enableSincroPoseTracking: true,
    forceSincroPoseTracking: false,
    enableAutoMute: false,
    enableNoiseSuppression: true,
    enableEchoCancellation: true,
    enableAutoGainControl: false,
    enableVadGate: false,
    enableVenueNoiseMode: false,
    enableInspector: false,
    enableVR: false,
    characterMotionScale: 0.72,
    sincroPoseRetargetScale: 0.68,
    characterEyeTrackingScale: 0.68,
    lgTileHeight: 512,
    lgNumViews: 45,
    lgTargetY: 0.95,
    lgTargetZ: 0.05,
    lgTargetDiam: 1.25,
    lgDepthiness: 0.85,
    lgFovyDeg: 24,
};

const defaultSettingsUiState: SincroAppSettingsUiState = {
    titleTextDisabled: false,
    talkModeDisabled: false,
    audioInputDeviceDisabled: false,
    videoInputDeviceDisabled: false,
    enableCharacterDisabled: false,
    enableTalkDisabled: false,
    enableCharacterGazeDisabled: false,
    forceSincroPoseTrackingDisabled: false,
    enableAutoMuteDisabled: false,
    enableNoiseSuppressionDisabled: false,
    enableEchoCancellationDisabled: false,
    enableAutoGainControlDisabled: false,
    enableVadGateDisabled: false,
    enableVenueNoiseModeDisabled: false,
    enableInspectorDisabled: false,
    enableVRDisabled: false,
};

const defaultSettingsUiHints: SincroAppSettingsUiHints = {};

const defaultStartupSettingsStatus: SincroAppStartupSettingsStatus = {
    requiresRestart: false,
    willApplyOnNextStart: false,
    changedKeys: [],
};

const defaultStartupSettingsCapabilities: SincroAppStartupSettingsCapabilities = {
    enableTalk: false,
    enableInspector: false,
    enableVR: false,
};

type SimpleVrmPanelState = {
    hasActiveController: boolean;
    currentController: SincroAppController | null;
    lifecycleState: SincroAppLifecycleState;
    settings: SincroAppSettingsSnapshot;
    settingsUiState: SincroAppSettingsUiState;
    settingsUiHints: SincroAppSettingsUiHints;
    startupSettingsStatus: SincroAppStartupSettingsStatus;
    startupSettingsCapabilities: SincroAppStartupSettingsCapabilities;
    mediaDeviceSnapshot: ReturnType<typeof useSincroMediaDeviceState>["snapshot"];
    audioInputSelection: ReturnType<typeof useSincroMediaDeviceState>["audioInputSelection"];
    videoInputSelection: ReturnType<typeof useSincroMediaDeviceState>["videoInputSelection"];
    logs: PanelMessageLog[];
    vadState: "unknown" | "speech" | "silence";
    learnedVad: PanelLearnedVadState;
    gaze: PanelGazeState;
    rtcEvents: string[];
    rtcState: PanelRtcState;
    connectionState: PanelConnectionState;
    telopLogs: PanelTelopLog[];
    lookingGlass: PanelLookingGlassState;
    lookingGlassConfigStatus: PanelLookingGlassConfigStatus;
};

// Control Panel から呼ぶ UI 操作。実処理は AppController に集約し、hook は委譲のみ行う。
type SimpleVrmPanelActions = {
    startAction: () => void;
    stopAction: () => void;
    applySettings: ApplySettingsFn;
    changeTalkMode: (nextTalkMode: string) => void;
    refreshDevices: ReturnType<typeof useSincroMediaDeviceState>["refreshDevices"];
};

type SimpleVrmPanelEventHandlerMap = {
    [K in SincroAppEvent["type"]]?: (event: Extract<SincroAppEvent, { type: K }>) => void;
};

// AppController のイベント購読を React state に集約する、ページ共通の表示用 hook。
// simple-vrm / vrm360 / looking-glass-vrm で同じ購読ロジックを再利用する。
export function useSimpleVrmPanelState(): SimpleVrmPanelState & SimpleVrmPanelActions {
    const initialController = SincroAppController.getCurrent();
    const [hasActiveController, setHasActiveController] = useState<boolean>(!!initialController);
    const [currentController, setCurrentController] = useState<SincroAppController | null>(
        initialController,
    );
    const [lifecycleState, setLifecycleState] = useState<SincroAppLifecycleState>("idle");
    const [settings, setSettings] = useState<SincroAppSettingsSnapshot>(
        initialController?.state.getSettingsSnapshot() ?? defaultSettings,
    );
    const [settingsUiState, setSettingsUiState] = useState<SincroAppSettingsUiState>(
        initialController?.state.getSettingsUiState() ?? defaultSettingsUiState,
    );
    const [settingsUiHints, setSettingsUiHints] = useState<SincroAppSettingsUiHints>(
        initialController?.state.getSettingsUiHints() ?? defaultSettingsUiHints,
    );
    const [startupSettingsStatus, setStartupSettingsStatus] =
        useState<SincroAppStartupSettingsStatus>(
            initialController?.state.getStartupSettingsStatus() ?? defaultStartupSettingsStatus,
        );
    const [startupSettingsCapabilities, setStartupSettingsCapabilities] =
        useState<SincroAppStartupSettingsCapabilities>(defaultStartupSettingsCapabilities);
    const {
        snapshot: mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        refreshDevices,
    } = useSincroMediaDeviceState({
        audioInputDeviceId: settings.audioInputDeviceId,
        videoInputDeviceId: settings.videoInputDeviceId,
    });
    const [logs, setLogs] = useState<PanelMessageLog[]>([]);
    const [vadState, setVadState] = useState<"unknown" | "speech" | "silence">("unknown");
    const [learnedVad, setLearnedVad] = useState<PanelLearnedVadState>({
        status: "idle",
        probability: null,
    });
    const [gaze, setGaze] = useState<PanelGazeState>({
        faceX: null,
        faceY: null,
        facing: null,
        watching: null,
    });
    const [rtcEvents, setRtcEvents] = useState<string[]>([]);
    const [rtcState, setRtcState] = useState<PanelRtcState>({
        iceConnectionState: "-",
        signalingState: "-",
    });
    const [connectionState, setConnectionState] = useState<PanelConnectionState>({
        value: "idle",
        detail: "",
    });
    const [telopLogs, setTelopLogs] = useState<PanelTelopLog[]>([]);
    const [lookingGlass, setLookingGlass] = useState<PanelLookingGlassState>({
        state: "idle",
        code: "",
        message: "",
    });
    const [lookingGlassConfigStatus, setLookingGlassConfigStatus] =
        useState<PanelLookingGlassConfigStatus>({
            pendingForNextSession: false,
            reloadRecommended: false,
            changedKeys: [],
            reloadRecommendedKeys: [],
            nextSessionKeys: [],
        });

    useEffect(() => {
        // event type -> state 更新処理を map にして、購読配線の見通しを保つ。
        const eventHandlers: SimpleVrmPanelEventHandlerMap = {
            lifecycle: (event) => {
                setLifecycleState(event.state);
            },
            settings_snapshot: (event) => {
                setSettings((prev) => ({ ...prev, ...event.settings }));
            },
            settings_ui_state: (event) => {
                setSettingsUiState(event.uiState);
            },
            settings_ui_hints: (event) => {
                setSettingsUiHints(event.uiHints);
            },
            startup_settings_status: (event) => {
                setStartupSettingsStatus(event.status);
            },
            startup_settings_capabilities: (event) => {
                setStartupSettingsCapabilities(event.capabilities);
            },
            system_message: (event) => {
                setLogs((prev) => prependPanelMessageLog(prev, event));
            },
            error_message: (event) => {
                setLogs((prev) => prependPanelMessageLog(prev, event));
            },
            chat_message: (event) => {
                setLogs((prev) => prependPanelMessageLog(prev, event));
            },
            local_vad_state: (event) => {
                setVadState(event.isSpeech ? "speech" : "silence");
            },
            gaze_status: (event) => {
                setGaze((prev) => ({
                    faceX: event.faceX ?? prev.faceX,
                    faceY: event.faceY ?? prev.faceY,
                    facing: event.facing ?? prev.facing,
                    watching: typeof event.watching === "boolean" ? event.watching : prev.watching,
                }));
            },
            rtc_state: (event) => {
                setRtcState((prev) => ({
                    iceConnectionState: event.iceConnectionState ?? prev.iceConnectionState,
                    signalingState: event.signalingState ?? prev.signalingState,
                }));
            },
            connection_state: (event) => {
                setConnectionState({ value: event.value, detail: event.detail ?? "" });
            },
            learned_vad_state: (event) => {
                setLearnedVad({ status: event.status, probability: event.probability });
            },
            rtc_event_log: (event) => {
                setRtcEvents((prev) =>
                    [event.message, ...prev].slice(0, UI_TUNING.controlPanel.rtcEventLogLimit),
                );
            },
            telop_message: (event) => {
                setTelopLogs((prev) =>
                    [
                        {
                            text: event.message.text ?? "",
                            message: event.message.message,
                            newText: !!event.message.new_text,
                            vowel: event.message.vowel ?? "",
                        },
                        ...prev,
                    ].slice(0, UI_TUNING.controlPanel.telopLogLimit),
                );
            },
            looking_glass_state: (event) => {
                setLookingGlass({
                    state: event.state,
                    code: event.code ?? "",
                    message: event.message ?? "",
                });
            },
            looking_glass_config_status: (event) => {
                setLookingGlassConfigStatus(event.status);
            },
        };

        const unsubscribeActiveController = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                // MPA切替や initializer 再生成時に active controller が差し替わる前提で再bindする。
                setCurrentController(controller);
                setHasActiveController(!!controller);
                if (!controller) {
                    setLifecycleState("idle");
                    return;
                }
                // subscribe() 初回スナップショット前でも UI が前回状態を引きずらないように同期する。
                hydrateSettingsSnapshotsFromController(controller, {
                    setSettings,
                    setSettingsUiState,
                    setSettingsUiHints,
                });
                hydrateStartupSettingsStatusFromController(controller, {
                    setStartupSettingsStatus,
                });
            },
            onEvent: (event: SincroAppEvent) => {
                // UI層は「イベントを state へ正規化する」責務に絞り、描画ロジックは component 側へ寄せる。
                const handler = eventHandlers[event.type] as
                    | ((value: SincroAppEvent) => void)
                    | undefined;
                handler?.(event);
            },
        });
        return () => {
            // React unmount 時に manager 購読を確実に解放し、二重購読を防ぐ。
            unsubscribeActiveController();
        };
    }, []);

    const startAction = (): void => {
        // 開始の順序制御（hooks/lifecycle）は AppController に任せる。
        currentController?.start();
    };

    const stopAction = (): void => {
        // stop も AppController 経由で行い、RTC停止の順序/状態遷移をUI側で持たない。
        currentController?.stop();
    };

    const applySettings: ApplySettingsFn = (partial) => {
        // 設定適用ロジックは AppController 側に集約し、hook は委譲のみ行う。
        currentController?.applySettings(partial);
    };

    const changeTalkMode = (nextTalkMode: string): void => {
        applySettings({ talkMode: nextTalkMode });
    };

    return {
        hasActiveController,
        currentController,
        lifecycleState,
        settings,
        settingsUiState,
        settingsUiHints,
        startupSettingsStatus,
        startupSettingsCapabilities,
        mediaDeviceSnapshot,
        audioInputSelection,
        videoInputSelection,
        logs,
        vadState,
        learnedVad,
        gaze,
        rtcEvents,
        rtcState,
        connectionState,
        telopLogs,
        lookingGlass,
        lookingGlassConfigStatus,
        startAction,
        stopAction,
        applySettings,
        changeTalkMode,
        refreshDevices,
    };
}
