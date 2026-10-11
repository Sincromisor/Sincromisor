import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { TalkManager } from "../../features/conversation/talk/talkManager";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { ChatMessage, TelopChannelMessage } from "../../features/rtc/rtcMessage";
import { RTCTalkClient } from "../../features/rtc/rtcTalkClient";
import type { SincroRTCConfigManager } from "../../features/rtc/sincroRtcConfigManager";

// SincroController から分離した「RTC セッション開始/停止 + channel callback 配線」担当。
// WebRTC本体(RTCTalkClient)と UI/表示系(TalkManager, DebugConsoleManager)の結線を担当する。
export class SincroRtcSessionController {
    private readonly debugConsoleManager: Pick<DebugConsoleManager, "setLocalAudioTrack">;
    private readonly talkManager: Pick<
        TalkManager,
        "addTextChannelMessage" | "addTelopChannelMessage"
    >;
    private readonly rtcConfigManager: Pick<SincroRTCConfigManager, "config">;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private rtcc?: RTCTalkClient;
    private activeTalkMode = "chat";
    private manuallyMuted = false;
    private automaticallyMuted = false;

    constructor(
        debugConsoleManager: Pick<DebugConsoleManager, "setLocalAudioTrack">,
        talkManager: Pick<TalkManager, "addTextChannelMessage" | "addTelopChannelMessage">,
        rtcConfigManager: Pick<SincroRTCConfigManager, "config">,
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
        this.activeTalkMode = talkMode;
        this.automaticallyMuted = false;
        // 診断は通信モードであり、キャラクターの動作分類はchatとして扱う。
        this.characterBehaviorState.setTalkMode(
            talkMode === "echo" || talkMode === "playback" ? "chat" : talkMode,
        );
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
        this.applyMute();
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
            this.activeTalkMode === "echo"
                ? "入力音声の折り返し診断を停止しました。"
                : this.activeTalkMode === "playback"
                  ? "サンプル音声の繰り返し再生を停止しました。"
                  : "音声認識・合成システムとの接続を停止しました。",
        );
    }

    /** 視線による自動ミュートは診断中に無視する。接続開始時のモードを使い、設定変更だけでは切り替えない。 */
    setAutoMute(mute: boolean): void {
        this.automaticallyMuted =
            this.activeTalkMode !== "echo" && this.activeTalkMode !== "playback" && mute;
        this.applyMute();
    }

    /** 手動ミュートは全モードで優先し、機器差し替えや再接続にもRTCTalkClientが引き継ぐ。 */
    setManualMute(mute: boolean): void {
        this.manuallyMuted = mute;
        this.applyMute();
    }

    private applyMute(): void {
        this.rtcc?.setMute(this.manuallyMuted || this.automaticallyMuted);
    }

    // textチャネル受信メッセージをTalkManagerへ連携する。
    private setTextChannelCallback(rtcc: RTCTalkClient): void {
        rtcc.textChannelCallback = (chatMsg: ChatMessage) => {
            this.talkManager.addTextChannelMessage(chatMsg);
        };
    }

    // telopチャネル受信メッセージをTalkManagerへ連携する。
    private setTelopChannelCallback(rtcc: RTCTalkClient): void {
        // telop_chは順不同で届く。playbackの周回IDは単調増加するため、遅れて届いた
        // 旧周回や同一周回の過去時刻を捨てる。判定は接続ごとに作り直す。
        let speechID = -1;
        let timestamp = -1;
        rtcc.telopChannelCallback = (vcMsg: TelopChannelMessage) => {
            if (this.activeTalkMode === "playback") {
                if (
                    vcMsg.speech_id < speechID ||
                    (vcMsg.speech_id === speechID && vcMsg.timestamp < timestamp)
                ) {
                    return;
                }
                speechID = vcMsg.speech_id;
                timestamp = vcMsg.timestamp;
            }
            this.talkManager.addTelopChannelMessage(vcMsg);
        };
    }
}
