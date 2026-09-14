import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import {
    type AudioConstraintRuntimeApplyReport,
    UserMediaManager,
    type VadStateReport,
} from "../../features/media/userMedia/userMediaManager";
import type { SincroAppSettings } from "../settings/sincroAppSettingsDefaults";
import type { SincroAppSettingsModel } from "../settings/sincroAppSettingsModel";
import type { SincroAppSettingsPersistence } from "../settings/sincroAppSettingsPersistence";
import { SincroAudioTuningBinding } from "./sincroAudioTuningBinding";

// getUserMedia と VAD/音声フィルタ設定の結線をまとめる controller。
// SincroAppSettingsModel(設定入力) / UserMediaManager(実処理) / DebugConsoleManager(診断UI) の橋渡し役。
export class SincroAudioInputController {
    private tuningBinding?: SincroAudioTuningBinding;
    private readonly settingsModel: SincroAppSettingsModel;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly userMediaManager: UserMediaManager;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private micSettingsSnapshot: MicSettingsSnapshot | undefined;
    private suppressNextMicSettingsSync = false;
    private onAudioTrackReplaced: (audioTrack: MediaStreamTrack) => void = () => {};
    private hasStarted = false;
    private pendingAudioInputRefreshToken = 0;
    private audioInputRefreshChain: Promise<void> = Promise.resolve();

    constructor(
        settingsModel: SincroAppSettingsModel,
        debugConsoleManager: DebugConsoleManager,
        chatMessageService: ChatMessageService,
    ) {
        this.settingsModel = settingsModel;
        this.debugConsoleManager = debugConsoleManager;
        this.chatMessageService = chatMessageService;
        this.userMediaManager = new UserMediaManager();
        this.characterBehaviorState = CharacterBehaviorState.getManager();

        this.bindSettingsToUserMedia();
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
                this.characterBehaviorState.clearErrorSource("media");
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

    private bindSettingsToUserMedia(): void {
        // 通常設定のマイク処理設定を getUserMedia 制約 / 実行中チェーンへ反映する。
        this.applyMicSettingsToUserMedia(true);
        this.settingsModel.subscribeSettingsChange(() => {
            if (this.suppressNextMicSettingsSync) {
                this.suppressNextMicSettingsSync = false;
                this.micSettingsSnapshot = this.readMicSettingsSnapshot();
                return;
            }
            this.applyMicSettingsToUserMedia(false);
        });
    }

    private bindDebugConsoleAndVadState(): void {
        // DebugConsole の初期表示値を UserMediaManager の内部状態に合わせる。
        this.syncInitialDebugConsoleAudioState();
        this.tuningBinding = new SincroAudioTuningBinding({
            debug: this.debugConsoleManager,
            media: this.userMediaManager,
            clearVenuePreset: () => this.clearVenuePresetIfEnabledWithoutResync(),
        });
        this.bindUserMediaStateCallbacks();
    }

    private syncInitialDebugConsoleAudioState(): void {
        this.debugConsoleManager.setLocalAudioFilterConfig(
            this.userMediaManager.getAudioFilterConfig(),
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
    }

    /** 通常設定の復元後・音声取得前に診断調整を実処理へ戻し、利用者操作の保存を開始する。 */
    restoreTuning(persistence: SincroAppSettingsPersistence): void {
        this.tuningBinding?.restore(
            persistence,
            this.settingsModel.getSetting("enableVenueNoiseMode"),
        );
    }

    private bindUserMediaStateCallbacks(): void {
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

    // 通常設定の「マイクまわり設定」のうち、runtime に効く項目だけを差分適用する。
    // settingsChange は title/talkMode 等でも発火するため、差分判定なしで全適用すると
    // Debug で調整したフィルタ値まで意図せず上書きしてしまう。
    private applyMicSettingsToUserMedia(forceAll: boolean): void {
        const next = this.readMicSettingsSnapshot();
        const prev = this.micSettingsSnapshot;

        if (forceAll || prev === undefined || prev.audioInputDeviceId !== next.audioInputDeviceId) {
            this.userMediaManager.setAudioInputDeviceId(next.audioInputDeviceId);
            if (!forceAll && prev !== undefined && this.hasStarted) {
                this.scheduleAudioInputRefresh();
            }
        }

        if (
            forceAll ||
            prev === undefined ||
            prev.enableNoiseSuppression !== next.enableNoiseSuppression
        ) {
            this.userMediaManager.setNoiseSuppression(next.enableNoiseSuppression);
        }
        if (
            forceAll ||
            prev === undefined ||
            prev.enableEchoCancellation !== next.enableEchoCancellation
        ) {
            this.userMediaManager.setEchoCancellation(next.enableEchoCancellation);
        }
        if (
            forceAll ||
            prev === undefined ||
            prev.enableAutoGainControl !== next.enableAutoGainControl
        ) {
            this.userMediaManager.setAutoGainControl(next.enableAutoGainControl);
        }
        if (forceAll || prev === undefined || prev.enableVadGate !== next.enableVadGate) {
            this.userMediaManager.setVadGateEnabled(next.enableVadGate);
        }
        if (
            forceAll ||
            prev === undefined ||
            prev.enableVenueNoiseMode !== next.enableVenueNoiseMode
        ) {
            this.userMediaManager.setVenueNoiseModeEnabled(next.enableVenueNoiseMode);
            if (!forceAll) this.tuningBinding?.clearVenueOverrides();
            // Venue preset は HPF/LPF と VAD閾値を同時変更するため、Debug UI も合わせて更新する。
            this.syncDebugConsoleFromUserMedia();
        }

        this.micSettingsSnapshot = next;
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
                    this.characterBehaviorState.clearErrorSource("media");
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

    /** 診断画面の個別調整時は騒音プリセット表示だけ解除し、通知による音声設定の再適用を一度抑止する。 */
    private clearVenuePresetIfEnabledWithoutResync(): boolean {
        if (!this.settingsModel.getSetting("enableVenueNoiseMode")) {
            return false;
        }
        // 通常設定のプリセット表示だけ更新し、settingsChange 経由の「デフォルトプロファイル再適用」を抑止する。
        this.suppressNextMicSettingsSync = true;
        this.settingsModel.updateSettings({ enableVenueNoiseMode: false });
        this.micSettingsSnapshot = this.readMicSettingsSnapshot();
        return true;
    }

    /** 設定変更通知の差分判定に使う、現在の音声設定を取得する。 */
    private readMicSettingsSnapshot(): MicSettingsSnapshot {
        return this.settingsModel.getSettings();
    }
}

/** 音声処理の差分判定で使う項目。値の型は通常設定から取得する。 */
type MicSettingsSnapshot = Pick<
    SincroAppSettings,
    | "enableNoiseSuppression"
    | "enableEchoCancellation"
    | "enableAutoGainControl"
    | "enableVadGate"
    | "enableVenueNoiseMode"
    | "audioInputDeviceId"
>;
