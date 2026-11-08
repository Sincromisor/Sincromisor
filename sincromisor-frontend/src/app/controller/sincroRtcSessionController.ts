import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { TalkManager } from "../../features/conversation/talk/talkManager";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { ChatMessage, TelopChannelMessage } from "../../features/rtc/rtcMessage";
import { RTCTalkClient } from "../../features/rtc/rtcTalkClient";
import type { SincroRTCConfigManager } from "../../features/rtc/sincroRtcConfigManager";

/**
 * 設定取得を待つ開始要求とRTC接続を所有し、会話表示・診断・キャラクター状態へ受信結果を渡す。
 * 停止時は開始世代を失効させ、取得完了後に古い音声トラックで接続を作らない。
 */
export class SincroRtcSessionController {
    private readonly debugConsoleManager: Pick<DebugConsoleManager, "setLocalAudioTrack">;
    private readonly talkManager: Pick<
        TalkManager,
        "addTextChannelMessage" | "addTelopChannelMessage"
    >;
    private readonly rtcConfigManager: Pick<SincroRTCConfigManager, "config" | "getConfig">;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private rtcc?: RTCTalkClient;
    private generation = 0;
    private pendingAudioTrack?: MediaStreamTrack;
    private activeTalkMode = "chat";
    private manuallyMuted = false;
    private automaticallyMuted = false;

    constructor(
        debugConsoleManager: Pick<DebugConsoleManager, "setLocalAudioTrack">,
        talkManager: Pick<TalkManager, "addTextChannelMessage" | "addTelopChannelMessage">,
        rtcConfigManager: Pick<SincroRTCConfigManager, "config" | "getConfig">,
    ) {
        this.debugConsoleManager = debugConsoleManager;
        this.talkManager = talkManager;
        this.rtcConfigManager = rtcConfigManager;
        this.characterBehaviorState = CharacterBehaviorState.getManager();
    }

    /** 設定取得と音声入力の準備を合わせ、停止済みの開始要求は接続を生成せず破棄する。 */
    async start(audioTrack: MediaStreamTrack, talkMode: string): Promise<void> {
        const generation = ++this.generation;
        this.rtcc?.stop();
        this.rtcc = undefined;
        this.pendingAudioTrack = audioTrack;
        this.activeTalkMode = talkMode;
        try {
            const config =
                this.rtcConfigManager.config ?? (await this.rtcConfigManager.getConfig());
            if (generation !== this.generation) return;
            const track = this.pendingAudioTrack;
            this.pendingAudioTrack = undefined;
            if (track !== undefined) this.connect(config, track, talkMode);
        } catch {
            if (generation !== this.generation) return;
            this.pendingAudioTrack = undefined;
            this.characterBehaviorState.setErrorSource(
                "rtc",
                "RTCの接続設定を取得できませんでした。接続を開始し直してください。",
            );
        }
    }

    /** 設定確定後に受信通知とミュートを配線し、交渉を開始する。 */
    private connect(
        config: NonNullable<SincroRTCConfigManager["config"]>,
        audioTrack: MediaStreamTrack,
        talkMode: string,
    ): void {
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
        rtcc.sessionResetCallback = () => this.setTelopChannelCallback(rtcc);
        rtcc.rtcHealthCallback = (message) => {
            if (message === undefined) {
                this.characterBehaviorState.clearErrorSource("rtc");
                return;
            }
            this.characterBehaviorState.setErrorSource("rtc", message);
        };
        this.rtcc = rtcc;
        this.applyMute();
        void rtcc.start();
    }

    /** 設定待機中または接続中の送信トラックを差し替え、音量監視も新トラックへ移す。 */
    replaceAudioTrack(audioTrack: MediaStreamTrack): void {
        this.debugConsoleManager.setLocalAudioTrack(audioTrack);
        if (this.pendingAudioTrack !== undefined) this.pendingAudioTrack = audioTrack;
        void this.rtcc?.replaceAudioTrack(audioTrack);
    }

    /** 設定待機中の開始要求を失効させ、そのトラックと生成済み接続を停止する。 */
    stop(): void {
        ++this.generation;
        this.pendingAudioTrack?.stop();
        this.pendingAudioTrack = undefined;
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

    /** 接続世代ごとにテロップの順序判定を作り直し、受理したものだけを会話表示へ渡す。 */
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
