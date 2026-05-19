import { frontendLogger } from "../logging/appLogger";
import { ChatMessageService } from "../ui/chatMessageService";
import { DebugConsoleManager } from "../ui/debugConsoleManager";
import { replaceRtcAudioTrack, setRtcAudioMute } from "./rtcAudioTrackSender";
import { handleRtcIceConnectionState } from "./rtcConnectionStateHandler";
import { sendRtcIceCandidate } from "./rtcIceCandidateSender";
import { captureIceFailureDiagnostics } from "./rtcIceDiagnostics";
import type { ChatMessage, TelopChannelMessage } from "./rtcMessage";
import { negotiateRtcSession } from "./rtcNegotiation";
import { createRtcPeerConnectionBundle } from "./rtcPeerConnectionFactory";
import { closeRtcPeerConnection } from "./rtcPeerConnectionShutdown";
import { RtcStatsReporter } from "./rtcStatsReporter";
import type { SincroRTCConfig } from "./sincroRtcConfigManager";

// 1接続分の WebRTC セッションを管理するクライアント。
// DataChannel(text/telop)・ICE/SDP診断表示・再接続制御までをまとめて担当する。
export class RTCTalkClient {
    private readonly logger: DebugConsoleManager;
    private readonly statsReporter: RtcStatsReporter;
    private readonly peerConnection: RTCPeerConnection;
    private readonly telopChannel: RTCDataChannel;
    private readonly textChannel: RTCDataChannel;
    private readonly chatMessageService: ChatMessageService;
    private readonly talkMode: string;
    private sincroConfig: SincroRTCConfig;
    // /offer 応答で払い出されるサーバー側セッションID。
    // Trickle ICEの candidate 送信先セッションの特定に使う。
    private sessionId?: string;
    // /offer 応答より先に onicecandidate が発火するため、
    // セッションID取得前のcandidateを一時保管する。
    private pendingIceCandidates: Array<RTCIceCandidateInit | null> = [];
    private statsIntervalId?: number;
    private iceFailureDiagnosticCaptured = false;
    private reconnectTimerId?: number;
    private isNegotiating = false;
    private reconnectAttempt = 0;
    private isMuted = false;
    // 直近で接続確立に成功したsession_id。
    // ICE切断後の再接続で「同一セッション更新」を試すために保持する。
    private lastStableSessionId?: string;

    telopChannelCallback: (msg: TelopChannelMessage) => void = () => {};
    textChannelCallback: (msg: ChatMessage) => void = () => {};
    rtcHealthCallback: (message?: string) => void = () => {};

    /* talk_mode: chat, sincro */
    constructor(sincroConfig: SincroRTCConfig, audioTrack: MediaStreamTrack, talkMode: string) {
        this.logger = DebugConsoleManager.getManager();
        this.statsReporter = new RtcStatsReporter(this.logger);
        this.chatMessageService = ChatMessageService.getService();
        this.talkMode = talkMode;
        this.sincroConfig = sincroConfig;
        const connectionBundle = createRtcPeerConnectionBundle({
            audioTrack,
            logger: this.logger,
            onIceConnectionStateChange: (state) => this.handleIceConnectionStateChange(state),
            onTelopMessage: (msg) => this.telopChannelCallback(msg),
            onTextMessage: (msg) => this.textChannelCallback(msg),
            sendIceCandidate: (candidate) => {
                void this.sendIceCandidate(candidate);
            },
            sincroConfig,
        });
        this.peerConnection = connectionBundle.peerConnection;
        this.textChannel = connectionBundle.textChannel;
        this.telopChannel = connectionBundle.telopChannel;
    }

