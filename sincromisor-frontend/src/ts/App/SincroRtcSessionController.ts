import { RTCTalkClient } from "../RTC/RTCTalkClient";
import { ChatMessage, TelopChannelMessage } from "../RTC/RTCMessage";
import { SincroRTCConfigManager } from "../RTC/SincroRTCConfigManager";
import { TalkManager } from "../RTC/TalkManager";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";

export class SincroRtcSessionController {
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly talkManager: TalkManager;
    private readonly rtcConfigManager: SincroRTCConfigManager;
    private rtcc?: RTCTalkClient;

    constructor(
        debugConsoleManager: DebugConsoleManager,
        talkManager: TalkManager,
        rtcConfigManager: SincroRTCConfigManager,
    ) {
        this.debugConsoleManager = debugConsoleManager;
        this.talkManager = talkManager;
        this.rtcConfigManager = rtcConfigManager;
    }

    // WebRTC接続を開始する。生成済みローカル音声トラックをRTCPeerConnectionへ渡す。
    start(audioTrack: MediaStreamTrack, talkMode: string): void {
        if (!this.rtcConfigManager.config) {
            // 設定取得前に start が呼ばれても、従来どおり例外化せず安全に無視する。
            return;
        }

        // フロント側の入力音量を可視化できるよう、ローカルトラックをデバッグへ渡す。
        this.debugConsoleManager.setLocalAudioTrack(audioTrack);

        const rtcc = new RTCTalkClient(this.rtcConfigManager.config, audioTrack, talkMode);
        this.setTextChannelCallback(rtcc);
        this.setTelopChannelCallback(rtcc);
        this.rtcc = rtcc;
        rtcc.start();
    }

    // WebRTC接続を停止する。
    stop(): void {
        // RTCTalkClient 側が stop の冪等性を担保しているため、ここは委譲に徹する。
        this.rtcc?.stop();
    }

    // CharacterGaze の AutoMute から使う薄い委譲。
    setMute(mute: boolean): void {
        this.rtcc?.setMute(mute);
    }

    // textチャネル受信メッセージをTalkManagerへ連携する。
    private setTextChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.textChannelCallback = (chatMsg: ChatMessage) => {
            this.talkManager.addTextChannelMessage(chatMsg);
        };
    }

    // telopチャネル受信メッセージをTalkManagerへ連携する。
    private setTelopChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.telopChannelCallback = (vcMsg: TelopChannelMessage) => {
            this.talkManager.addTelopChannelMessage(vcMsg);
        };
    }
}
