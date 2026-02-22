import { UserMediaManager, VadStateReport, VadThresholdMode as UserMediaVadThresholdMode } from "../RTC/UserMediaManager";
import { ChatMessageManager } from "../UI/ChatMessageManager";
import { DialogManager } from "../UI/DialogManager";
import {
    AudioFilterControlConfig,
    DebugConsoleManager,
    LearnedVadPerformanceMode,
    VadThresholdMode as DebugVadThresholdMode,
} from "../UI/DebugConsoleManager";

export class SincroAudioInputController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageManager: ChatMessageManager;
    private readonly userMediaManager: UserMediaManager;

    constructor(
        dialogManager: DialogManager,
        debugConsoleManager: DebugConsoleManager,
        chatMessageManager: ChatMessageManager,
    ) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
        this.chatMessageManager = chatMessageManager;
        this.userMediaManager = new UserMediaManager();

        this.bindDialogSettingsToUserMedia();
        this.bindDebugConsoleAndVadState();
    }

    // UserMedia取得を開始し、取得できたトラックを呼び出し元へ返す。
    // React移行中でも getUserMedia / VAD 実装はこの controller に集約しておく。
    start(
        onAudioTrack: (audioTrack: MediaStreamTrack) => void,
        onVideoTrack: (videoTrack: MediaStreamTrack) => void,
    ): void {
        if (!this.dialogManager.enableCharacterGaze()) {
            this.userMediaManager.disableVideo();
        }

        this.userMediaManager.getUserMedia(
            onAudioTrack,
            onVideoTrack,
            (err) => {
                this.chatMessageManager.writeErrorMessage(`カメラまたはマイクが見つかりませんでした。 - ${err}`);
            },
        );
    }

    private bindDialogSettingsToUserMedia(): void {
        // 設定ダイアログのマイク処理設定を getUserMedia 制約へ反映する。
        this.userMediaManager.setNoiseSuppression(this.dialogManager.enableNoiseSuppression());
        this.userMediaManager.setEchoCancellation(this.dialogManager.enableEchoCancellation());
        this.userMediaManager.setAutoGainControl(this.dialogManager.enableAutoGainControl());
        this.userMediaManager.setVadGateEnabled(this.dialogManager.enableVadGate());
        this.userMediaManager.setVenueNoiseModeEnabled(this.dialogManager.enableVenueNoiseMode());
    }

    private bindDebugConsoleAndVadState(): void {
        // DebugConsole の初期表示値を UserMediaManager の内部状態に合わせる。
        this.debugConsoleManager.setLocalAudioFilterConfig(this.userMediaManager.getAudioFilterConfig());
        this.debugConsoleManager.setLocalAudioFilterChangeCallback((config: AudioFilterControlConfig) => {
            this.userMediaManager.setAudioFilterConfig(config);
        });

        this.debugConsoleManager.setLocalVadRmsThreshold(this.userMediaManager.getVadThresholds().rmsThreshold);
        this.debugConsoleManager.setLocalVadThresholdMode(this.userMediaManager.getVadThresholdMode());
        this.debugConsoleManager.setLocalLearnedVadTuning(this.userMediaManager.getLearnedVadTuning());
        this.debugConsoleManager.setLocalLearnedVadStrictMode(this.userMediaManager.getLearnedVadStrictMode());
        // 学習VADは balanced を初期プリセットとして採用し、必要時にUIから変更できるようにする。
        this.debugConsoleManager.setLocalLearnedVadPerformanceMode("balanced");

        this.debugConsoleManager.setLocalVadThresholdModeChangeCallback((mode: DebugVadThresholdMode) => {
            this.userMediaManager.setVadThresholdMode(mode as UserMediaVadThresholdMode);
        });
        this.debugConsoleManager.setLocalLearnedVadPerformanceModeChangeCallback((mode: LearnedVadPerformanceMode) => {
            this.userMediaManager.setLearnedVadPerformanceMode(mode);
            this.debugConsoleManager.setLocalLearnedVadTuning(this.userMediaManager.getLearnedVadTuning());
        });
        this.debugConsoleManager.setLocalLearnedVadTuningChangeCallback((config) => {
            this.userMediaManager.setLearnedVadTuning(config);
        });
        this.debugConsoleManager.setLocalLearnedVadStrictModeChangeCallback((enabled) => {
            this.userMediaManager.setLearnedVadStrictMode(enabled);
        });
        this.debugConsoleManager.setLocalVadRmsThresholdChangeCallback((threshold: number) => {
            this.userMediaManager.setVadThresholds({ rmsThreshold: threshold });
        });

        // UserMedia 側で更新される状態を DebugConsole へ戻し、UI表示と内部状態を同期する。
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
        });
    }
}