    // 接続開始（または再接続開始）。
    // start() は RTCTalkClient の再利用前提で内部状態をリセットしてから negotiate を実行する。
    start(forceIceRestart: boolean = false, preferredSessionId?: string): Promise<void> {
        if (this.isNegotiating) {
            this.logger.addRtcEventLog("start skipped: negotiation already in progress");
            return Promise.resolve();
        }
        if (this.reconnectTimerId !== undefined) {
            clearTimeout(this.reconnectTimerId);
            this.reconnectTimerId = undefined;
        }
        this.sessionId = undefined;
        this.pendingIceCandidates = [];
        this.statsReporter.reset();
        this.iceFailureDiagnosticCaptured = false;
        this.startStatsCollector();
        this.logger.addRtcEventLog(
            `start negotiation: forceIceRestart=${forceIceRestart}, preferredSessionId=${preferredSessionId ?? "-"}`,
        );
        this.chatMessageService.writeSystemMessage("音声認識・合成システムに接続します。");
        return this.negotiate(this.peerConnection, forceIceRestart, preferredSessionId);
    }

    stop(): void {
        if (this.reconnectTimerId !== undefined) {
            clearTimeout(this.reconnectTimerId);
            this.reconnectTimerId = undefined;
        }
        this.sessionId = undefined;
        this.pendingIceCandidates = [];
        this.statsReporter.reset();
        this.iceFailureDiagnosticCaptured = false;
        this.reconnectAttempt = 0;
        this.lastStableSessionId = undefined;
        this.stopStatsCollector();
        this.logger.resetRealtimeStats();

        closeRtcPeerConnection({
            peerConnection: this.peerConnection,
            telopChannel: this.telopChannel,
            textChannel: this.textChannel,
        });
    }

    // ICE切断等の後にバックオフ付きで再接続を予約する。
    // 直接 start() せずタイマーを挟むことで、連続失敗時の過負荷を避ける。
    reConnect(): void {
        const preferredSessionId = this.sessionId ?? this.lastStableSessionId;
        // 切断後に遅れて発火する onicecandidate を旧sessionへ送らないよう、
        // 再接続スケジュール時点で session_id を無効化する。
        this.sessionId = undefined;
        this.pendingIceCandidates = [];

        if (this.reconnectTimerId !== undefined) {
            this.logger.addRtcEventLog("reconnect already scheduled");
            return;
        }
        const waitMs = this.nextReconnectDelayMs();
        this.logger.addRtcEventLog(
            `schedule reconnect in ${Math.round(waitMs)}ms (attempt=${this.reconnectAttempt}, preferredSessionId=${preferredSessionId ?? "-"})`,
        );
        this.reconnectTimerId = window.setTimeout(() => {
            this.reconnectTimerId = undefined;
            void this.start(true, preferredSessionId);
        }, waitMs);
    }

    setMute(mute: boolean): void {
        this.isMuted = mute;
        setRtcAudioMute({
            isMuted: this.isMuted,
            logger: this.logger,
            peerConnection: this.peerConnection,
        });
    }

    // 実行中セッションの送信用 audio sender を新しいトラックへ差し替える。
    async replaceAudioTrack(audioTrack: MediaStreamTrack): Promise<void> {
        await replaceRtcAudioTrack({
            audioTrack,
            isMuted: this.isMuted,
            logger: this.logger,
            peerConnection: this.peerConnection,
        });
    }

    private async negotiate(
        peerConnection: RTCPeerConnection,
        forceIceRestart: boolean,
        preferredSessionId: string | undefined,
    ): Promise<void> {
        // glare/中途半端な状態で再度 offer を投げると失敗しやすいため、stable 以外は再接続へ回す。
        if (peerConnection.signalingState !== "stable") {
            this.logger.addRtcEventLog(
                `negotiate skipped: signaling state is not stable (${peerConnection.signalingState})`,
            );
            this.reConnect();
            return Promise.resolve();
        }

        this.isNegotiating = true;
        return negotiateRtcSession({
            flushPendingIceCandidates: () => this.flushPendingIceCandidates(),
            forceIceRestart,
            logger: this.logger,
            onSessionAssigned: (sessionId) => {
                this.sessionId = sessionId;
                this.lastStableSessionId = sessionId;
            },
            peerConnection,
            preferredSessionId,
            sincroConfig: this.sincroConfig,
            talkMode: this.talkMode,
        })
            .then(() => {
                this.reconnectAttempt = 0;
            })
            .catch((error) => {
                // 失敗時は診断ログ・UI通知を残したうえで再接続へ移行する。
                this.sessionId = undefined;
                this.pendingIceCandidates = [];
                this.chatMessageService.writeErrorMessage(
                    `RTCサーバーへの接続に失敗しました...。\n${error}`,
                    true,
                );
                this.rtcHealthCallback(`RTCサーバーへの接続に失敗しました。${error}`);
                frontendLogger.error("RTC negotiation failed.", { error });
                this.logger.addRtcEventLog(`negotiate failed: ${error}`);
                this.reConnect();
            })
            .finally(() => {
                this.isNegotiating = false;
            });
    }

