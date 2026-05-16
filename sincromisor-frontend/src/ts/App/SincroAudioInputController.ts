import {
    type AudioConstraintRuntimeApplyReport,
    UserMediaManager,
    type VadThresholdMode as UserMediaVadThresholdMode,
    type VadStateReport,
} from "../RTC/UserMediaManager";
import { CharacterBehaviorState } from "../SincroVRM/VRMCharacter/CharacterBehaviorState";
import type { ChatMessageService } from "../UI/ChatMessageService";
import type {
    AudioFilterControlConfig,
    DebugConsoleManager,
    VadThresholdMode as DebugVadThresholdMode,
    LearnedVadPerformanceMode,
} from "../UI/DebugConsoleManager";
import type { DialogManager } from "../UI/DialogManager";

// getUserMedia と VAD/音声フィルタ設定の結線をまとめる controller。
// DialogManager(設定入力) / UserMediaManager(実処理) / DebugConsoleManager(診断UI) の橋渡し役。
export class SincroAudioInputController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly userMediaManager: UserMediaManager;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private dialogMicSettingsSnapshot: DialogMicSettingsSnapshot | null = null;
    private suppressNextDialogMicSettingsSync = false;
    private onAudioTrackReplaced: (audioTrack: MediaStreamTrack) => void = () => {};
    private hasStarted = false;
    private pendingAudioInputRefreshToken = 0;
    private audioInputRefreshChain: Promise<void> = Promise.resolve();

    constructor(
        dialogManager: DialogManager,
        debugConsoleManager: DebugConsoleManager,
        chatMessageService: ChatMessageService,
    ) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
        this.chatMessageService = chatMessageService;
        this.userMediaManager = new UserMediaManager();
        this.characterBehaviorState = CharacterBehaviorState.getManager();

        this.bindDialogSettingsToUserMedia();
        this.bindDebugConsoleAndVadState();
    }

    // UserMedia取得を開始し、取得できたトラックを呼び出し元へ返す。
    // React移行中でも getUserMedia / VAD 実装はこの controller に集約しておく。
    start(
        onAudioTrack: (audioTrack: MediaStreamTrack) => void,
        onAudioTrackReplaced: (audioTrack: MediaStreamTrack) => void,
    ): void {
        this.onAudioTrackReplaced = onAudioTrackReplaced;
        this.hasStarted = true;
        // CharacterGaze 用カメラは専用 manager で取得する。
        // 音声入力の初回 getUserMedia では常に video を無効化し、不要な二重取得を避ける。
        this.userMediaManager.disableVideo();

        this.userMediaManager.getUserMedia(
            (audioTrack) => {
                this.characterBehaviorState.setErrorSource("media", null);
                onAudioTrack(audioTrack);
            },
            () => {},
            (err) => {
                this.characterBehaviorState.setErrorSource(
                    "media",
                    `マイク入力の取得に失敗しました。${err}`,
                );
                this.chatMessageService.writeErrorMessage(
                    `カメラまたはマイクが見つかりませんでした。 - ${err}`,
                );
            },
        );
    }

    private bindDialogSettingsToUserMedia(): void {
        // 設定ダイアログのマイク処理設定を getUserMedia 制約 / 実行中チェーンへ反映する。
        this.applyDialogMicSettingsToUserMedia(true);
        this.dialogManager.subscribeSettingsChange(() => {
            if (this.suppressNextDialogMicSettingsSync) {
                this.suppressNextDialogMicSettingsSync = false;
                this.dialogMicSettingsSnapshot = this.readDialogMicSettingsSnapshot();
                return;
            }
            this.applyDialogMicSettingsToUserMedia(false);
        });
    }

    private bindDebugConsoleAndVadState(): void {
        // DebugConsole の初期表示値を UserMediaManager の内部状態に合わせる。
        this.debugConsoleManager.setLocalAudioFilterConfig(
            this.userMediaManager.getAudioFilterConfig(),
        );
        this.debugConsoleManager.setLocalAudioFilterChangeCallback(
            (config: AudioFilterControlConfig) => {
                this.userMediaManager.setAudioFilterConfig(config);
                // Venue preset 有効中にDebugで個別調整した場合は、preset状態を解除して表示を実効値へ揃える。
                this.clearVenuePresetIfEnabledWithoutResync();
            },
        );

        this.debugConsoleManager.setLocalVadRmsThreshold(
            this.userMediaManager.getVadThresholds().rmsThreshold,
        );
        this.debugConsoleManager.setLocalVadThresholdMode(
            this.userMediaManager.getVadThresholdMode(),
        );
        this.debugConsoleManager.setLocalLearnedVadTuning(
            this.userMediaManager.getLearnedVadTuning(),
        );
        this.debugConsoleManager.setLocalLearnedVadStrictMode(
            this.userMediaManager.getLearnedVadStrictMode(),
        );
        // 学習VADは balanced を初期プリセットとして採用し、必要時にUIから変更できるようにする。
        this.debugConsoleManager.setLocalLearnedVadPerformanceMode("balanced");

        // DebugConsole での調整操作を UserMediaManager 側の実処理へ反映する。
        this.debugConsoleManager.setLocalVadThresholdModeChangeCallback(
            (mode: DebugVadThresholdMode) => {
                this.userMediaManager.setVadThresholdMode(mode as UserMediaVadThresholdMode);
            },
        );
        this.debugConsoleManager.setLocalLearnedVadPerformanceModeChangeCallback(
            (mode: LearnedVadPerformanceMode) => {
                this.userMediaManager.setLearnedVadPerformanceMode(mode);
                this.debugConsoleManager.setLocalLearnedVadTuning(
                    this.userMediaManager.getLearnedVadTuning(),
                );
            },
        );
        this.debugConsoleManager.setLocalLearnedVadTuningChangeCallback((config) => {
            this.userMediaManager.setLearnedVadTuning(config);
        });
        this.debugConsoleManager.setLocalLearnedVadStrictModeChangeCallback((enabled) => {
            this.userMediaManager.setLearnedVadStrictMode(enabled);
        });
        this.debugConsoleManager.setLocalVadRmsThresholdChangeCallback((threshold: number) => {
            this.userMediaManager.setVadThresholds({ rmsThreshold: threshold });
            // Venue preset が保持する閾値から外れるため、UI上の preset 表示は解除しておく。
            this.clearVenuePresetIfEnabledWithoutResync();
        });

        // UserMedia 側で更新される状態を DebugConsole へ戻し、UI表示と内部状態を同期する。
        // 双方向同期にしているのは、内部補正（学習VADプリセット適用など）を UI に反映するため。
        this.userMediaManager.setVadThresholdCallback((config) => {
            this.debugConsoleManager.setLocalVadRmsThreshold(config.rmsThreshold);
        });
        this.userMediaManager.setLearnedVadStateCallback((report) => {
            this.debugConsoleManager.updateLearnedVadState({
                status: report.status,
                probability: report.probability,
                txFrames: report.txFrames,
                rxPredictions: report.rxPredictions,
                message: report.message,
            });
        });
        this.userMediaManager.setVadStateCallback((report: VadStateReport) => {
            this.debugConsoleManager.updateLocalVadState(report.isSpeech);
            this.characterBehaviorState.applyVadState(report);
        });
        this.userMediaManager.setAudioConstraintRuntimeApplyCallback(
            (report: AudioConstraintRuntimeApplyReport) => {
                this.debugConsoleManager.updateLocalAudioConstraintApplyStatus(report);
            },
        );
    }

    // Dialog にある「マイクまわり設定」のうち、runtime に効く項目だけを差分適用する。
    // settingsChange は title/talkMode 等でも発火するため、差分判定なしで全適用すると
    // Debug で調整したフィルタ値まで意図せず上書きしてしまう。
    private applyDialogMicSettingsToUserMedia(forceAll: boolean): void {
        const next = this.readDialogMicSettingsSnapshot();
        const prev = this.dialogMicSettingsSnapshot;

        if (forceAll || !prev || prev.audioInputDeviceId !== next.audioInputDeviceId) {
            this.userMediaManager.setAudioInputDeviceId(next.audioInputDeviceId);
            if (!forceAll && prev && this.hasStarted) {
                this.scheduleAudioInputRefresh();
            }
        }

        if (forceAll || !prev || prev.enableNoiseSuppression !== next.enableNoiseSuppression) {
            this.userMediaManager.setNoiseSuppression(next.enableNoiseSuppression);
        }
        if (forceAll || !prev || prev.enableEchoCancellation !== next.enableEchoCancellation) {
            this.userMediaManager.setEchoCancellation(next.enableEchoCancellation);
        }
        if (forceAll || !prev || prev.enableAutoGainControl !== next.enableAutoGainControl) {
            this.userMediaManager.setAutoGainControl(next.enableAutoGainControl);
        }
        if (forceAll || !prev || prev.enableVadGate !== next.enableVadGate) {
            this.userMediaManager.setVadGateEnabled(next.enableVadGate);
        }
        if (forceAll || !prev || prev.enableVenueNoiseMode !== next.enableVenueNoiseMode) {
            this.userMediaManager.setVenueNoiseModeEnabled(next.enableVenueNoiseMode);
            // Venue preset は HPF/LPF と VAD閾値を同時変更するため、Debug UI も合わせて更新する。
            this.syncDebugConsoleFromUserMedia();
        }

        this.dialogMicSettingsSnapshot = next;
    }

    private scheduleAudioInputRefresh(): void {
        const refreshToken = ++this.pendingAudioInputRefreshToken;
        this.audioInputRefreshChain = this.audioInputRefreshChain
            .catch(() => {
                // 直前の切替失敗でチェーン全体が止まらないようにする。
            })
            .then(async () => {
                if (refreshToken !== this.pendingAudioInputRefreshToken) {
                    return;
                }
                const selectedDeviceId = this.userMediaManager.getAudioInputDeviceId();
                try {
                    const nextAudioTrack = await this.userMediaManager.reacquireAudioTrack();
                    this.characterBehaviorState.setErrorSource("media", null);
                    this.onAudioTrackReplaced(nextAudioTrack);
                } catch (err) {
                    const detail = err instanceof Error ? err.message : String(err);
                    this.characterBehaviorState.setErrorSource(
                        "media",
                        `マイク入力への切替に失敗しました。${detail}`,
                    );
                    const deviceLabel = selectedDeviceId
                        ? `deviceId=${selectedDeviceId}`
                        : "既定デバイス";
                    this.chatMessageService.writeErrorMessage(
                        `選択したマイク入力への切替に失敗しました。(${deviceLabel}) - ${detail}`,
                    );
                }
            });
    }

    private syncDebugConsoleFromUserMedia(): void {
        this.debugConsoleManager.setLocalAudioFilterConfig(
            this.userMediaManager.getAudioFilterConfig(),
        );
        this.debugConsoleManager.setLocalVadRmsThreshold(
            this.userMediaManager.getVadThresholds().rmsThreshold,
        );
        this.debugConsoleManager.setLocalVadThresholdMode(
            this.userMediaManager.getVadThresholdMode(),
        );
    }

    private clearVenuePresetIfEnabledWithoutResync(): void {
        if (!this.dialogManager.enableVenueNoiseMode()) {
            return;
        }
        // dialog state だけ更新し、settingsChange 経由の「デフォルトプロファイル再適用」を抑止する。
        this.suppressNextDialogMicSettingsSync = true;
        this.dialogManager.setEnableVenueNoiseMode(false);
        this.dialogMicSettingsSnapshot = this.readDialogMicSettingsSnapshot();
    }

    private readDialogMicSettingsSnapshot(): DialogMicSettingsSnapshot {
        return {
            enableNoiseSuppression: this.dialogManager.enableNoiseSuppression(),
            enableEchoCancellation: this.dialogManager.enableEchoCancellation(),
            enableAutoGainControl: this.dialogManager.enableAutoGainControl(),
            enableVadGate: this.dialogManager.enableVadGate(),
            enableVenueNoiseMode: this.dialogManager.enableVenueNoiseMode(),
            audioInputDeviceId: this.dialogManager.audioInputDeviceId(),
        };
    }
}

type DialogMicSettingsSnapshot = {
    enableNoiseSuppression: boolean;
    enableEchoCancellation: boolean;
    enableAutoGainControl: boolean;
    enableVadGate: boolean;
    enableVenueNoiseMode: boolean;
    audioInputDeviceId: string | null;
};
