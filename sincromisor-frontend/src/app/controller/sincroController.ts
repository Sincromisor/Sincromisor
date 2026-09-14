import type { InitialSincroCalibrationController } from "../../character/calibration/initialSincroCalibrationController";
import { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import { TalkManager } from "../../features/conversation/talk/talkManager";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { SincroRTCConfigManager } from "../../features/rtc/sincroRtcConfigManager";
import type { SincroAppSettingsModel } from "../settings/sincroAppSettingsModel";
import type { SincroAppSettingsPersistence } from "../settings/sincroAppSettingsPersistence";
import type { SincroAppEvent } from "./sincroAppTypes";
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
    private readonly settingsModel: SincroAppSettingsModel;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly rtcConfigManager: SincroRTCConfigManager;
    private readonly audioInputController: SincroAudioInputController;
    private readonly rtcSessionController: SincroRtcSessionController;
    private readonly characterGazeController: SincroCharacterGazeController;

    constructor(options: SincroControllerOptions) {
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
    }

    /** 通常設定確定後、音声取得を開始する前に保存された診断調整を適用する。 */
    restoreAudioTuning(persistence: SincroAppSettingsPersistence): void {
        this.audioInputController.restoreTuning(persistence);
    }

    /** カメラ追跡と音声取得を独立して開始し、音声取得成功時だけRTCへ進む。 */
    start(onTrackingStopped: (reason: string) => void): void {
        this.startCharacterGaze(onTrackingStopped);
        this.audioInputController.start(
            (audioTrack: MediaStreamTrack) => {
                this.startRTC(audioTrack);
            },
            (audioTrack: MediaStreamTrack) => {
                this.rtcSessionController.replaceAudioTrack(audioTrack);
            },
        );
    }

    /** 生成済み音声トラックと接続開始時点の会話モードでWebRTC接続を開始する。 */
    startRTC(audioTrack: MediaStreamTrack): void {
        this.rtcSessionController.start(audioTrack, this.settingsModel.getSetting("talkMode"));
    }

    // WebRTC接続を停止する。
    stopRTC(): void {
        this.rtcSessionController.stop();
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    private startCharacterGaze(onTrackingStopped: (reason: string) => void): void {
        this.characterGazeController.start((mute) => {
            this.rtcSessionController.setMute(mute);
        }, onTrackingStopped);
    }

    /** アプリ差し替えで古い追跡通知を無効化する。RTC停止のリソース範囲は変えない。 */
    releaseTrackingSubscriptions(): void {
        this.characterGazeController.releaseSubscriptions();
    }
}