    private nextReconnectDelayMs(): number {
        // 段階的バックオフ。連続失敗時は待機時間を伸ばし、群発再接続を避けるためジッターを加える。
        this.reconnectAttempt += 1;
        const baseMs = 5000;
        const maxMs = 60000;
        const step = Math.min(this.reconnectAttempt - 1, 5);
        const backoffMs = Math.min(baseMs * 2 ** step, maxMs);
        const jitterRatio = 0.8 + Math.random() * 0.4; // 0.8x - 1.2x
        return Math.min(Math.round(backoffMs * jitterRatio), maxMs);
    }

    private flushPendingIceCandidates(): Promise<void> {
        const pendingCandidates = this.pendingIceCandidates.splice(
            0,
            this.pendingIceCandidates.length,
        );
        // 大量candidateでも送信順序を保つため逐次Promiseで流す。
        return pendingCandidates.reduce((p, candidate) => {
            return p.then(() => this.sendIceCandidate(candidate));
        }, Promise.resolve());
    }

    // Trickle ICE の candidate をサーバーへ送る。
    // session_id 未確定時は一時キューに積み、Offer応答後に flush される。
    private sendIceCandidate(candidate: RTCIceCandidateInit | null): Promise<void> {
        // Firefox等で candidateオブジェクト自体は存在するが candidate文字列が空のケースがある。
        // これは実質 end-of-candidates なので null として統一する。
        if (candidate !== null && (!candidate.candidate || candidate.candidate.trim() === "")) {
            candidate = null;
        }

        if (!this.sessionId) {
            // session_id未確定時は送信できないためキューへ退避。
            this.pendingIceCandidates.push(candidate);
            return Promise.resolve();
        }
        return sendRtcIceCandidate({
            candidate,
            logger: this.logger,
            sessionId: this.sessionId,
            sincroConfig: this.sincroConfig,
        });
    }

    private handleIceConnectionStateChange(state: RTCIceConnectionState): void {
        handleRtcIceConnectionState({
            captureIceFailureDiagnostics: (reason) => {
                void this.captureIceFailureDiagnostics(reason);
            },
            chatMessageService: this.chatMessageService,
            onIceFailureDiagnosticsReset: () => {
                this.iceFailureDiagnosticCaptured = false;
            },
            reconnect: () => this.reConnect(),
            rtcHealthCallback: this.rtcHealthCallback,
            state,
        });
    }

    private async captureIceFailureDiagnostics(reason: string): Promise<void> {
        if (this.iceFailureDiagnosticCaptured) {
            return;
        }
        this.iceFailureDiagnosticCaptured = true;
        await captureIceFailureDiagnostics({
            logger: this.logger,
            peerConnection: this.peerConnection,
            reason,
            sessionId: this.sessionId,
        });
    }

    private startStatsCollector(): void {
        this.stopStatsCollector();
        this.statsReporter.reset();
        this.statsIntervalId = window.setInterval(() => {
            this.statsReporter.collectAndRender(this.peerConnection).catch((error) => {
                frontendLogger.error("RTC stats collection failed.", { error });
            });
        }, 1000);
    }

    private stopStatsCollector(): void {
        if (this.statsIntervalId !== undefined) {
            clearInterval(this.statsIntervalId);
            this.statsIntervalId = undefined;
        }
        this.statsReporter.reset();
    }
}
