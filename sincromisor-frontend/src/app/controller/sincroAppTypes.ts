import type { LookingGlassRuntimeConfig } from "../../character/lookingGlass/lookingGlassRuntimeConfig";
import type { ChatMessageViewRecord } from "../../features/conversation/chat/model/chatMessageService";
import type { TelopTextSegment } from "../../features/conversation/talk/talkManager";
import type {
    DialogSettingsUiHints,
    DialogSettingsUiState,
    DialogUiState,
    DialogVrmUiState,
} from "../../features/dialog/model/dialogManager";
import type { DialogPopEvent } from "../../features/dialog/model/popMessageService";
import type { ChatMessage, TelopChannelMessage } from "../../features/rtc/rtcMessage";

// SincroAppController を境界にした UI 向けの共通型定義。
// React UI / initializer / helper 群で同じ契約を共有するために Controller 本体から分離している。
export type SincroAppLifecycleState = "idle" | "starting" | "running" | "stopping" | "stopped";

export type SincroAppStartHooks = {
    beforeStart?: () => void;
    afterStart?: () => void;
};

export type SincroAppSettingsSnapshot = {
    titleText: string;
    talkMode: string;
    audioInputDeviceId: string | undefined;
    videoInputDeviceId: string | undefined;
    enableCharacter: boolean;
    enableTalk: boolean;
    enableCharacterGaze: boolean;
    enableSincroPoseTracking: boolean;
    forceSincroPoseTracking: boolean;
    enableAutoMute: boolean;
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    enableVadGate: boolean;
    enableVenueNoiseMode: boolean;
    enableInspector: boolean;
    enableVR: boolean;
    characterMotionScale: number;
    sincroPoseRetargetScale: number;
    characterEyeTrackingScale: number;
    lgTileHeight: number;
    lgNumViews: number;
    lgTargetY: number;
    lgTargetZ: number;
    lgTargetDiam: number;
    lgDepthiness: number;
    lgFovyDeg: number;
};

// DialogManager 側の設定 UI 状態/ヒント型を AppController 向け名称で再公開する。
export type SincroAppSettingsUiState = DialogSettingsUiState;
export type SincroAppSettingsUiHints = DialogSettingsUiHints;
export type SincroAppDialogUiState = DialogUiState;
export type SincroAppDialogVrmUiState = DialogVrmUiState;
export type SincroAppDialogPopMessage = DialogPopEvent;

export type SincroAppStartupSettingsStatus = {
    requiresRestart: boolean;
    willApplyOnNextStart: boolean;
    changedKeys: Array<"enableTalk" | "enableInspector" | "enableVR">;
};

export type SincroAppStartupSettingsCapabilities = {
    enableTalk: boolean;
    enableInspector: boolean;
    enableVR: boolean;
};

export type SincroAppLookingGlassConfigStatus = {
    pendingForNextSession: boolean;
    reloadRecommended: boolean;
    changedKeys: Array<keyof LookingGlassRuntimeConfig>;
    reloadRecommendedKeys: Array<keyof LookingGlassRuntimeConfig>;
    nextSessionKeys: Array<keyof LookingGlassRuntimeConfig>;
};

export type SincroAppLookingGlassEventDetail = {
    state: "idle" | "starting" | "recovering" | "active" | "error";
    code?:
        | "button_not_found"
        | "webxr_unavailable"
        | "session_start_failed"
        | "polyfill_init_failed"
        | "retry_after_error"
        | "session_ended";
    message?: string;
};

export type SincroAppLookingGlassConfigUpdatedEventDetail = {
    config: LookingGlassRuntimeConfig;
    changedKeys: Array<keyof LookingGlassRuntimeConfig>;
};

// AppController が UI 層へ配信する統一イベント。
// singleton manager / service ごとの差分をこの union へ吸収し、React 側の購読先を一本化する。
export type SincroAppEvent =
    | {
          type: "lifecycle";
          state: SincroAppLifecycleState;
      }
    | {
          type: "chat_message";
          message: ChatMessage;
          viewRecord: ChatMessageViewRecord;
      }
    | {
          type: "system_message";
          message: ChatMessage;
          viewRecord: ChatMessageViewRecord;
      }
    | {
          type: "error_message";
          message: ChatMessage;
          viewRecord: ChatMessageViewRecord;
      }
    | {
          type: "chat_system_icon";
          iconUrl: string;
      }
    | {
          type: "local_vad_state";
          isSpeech: boolean;
      }
    | {
          type: "gaze_status";
          faceX?: number;
          faceY?: number;
          facing?: number;
          watching?: boolean;
      }
    | {
          type: "rtc_event_log";
          message: string;
      }
    | {
          type: "rtc_state";
          iceConnectionState?: string;
          signalingState?: string;
      }
    | {
          type: "connection_state";
          value:
              | "idle"
              | "starting"
              | "connecting"
              | "connected"
              | "degraded"
              | "stopping"
              | "stopped";
          detail?: string;
      }
    | {
          type: "learned_vad_state";
          status: string;
          probability?: number;
      }
    | {
          type: "telop_message";
          message: TelopChannelMessage;
      }
    | {
          type: "settings_snapshot";
          settings: SincroAppSettingsSnapshot;
      }
    | {
          type: "settings_ui_state";
          uiState: SincroAppSettingsUiState;
      }
    | {
          type: "settings_ui_hints";
          uiHints: SincroAppSettingsUiHints;
      }
    | {
          type: "dialog_ui_state";
          uiState: SincroAppDialogUiState;
      }
    | {
          type: "dialog_vrm_ui_state";
          uiState: SincroAppDialogVrmUiState;
      }
    | {
          type: "dialog_pop_message";
          message: SincroAppDialogPopMessage;
      }
    | {
          type: "startup_settings_status";
          status: SincroAppStartupSettingsStatus;
      }
    | {
          type: "startup_settings_capabilities";
          capabilities: SincroAppStartupSettingsCapabilities;
      }
    | {
          type: "looking_glass_state";
          state: SincroAppLookingGlassEventDetail["state"];
          code?: SincroAppLookingGlassEventDetail["code"];
          message?: SincroAppLookingGlassEventDetail["message"];
      }
    | {
          type: "looking_glass_config_status";
          status: SincroAppLookingGlassConfigStatus;
      };

export type { ChatMessageViewRecord, TelopTextSegment };
