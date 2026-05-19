import { SincroAudioInputController } from "./app/sincroAudioInputController";
import { SincroCharacterGazeController } from "./app/sincroCharacterGazeController";
import { SincroRtcSessionController } from "./app/sincroRtcSessionController";
import { SincroRTCConfigManager } from "./rtc/sincroRtcConfigManager";
import { TalkManager } from "./rtc/talkManager";
import { ChatMessageService } from "./ui/chatMessageService";
import { DebugConsoleManager } from "./ui/debugConsoleManager";
import { DialogManager } from "./ui/dialogManager";

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

    constructor() {
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

    // WebRTC接続を開始する。生成済みローカル音声トラックをRTCPeerConnectionへ渡す。
    startRTC(audioTrack: MediaStreamTrack): void {
        this.rtcSessionController.start(audioTrack, this.dialogManager.talkMode());
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
