import type { ChatMessage, TelopChannelMessage } from "../RTC/RTCMessage";
import { RTCTalkClient } from "../RTC/RTCTalkClient";
import type { SincroRTCConfigManager } from "../RTC/SincroRTCConfigManager";
import type { TalkManager } from "../RTC/TalkManager";
import { CharacterBehaviorState } from "../SincroVRM/VRMCharacter/CharacterBehaviorState";
import type { DebugConsoleManager } from "../UI/DebugConsoleManager";

// SincroController から分離した「RTC セッション開始/停止 + channel callback 配線」担当。
// WebRTC本体(RTCTalkClient)と UI/表示系(TalkManager, DebugConsoleManager)の結線を担当する。
export class SincroRtcSessionController {
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly talkManager: TalkManager;
    private readonly rtcConfigManager: SincroRTCConfigManager;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private rtcc?: RTCTalkClient;

    constructor(
        debugConsoleManager: DebugConsoleManager,
        talkManager: TalkManager,
        rtcConfigManager: SincroRTCConfigManager,
    ) {
        this.debugConsoleManager = debugConsoleManager;
        this.talkManager = talkManager;
        this.rtcConfigManager = rtcConfigManager;
        this.characterBehaviorState = CharacterBehaviorState.getManager();
    }

    // WebRTC接続を開始する。生成済みローカル音声トラックをRTCPeerConnectionへ渡す。
    start(audioTrack: MediaStreamTrack, talkMode: string): void {
        const config = this.rtcConfigManager.config;
        if (config === undefined) {
            // 設定取得前に start が呼ばれても、従来どおり例外化せず安全に無視する。
            return;
        }

        // フロント側の入力音量を可視化できるよう、ローカルトラックをデバッグへ渡す。
        this.debugConsoleManager.setLocalAudioTrack(audioTrack);
        this.characterBehaviorState.setTalkMode(talkMode);
        this.characterBehaviorState.clearErrorSource("rtc");

        const rtcc = new RTCTalkClient(config, audioTrack, talkMode);
        this.setTextChannelCallback(rtcc);
        this.setTelopChannelCallback(rtcc);
        rtcc.rtcHealthCallback = (message) => {
            if (message === undefined) {
                this.characterBehaviorState.clearErrorSource("rtc");
                return;
            }
            this.characterBehaviorState.setErrorSource("rtc", message);
        };
        this.rtcc = rtcc;
        rtcc.start();
    }

    // 実行中の送信用音声トラックを差し替え、Debug Console の監視対象も追従させる。
    replaceAudioTrack(audioTrack: MediaStreamTrack): void {
        this.debugConsoleManager.setLocalAudioTrack(audioTrack);
        void this.rtcc?.replaceAudioTrack(audioTrack);
    }

    // WebRTC接続を停止する。
    stop(): void {
        // RTCTalkClient 側が stop の冪等性を担保しているため、ここは委譲に徹する。
        this.rtcc?.stop();
        this.characterBehaviorState.setErrorSource(
            "rtc",
            "音声認識・合成システムとの接続を停止しました。",
        );
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
