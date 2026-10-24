import type { InitialSincroCalibrationController } from "../../character/calibration/initialSincroCalibrationController";
import { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import { TalkManager } from "../../features/conversation/talk/talkManager";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { SincroRTCConfigManager } from "../../features/rtc/sincroRtcConfigManager";
import type { SincroAppSettingsModel } from "../settings/sincroAppSettingsModel";
import type { SincroAppSettingsPersistence } from "../settings/sincroAppSettingsPersistence";
import type { SincroAppEvent, SincroAppMediaState } from "./sincroAppTypes";
import { SincroAudioInputController } from "./sincroAudioInputController";
import { SincroCharacterGazeController } from "./sincroCharacterGazeController";
import { SincroRtcSessionController } from "./sincroRtcSessionController";

type SincroControllerOptions = {
    calibrationController: InitialSincroCalibrationController;
    settingsModel: SincroAppSettingsModel;
    emitEvent: (event: SincroAppEvent) => void;
};

/** アプリの音声・追跡・RTCを接続する。追跡終了だけを較正へ返し、音声・RTC失敗は独立して扱う。 */
export class SincroController {
    private generation = 0;
    private mediaState: SincroAppMediaState = {
        experienceActive: false,
        microphone: "idle",
        camera: "idle",
    };
    private readonly emitEvent: (event: SincroAppEvent) => void;
    private readonly settingsModel: SincroAppSettingsModel;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly rtcConfigManager: SincroRTCConfigManager;
    private readonly audioInputController: SincroAudioInputController;
    private readonly rtcSessionController: SincroRtcSessionController;
    private readonly unsubscribeMuteSettings: () => void;
    private readonly characterGazeController: SincroCharacterGazeController;

    constructor(options: SincroControllerOptions) {
        this.emitEvent = options.emitEvent;
        this.settingsModel = options.settingsModel;
        this.debugConsoleManager = DebugConsoleManager.getManager();
        this.chatMessageService = ChatMessageService.getService();
        const talkManager = TalkManager.getManager();
        this.rtcConfigManager = SincroRTCConfigManager.getManager((err) => {
            this.chatMessageService.writeErrorMessage(
                `WebRTCの設定の取得に失敗しました。 - ${err}`,
            );
        });
        this.audioInputController = new SincroAudioInputController(
            this.settingsModel,
            this.debugConsoleManager,
            this.chatMessageService,
        );
        this.characterGazeController = new SincroCharacterGazeController(
            this.settingsModel,
            this.debugConsoleManager,
            this.chatMessageService,
            options.emitEvent,
            options.calibrationController,
        );
        this.rtcSessionController = new SincroRtcSessionController(
            this.debugConsoleManager,
            talkManager,
            this.rtcConfigManager,
        );
        this.audioInputController.setUsageCallback((microphone) =>
            this.updateMediaState({ microphone }),
        );
        this.characterGazeController.setUsageCallback((camera) =>
            this.updateMediaState({ camera }),
        );
        // 手動ミュートは接続中にも反映し、診断時の自動ミュート抑止とは独立して保持する。
        this.unsubscribeMuteSettings = this.settingsModel.subscribeSettingsChange(() => {
            this.rtcSessionController.setManualMute(
                this.settingsModel.getSetting("muteMicrophone"),
            );
            if (!this.settingsModel.getSetting("enableAutoMute"))
                this.rtcSessionController.setAutoMute(false);
        });
    }

    /** 通常設定確定後、音声取得を開始する前に保存された診断調整を適用する。 */
    restoreAudioTuning(persistence: SincroAppSettingsPersistence): void {
        this.audioInputController.restoreTuning(persistence);
    }

    /** カメラ追跡と音声取得を独立して開始し、音声取得成功時だけRTCへ進む。 */
    start(onTrackingStopped: (reason: string) => void): void {
        const generation = ++this.generation;
        if (!this.mediaState.experienceActive) {
            this.updateMediaState({ experienceActive: true });
        }
        this.startCharacterGaze(onTrackingStopped);
        this.audioInputController.start(
            (audioTrack: MediaStreamTrack) => {
                if (generation !== this.generation || !this.mediaState.experienceActive) {
                    audioTrack.stop();
                    return;
                }
                this.startRTC(audioTrack);
            },
            (audioTrack: MediaStreamTrack) => {
                if (generation !== this.generation || !this.mediaState.experienceActive) {
                    audioTrack.stop();
                    return;
                }
                this.rtcSessionController.replaceAudioTrack(audioTrack);
            },
        );
    }

    /** 生成済み音声トラックと接続開始時点の会話モードでWebRTC接続を開始する。 */
    startRTC(audioTrack: MediaStreamTrack): void {
        this.rtcSessionController.setManualMute(this.settingsModel.getSetting("muteMicrophone"));
        this.rtcSessionController.start(audioTrack, this.settingsModel.getSetting("talkMode"));
    }

    // WebRTC接続を停止する。
    stopRTC(): void {
        this.rtcSessionController.stop();
    }

    /** RTC停止とは別に、取得世代を失効させ全機器・音声処理・追跡を終了する。 */
    endExperience(): void {
        ++this.generation;
        this.updateMediaState({ experienceActive: false });
        // 一つの所有者が失敗しても他の資源を解放し、全て試みた後で失敗を呼出元へ返す。
        const errors: unknown[] = [];
        for (const release of [
            () => this.rtcSessionController.stop(),
            () => this.audioInputController.stop(),
            () => this.debugConsoleManager.stopAudioMeters(),
            () => this.characterGazeController.stop(),
        ]) {
            try {
                release();
            } catch (error) {
                errors.push(error);
            }
        }
        if (errors.length > 0)
            throw Object.assign(new Error("Could not end all experience resources"), {
                cause: errors,
            });
    }

    private updateMediaState(partial: Partial<SincroAppMediaState>): void {
        this.mediaState = { ...this.mediaState, ...partial };
        this.emitEvent({ type: "media_state", state: { ...this.mediaState } });
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    private startCharacterGaze(onTrackingStopped: (reason: string) => void): void {
        this.characterGazeController.start((mute) => {
            this.rtcSessionController.setAutoMute(mute);
        }, onTrackingStopped);
    }

    /** アプリ差し替えで古い追跡通知を無効化する。RTC停止のリソース範囲は変えない。 */
    releaseTrackingSubscriptions(): void {
        this.unsubscribeMuteSettings();
        this.characterGazeController.releaseSubscriptions();
    }
}
