import { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import { TalkManager } from "../../features/conversation/talk/talkManager";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { DialogManager } from "../../features/dialog/model/dialogManager";
import { SincroRTCConfigManager } from "../../features/rtc/sincroRtcConfigManager";
import type { SincroAppEvent } from "./sincroAppTypes";
import { SincroAudioInputController } from "./sincroAudioInputController";
import { SincroCharacterGazeController } from "./sincroCharacterGazeController";
import { SincroRtcSessionController } from "./sincroRtcSessionController";

type SincroControllerOptions = {
    emitEvent: (event: SincroAppEvent) => void;
};

// 旧来のアプリ本体 controller。
// 以前は巨大 constructor に UI/RTC/Media/Gaze の配線を集中させていたが、
// React移行に合わせて各責務を App/*Controller へ分離し、ここは起動順序の統括に寄せている。
export class SincroController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly rtcConfigManager: SincroRTCConfigManager;
    private readonly audioInputController: SincroAudioInputController;
    private readonly rtcSessionController: SincroRtcSessionController;
    private readonly characterGazeController: SincroCharacterGazeController;

    constructor(options: SincroControllerOptions) {
        this.dialogManager = DialogManager.getManager();
        this.debugConsoleManager = DebugConsoleManager.getManager();
        this.chatMessageService = ChatMessageService.getService();
        const talkManager = TalkManager.getManager();
        this.rtcConfigManager = SincroRTCConfigManager.getManager((err) => {
            this.chatMessageService.writeErrorMessage(
                `WebRTCの設定の取得に失敗しました。 - ${err}`,
            );
        });
        this.audioInputController = new SincroAudioInputController(
            this.dialogManager,
            this.debugConsoleManager,
            this.chatMessageService,
        );
        this.characterGazeController = new SincroCharacterGazeController(
            this.dialogManager,
            this.debugConsoleManager,
            this.chatMessageService,
            options.emitEvent,
        );
        this.rtcSessionController = new SincroRtcSessionController(
            this.debugConsoleManager,
            talkManager,
            this.rtcConfigManager,
        );
    }

    // アプリ制御の開始点。
    // UserMedia -> (audio)RTC / (video)CharacterGaze の分岐だけを担い、個別処理は各 controller へ委譲する。
    start(): void {
        this.startCharacterGaze();
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
        this.rtcSessionController.start(audioTrack, this.dialogManager.getSetting("talkMode"));
    }

    // WebRTC接続を停止する。
    stopRTC(): void {
        this.rtcSessionController.stop();
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    private startCharacterGaze(): void {
        this.characterGazeController.start((mute) => {
            this.rtcSessionController.setMute(mute);
        });
    }
}
