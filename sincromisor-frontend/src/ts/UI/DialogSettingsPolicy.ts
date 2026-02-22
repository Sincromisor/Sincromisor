import { DialogStateStore } from "./DialogStateStore";

export type DialogSettingsUiState = {
    titleTextDisabled: boolean;
    talkModeDisabled: boolean;
    enableCharacterDisabled: boolean;
    enableTalkDisabled: boolean;
    enableCharacterGazeDisabled: boolean;
    enableAutoMuteDisabled: boolean;
    enableNoiseSuppressionDisabled: boolean;
    enableEchoCancellationDisabled: boolean;
    enableAutoGainControlDisabled: boolean;
    enableVadGateDisabled: boolean;
    enableVenueNoiseModeDisabled: boolean;
    enableInspectorDisabled: boolean;
    enableVRDisabled: boolean;
};

export type DialogSettingsUiHints = {
    enableCharacterReason?: string;
    enableCharacterGazeReason?: string;
    enableAutoMuteReason?: string;
};

// 起動前 dialog の「設定が有効か」「なぜ無効か」という UI ポリシーを保持する。
// DialogManager から条件分岐を切り出し、state 更新と通知処理を薄く保つ。
export class DialogSettingsPolicy {
    buildUiState(stateStore: DialogStateStore): DialogSettingsUiState {
        // React UI は disabled の理由を hints で出すが、まず「押せるかどうか」はこの snapshot を正本にする。
        return {
            titleTextDisabled: stateStore.isDisabled("titleText"),
            talkModeDisabled: stateStore.isDisabled("talkMode"),
            enableCharacterDisabled: stateStore.isDisabled("enableCharacter"),
            enableTalkDisabled: stateStore.isDisabled("enableTalk"),
            enableCharacterGazeDisabled: stateStore.isDisabled("enableCharacterGaze"),
            enableAutoMuteDisabled: stateStore.isDisabled("enableAutoMute"),
            enableNoiseSuppressionDisabled: stateStore.isDisabled("enableNoiseSuppression"),
            enableEchoCancellationDisabled: stateStore.isDisabled("enableEchoCancellation"),
            enableAutoGainControlDisabled: stateStore.isDisabled("enableAutoGainControl"),
            enableVadGateDisabled: stateStore.isDisabled("enableVadGate"),
            enableVenueNoiseModeDisabled: stateStore.isDisabled("enableVenueNoiseMode"),
            enableInspectorDisabled: stateStore.isDisabled("enableInspector"),
            enableVRDisabled: stateStore.isDisabled("enableVR"),
        };
    }

    buildUiHints(stateStore: DialogStateStore): DialogSettingsUiHints {
        // hints は disabled 理由の補足表示用。操作可否そのものは buildUiState の結果に従う。
        const characterDisabled = stateStore.isDisabled("enableCharacter");
        const gazeDisabled = stateStore.isDisabled("enableCharacterGaze");
        const autoMuteDisabled = stateStore.isDisabled("enableAutoMute");
        const startUnavailable = stateStore.getDialogUiState().startButtonDisabled;
        const characterGazeEnabled = stateStore.get("enableCharacterGaze");

        let enableCharacterReason: string | undefined;
        if (characterDisabled) {
            enableCharacterReason = "Character rendering is unavailable on this page or device.";
        }

        let enableCharacterGazeReason: string | undefined;
        if (gazeDisabled) {
            if (startUnavailable) {
                enableCharacterGazeReason = "Camera/microphone availability check has not passed yet.";
            } else if (characterDisabled) {
                enableCharacterGazeReason = "Enable character rendering first.";
            } else {
                enableCharacterGazeReason = "Character gaze is currently unavailable.";
            }
        }

        let enableAutoMuteReason: string | undefined;
        if (autoMuteDisabled) {
            if (!characterGazeEnabled) {
                enableAutoMuteReason = "Enable character gaze to use auto-mute.";
            } else {
                enableAutoMuteReason = "Auto-mute is currently unavailable.";
            }
        }

        return {
            enableCharacterReason,
            enableCharacterGazeReason,
            enableAutoMuteReason,
        };
    }

    initializeDefaultDisabledState(stateStore: DialogStateStore): void {
        // bridge DOM 縮退後は初期値を store で持つ。必要な disabled は既存挙動に合わせて初期化する。
        stateStore.setDisabled("enableCharacter", true);
        stateStore.setDisabled("enableCharacterGaze", true);
        stateStore.setDisabled("enableAutoMute", true);
    }

    applyCharacterAvailability(stateStore: DialogStateStore, available: boolean): void {
        // 利用不可になった時は checked 状態も落として、UI と内部状態の矛盾を防ぐ。
        stateStore.setDisabled("enableCharacter", !available);
        if (!available) {
            stateStore.set("enableCharacter", false);
        }
    }

    applyCharacterGazeAvailability(stateStore: DialogStateStore, available: boolean): void {
        stateStore.setDisabled("enableCharacterGaze", !available);
        if (!available) {
            stateStore.set("enableCharacterGaze", false);
        }
    }

    applyAutoMuteAvailability(stateStore: DialogStateStore): void {
        // AutoMute は Gaze に依存するため、Gaze 無効時は自動的に OFF に戻す。
        const enabled = stateStore.get("enableCharacterGaze");
        stateStore.setDisabled("enableAutoMute", !enabled);
        if (!enabled) {
            stateStore.set("enableAutoMute", false);
        }
    }
}
