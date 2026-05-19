import type { SincroMediaDeviceSelectionState } from "../mediaDevices/sincroMediaDeviceService";
import type { DialogStateStore } from "./dialogStateStore";

export type DialogSettingsUiState = {
    titleTextDisabled: boolean;
    talkModeDisabled: boolean;
    audioInputDeviceDisabled: boolean;
    videoInputDeviceDisabled: boolean;
    enableCharacterDisabled: boolean;
    enableTalkDisabled: boolean;
    enableCharacterGazeDisabled: boolean;
    forceSincroPoseTrackingDisabled: boolean;
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
    audioInputDeviceReason?: string;
    videoInputDeviceReason?: string;
    enableCharacterReason?: string;
    enableCharacterGazeReason?: string;
    enableAutoMuteReason?: string;
};

export type DialogStartButtonState = {
    startButtonDisabled: boolean;
    startButtonText: string;
    startButtonHint?: string;
};

type DialogMediaDeviceUiContext = {
    isUserMediaAvailable: boolean;
    audioInputSelection: SincroMediaDeviceSelectionState;
    videoInputSelection: SincroMediaDeviceSelectionState;
};

// 起動前 dialog の「設定が有効か」「なぜ無効か」という UI ポリシーを保持する。
// DialogManager から条件分岐を切り出し、state 更新と通知処理を薄く保つ。
export class DialogSettingsPolicy {
    buildUiState(stateStore: DialogStateStore): DialogSettingsUiState {
        // React UI は disabled の理由を hints で出すが、まず「押せるかどうか」はこの snapshot を正本にする。
        return {
            titleTextDisabled: stateStore.isDisabled("titleText"),
            talkModeDisabled: stateStore.isDisabled("talkMode"),
            audioInputDeviceDisabled: stateStore.isDisabled("audioInputDeviceId"),
            videoInputDeviceDisabled: stateStore.isDisabled("videoInputDeviceId"),
            enableCharacterDisabled: stateStore.isDisabled("enableCharacter"),
            enableTalkDisabled: stateStore.isDisabled("enableTalk"),
            enableCharacterGazeDisabled: stateStore.isDisabled("enableCharacterGaze"),
            forceSincroPoseTrackingDisabled: stateStore.isDisabled("forceSincroPoseTracking"),
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

    buildUiHints(
        stateStore: DialogStateStore,
        context: DialogMediaDeviceUiContext,
    ): DialogSettingsUiHints {
        // hints は disabled 理由の補足表示用。操作可否そのものは buildUiState の結果に従う。
        const characterDisabled = stateStore.isDisabled("enableCharacter");
        const gazeDisabled = stateStore.isDisabled("enableCharacterGaze");
        const autoMuteDisabled = stateStore.isDisabled("enableAutoMute");
        const startUnavailable = this.buildStartButtonState(
            stateStore,
            context,
        ).startButtonDisabled;
        const characterGazeEnabled = stateStore.get("enableCharacterGaze");

        let enableCharacterReason: string | undefined;
        if (characterDisabled) {
            enableCharacterReason = "このページまたは端末では Character 表示を利用できません。";
        }
        const { audioInputDeviceReason, videoInputDeviceReason, selectedVideoUnavailable } =
            this.buildMediaDeviceHints(context, characterGazeEnabled);

        return {
            audioInputDeviceReason,
            videoInputDeviceReason,
            enableCharacterReason,
            enableCharacterGazeReason: this.buildCharacterGazeHint({
                characterDisabled,
                characterGazeEnabled,
                gazeDisabled,
                selectedVideoUnavailable,
                startUnavailable,
            }),
            enableAutoMuteReason: this.buildAutoMuteHint(autoMuteDisabled, characterGazeEnabled),
        };
    }

    private buildMediaDeviceHints(
        context: DialogMediaDeviceUiContext,
        characterGazeEnabled: boolean,
    ): {
        audioInputDeviceReason?: string;
        videoInputDeviceReason?: string;
        selectedVideoUnavailable: boolean;
    } {
        const selectedAudioUnavailable =
            context.audioInputSelection.isSelected &&
            context.audioInputSelection.availabilityKnown &&
            !context.audioInputSelection.isAvailable;
        const selectedVideoUnavailable =
            context.videoInputSelection.isSelected &&
            context.videoInputSelection.availabilityKnown &&
            !context.videoInputSelection.isAvailable;

        return {
            audioInputDeviceReason: buildAudioInputDeviceHint(
                context.isUserMediaAvailable,
                selectedAudioUnavailable,
            ),
            videoInputDeviceReason: buildVideoInputDeviceHint(
                selectedVideoUnavailable,
                characterGazeEnabled,
            ),
            selectedVideoUnavailable,
        };
    }

    private buildCharacterGazeHint(options: {
        characterDisabled: boolean;
        characterGazeEnabled: boolean;
        gazeDisabled: boolean;
        selectedVideoUnavailable: boolean;
        startUnavailable: boolean;
    }): string | undefined {
        if (options.gazeDisabled) {
            if (options.startUnavailable) {
                return "開始条件を満たしていないため、Gaze を有効化できません。";
            }
            return options.characterDisabled
                ? "先に Character を有効にしてください。"
                : "現在の構成では Gaze を利用できません。";
        }
        if (options.characterGazeEnabled && options.selectedVideoUnavailable) {
            return "選択中の視線用カメラが見つからないため、このままでは Gaze を開始できません。";
        }
        return undefined;
    }

    private buildAutoMuteHint(
        autoMuteDisabled: boolean,
        characterGazeEnabled: boolean,
    ): string | undefined {
        if (!autoMuteDisabled) {
            return undefined;
        }
        return characterGazeEnabled
            ? "現在の構成では AutoMute を利用できません。"
            : "AutoMute を使うには Gaze を有効にしてください。";
    }

    buildStartButtonState(
        stateStore: DialogStateStore,
        context: DialogMediaDeviceUiContext,
    ): DialogStartButtonState {
        if (!context.isUserMediaAvailable) {
            return {
                startButtonDisabled: true,
                startButtonText: "開始できません",
                startButtonHint: "このブラウザではマイク入力を取得できません。",
            };
        }

        const blockedReasons: string[] = [];
        if (
            context.audioInputSelection.isSelected &&
            context.audioInputSelection.availabilityKnown &&
            !context.audioInputSelection.isAvailable
        ) {
            blockedReasons.push(
                "選択中のマイクが見つかりません。別のマイクかブラウザ既定へ切り替えてください。",
            );
        }
        if (
            stateStore.get("enableCharacterGaze") &&
            context.videoInputSelection.isSelected &&
            context.videoInputSelection.availabilityKnown &&
            !context.videoInputSelection.isAvailable
        ) {
            blockedReasons.push(
                "Gaze が有効なため、有効な視線用カメラが必要です。別のカメラかブラウザ既定へ切り替えてください。",
            );
        }

        if (blockedReasons.length > 0) {
            return {
                startButtonDisabled: true,
                startButtonText: "開始できません",
                startButtonHint: blockedReasons.join(" "),
            };
        }

        return {
            startButtonDisabled: false,
            startButtonText: "開始する",
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

function buildAudioInputDeviceHint(
    isUserMediaAvailable: boolean,
    selectedAudioUnavailable: boolean,
): string | undefined {
    if (!isUserMediaAvailable) {
        return "このブラウザではマイク入力を取得できません。";
    }
    if (selectedAudioUnavailable) {
        return "選択中のマイクが見つからないため、開始前に別のマイクかブラウザ既定へ切り替えてください。";
    }
    return undefined;
}

function buildVideoInputDeviceHint(
    selectedVideoUnavailable: boolean,
    characterGazeEnabled: boolean,
): string | undefined {
    if (!selectedVideoUnavailable) {
        return undefined;
    }
    return characterGazeEnabled
        ? "選択中の視線用カメラが見つからないため、Gaze を使う前に別のカメラかブラウザ既定へ切り替えてください。"
        : "選択中の視線用カメラは現在見つかりません。Gaze を使うときは別のカメラかブラウザ既定へ切り替えてください。";
}
