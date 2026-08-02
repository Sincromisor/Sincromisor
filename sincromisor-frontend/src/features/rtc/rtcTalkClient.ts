import { frontendLogger } from "../../shared/logging/appLogger";
import { ChatMessageService } from "../conversation/chat/model/chatMessageService";
import { DebugConsoleManager } from "../debug/model/debugConsoleManager";
import { replaceRtcAudioTrack, setRtcAudioMute } from "./rtcAudioTrackSender";
import { RtcBundleDiagnostics } from "./rtcBundleDiagnostics";
import { handleRtcIceConnectionState } from "./rtcConnectionStateHandler";
import { RtcDisconnectedGraceTimer } from "./rtcDisconnectedGraceTimer";
import { sendRtcIceCandidate } from "./rtcIceCandidateSender";
import type { ChatMessage, TelopChannelMessage } from "./rtcMessage";
import { negotiateRtcSession } from "./rtcNegotiation";
import { RtcNegotiationStateMachine, type RtcOfferIdentity } from "./rtcNegotiationStateMachine";
import {
    createRtcPeerConnectionBundle,
    type RtcPeerConnectionBundle,
} from "./rtcPeerConnectionFactory";
import { closeRtcPeerConnection } from "./rtcPeerConnectionShutdown";
import { RtcSignalingHttpError } from "./rtcSignalingHttp";
import type { SincroRTCConfig } from "./sincroRtcConfigManager";

// reason: structure-threshold-exception bundle generationとsignaling flightを別ownerへ分けると、session/revision/candidateのatomicなfailure境界が複数classへ分散するため。
/**
 * 1つの論理RTC接続についてPeerConnection bundleとsignaling stateを所有する。
 *
 * Pion sessionでは同一bundle上のICE restartをsingle-flightで行う。session消失または
 * legacy切断だけは旧bundleをcloseして新bundleのinitial Offerへ移る。terminal failure後の
 * 自動再接続は行わず、上位AppControllerによる新しいclient/startを復旧境界とする。
 */
export class RTCTalkClient {
    private audioTrack: MediaStreamTrack;
    private bundle: RtcPeerConnectionBundle;
    private bundleGeneration = 0;
    private candidateSendFlight: Promise<void> = Promise.resolve();
    private readonly chatMessageService = ChatMessageService.getService();
    private readonly diagnostics: RtcBundleDiagnostics;
    private readonly disconnectedGrace: RtcDisconnectedGraceTimer;
    private generationAbortController = new AbortController();
    private isMuted = false;
    private readonly logger = DebugConsoleManager.getManager();
    private negotiationFlight?: Promise<void>;
    private negotiationState = new RtcNegotiationStateMachine();
    private pendingIdentity?: RtcOfferIdentity;
    private readonly sincroConfig: SincroRTCConfig;
    private readonly talkMode: string;

    /** telop_ch受信を上位conversation/character層へ通知する差し替え可能callback。 */
    telopChannelCallback: (msg: TelopChannelMessage) => void = () => {};
    /** text_ch受信を上位conversation層へ通知する差し替え可能callback。 */
    textChannelCallback: (msg: ChatMessage) => void = () => {};
    /** 接続復帰時は引数なし、terminal/degraded時は表示message付きでhealth UIへ通知する。 */
    rtcHealthCallback: (message?: string) => void = () => {};

    /**
     * 初期audio trackとsignaling設定からbundleを作る。network I/Oはstartまで行わない。
     */
    constructor(sincroConfig: SincroRTCConfig, audioTrack: MediaStreamTrack, talkMode: string) {
        this.audioTrack = audioTrack;
        this.sincroConfig = sincroConfig;
        this.talkMode = talkMode;
        this.bundle = this.createBundle();
        this.diagnostics = new RtcBundleDiagnostics({
            getPeerConnection: () => this.bundle.peerConnection,
            getSessionId: () => this.negotiationState.identity?.sessionId,
            logger: this.logger,
        });
        this.disconnectedGrace = new RtcDisconnectedGraceTimer({
            onGraceExpired: () => void this.recoverFromIceFailure(),
        });
    }

    /**
     * initial Offerを開始する。同一clientで進行中なら既存flightを返し、並行SDP生成を防ぐ。
     */
    start(): Promise<void> {
        if (this.negotiationFlight !== undefined) {
            return this.negotiationFlight;
        }
        this.diagnostics.start();
        this.chatMessageService.writeSystemMessage("音声認識・合成システムに接続します。");
        return this.runInitialNegotiation();
    }

    /**
     * timer、candidate、DataChannel、PeerConnectionをcloseし、遅延callbackをgenerationで無効化する。
     */
    stop(): void {
        this.disconnectedGrace.cancel();
        this.diagnostics.stop();
        this.negotiationState.close();
        this.generationAbortController.abort();
        this.pendingIdentity = undefined;
        this.bundleGeneration += 1;
        closeRtcPeerConnection(this.bundle);
        this.logger.resetRealtimeStats();
    }

    /** 現bundleのaudio senderをmute/unmuteする。 */
    setMute(mute: boolean): void {
        this.isMuted = mute;
        setRtcAudioMute({
            isMuted: mute,
            logger: this.logger,
            peerConnection: this.bundle.peerConnection,
        });
    }

    /**
     * 現在および将来のreplacement bundleで使うaudio trackを差し替える。
     * replacementと競合した場合も保存したtrackが新bundleへ渡る。
     */
    async replaceAudioTrack(audioTrack: MediaStreamTrack): Promise<void> {
        this.audioTrack = audioTrack;
        await replaceRtcAudioTrack({
            audioTrack,
            isMuted: this.isMuted,
            logger: this.logger,
            peerConnection: this.bundle.peerConnection,
        });
    }

    private runInitialNegotiation(previousSessionId?: string): Promise<void> {
        const identity = this.negotiationState.beginInitial(crypto.randomUUID());
        return this.runNegotiation(identity, false, previousSessionId);
    }

    private runRestartNegotiation(): Promise<void> {
        if (this.negotiationFlight !== undefined) {
            return this.negotiationFlight;
        }
        const identity = this.negotiationState.beginRestart();
        return this.runNegotiation(identity, true);
    }

    private runNegotiation(
        identity: RtcOfferIdentity,
        forceIceRestart: boolean,
        previousSessionId?: string,
    ): Promise<void> {
        this.pendingIdentity = identity;
        const generation = this.bundleGeneration;
        const flight = this.performNegotiation(
            generation,
            identity,
            forceIceRestart,
            previousSessionId,
        ).finally(() => {
            if (this.negotiationFlight === flight) {
                this.negotiationFlight = undefined;
            }
        });
        this.negotiationFlight = flight;
        return flight;
    }

    private async performNegotiation(
        generation: number,
        identity: RtcOfferIdentity,
        forceIceRestart: boolean,
        previousSessionId?: string,
    ): Promise<void> {
        try {
            const answer = await negotiateRtcSession({
                forceIceRestart,
                identity,
                logger: this.logger,
                peerConnection: this.bundle.peerConnection,
                previousSessionId,
                signal: this.generationAbortController.signal,
                sincroConfig: this.sincroConfig,
                talkMode: this.talkMode,
            });
            if (!this.isCurrentGeneration(generation)) {
                return;
            }
            this.negotiationState.commitAnswer(identity, answer);
            const candidateFlush = this.flushCandidates(identity.revision);
            this.pendingIdentity = undefined;
            await candidateFlush;
            this.diagnostics.resetFailureCapture();
            this.rtcHealthCallback();
        } catch (error) {
            if (this.isCurrentGeneration(generation)) {
                await this.handleGenerationFailure(error, identity);
            }
        }
    }

    private async flushCandidates(revision: number): Promise<void> {
        const identity = this.negotiationState.identity;
        if (identity?.sessionId === undefined) {
            throw new Error("RTC candidate flush requires an assigned session.");
        }
        const sessionId = identity.sessionId;
        const generation = this.bundleGeneration;
        const queuedCandidates = this.negotiationState.drainCandidates(revision);
        // Answer前queueとAnswer後candidateを同じPromise chainへ載せ、revision内のFIFOを維持する。
        this.candidateSendFlight = this.candidateSendFlight.then(async () => {
            for (const queued of queuedCandidates) {
                await this.sendCandidate(queued.candidate, sessionId, revision, generation);
            }
        });
        await this.candidateSendFlight;
    }

    private onIceCandidate(generation: number, candidate: RTCIceCandidateInit | null): void {
        if (!this.isCurrentGeneration(generation)) {
            return;
        }
        const normalized =
            candidate !== null && (candidate.candidate ?? "").trim() === "" ? null : candidate;
        const revision = this.pendingIdentity?.revision ?? this.negotiationState.identity?.revision;
        const sessionId = this.negotiationState.identity?.sessionId;
        if (
            revision === undefined ||
            sessionId === undefined ||
            this.pendingIdentity !== undefined
        ) {
            try {
                this.negotiationState.enqueueCandidate(normalized, revision ?? 1);
            } catch (error) {
                void this.handleGenerationFailure(error, this.pendingIdentity);
            }
            return;
        }
        this.candidateSendFlight = this.candidateSendFlight
            .then(() => this.sendCandidate(normalized, sessionId, revision, generation))
            .catch((error) => this.handleGenerationFailure(error));
    }

    private async sendCandidate(
        candidate: RTCIceCandidateInit | null,
        sessionId: string,
        revision: number,
        generation: number,
    ): Promise<void> {
        if (!this.isCurrentGeneration(generation)) {
            return;
        }
        await sendRtcIceCandidate({
            candidate,
            logger: this.logger,
            offerRevision: revision,
            sessionId,
            signal: this.generationAbortController.signal,
            sincroConfig: this.sincroConfig,
        });
    }

    private onIceConnectionState(generation: number, state: RTCIceConnectionState): void {
        if (!this.isCurrentGeneration(generation)) {
            return;
        }
        handleRtcIceConnectionState({
            captureIceFailureDiagnostics: (reason) => void this.diagnostics.captureFailure(reason),
            chatMessageService: this.chatMessageService,
            onDisconnected: () => this.scheduleDisconnectedRestart(),
            onFailed: () => void this.recoverFromIceFailure(),
            onRecovered: () => {
                this.disconnectedGrace.cancel();
                this.negotiationState.restoreConnected();
                this.diagnostics.resetFailureCapture();
            },
            rtcHealthCallback: this.rtcHealthCallback,
            state,
        });
    }

    private scheduleDisconnectedRestart(): void {
        if (!this.negotiationState.markRestartPending()) {
            return;
        }
        this.disconnectedGrace.schedule();
    }

    private async recoverFromIceFailure(): Promise<void> {
        this.disconnectedGrace.cancel();
        if (this.negotiationFlight !== undefined) {
            return this.negotiationFlight;
        }
        if (this.negotiationState.mode === "legacy") {
            return this.replaceBundle(this.negotiationState.identity?.sessionId);
        }
        return this.runRestartNegotiation();
    }

    private async handleGenerationFailure(
        error: unknown,
        identity?: RtcOfferIdentity,
    ): Promise<void> {
        this.negotiationState.failGeneration();
        if (
            error instanceof RtcSignalingHttpError &&
            (error.status === 404 || error.status === 410) &&
            (error.operation === "update-offer" || error.operation === "candidate")
        ) {
            await this.replaceBundle(
                identity?.sessionId ?? this.negotiationState.identity?.sessionId,
            );
            return;
        }
        this.terminalFailure(error);
    }

    private async replaceBundle(previousSessionId?: string): Promise<void> {
        if (this.negotiationState.state === "replacing") {
            return;
        }
        this.negotiationState.markReplacing();
        this.generationAbortController.abort();
        this.generationAbortController = new AbortController();
        // 旧generationのrejected candidate chainを新bundleへ継承しない。
        this.candidateSendFlight = Promise.resolve();
        this.bundleGeneration += 1;
        closeRtcPeerConnection({
            ...this.bundle,
            stopSenderTracks: false,
        });
        this.bundle = this.createBundle();
        await this.runInitialNegotiation(previousSessionId);
    }

    private terminalFailure(error: unknown): void {
        this.pendingIdentity = undefined;
        this.negotiationState.close();
        this.generationAbortController.abort();
        this.bundleGeneration += 1;
        closeRtcPeerConnection(this.bundle);
        const message = `RTCサーバーへの接続に失敗しました。${String(error)}`;
        this.chatMessageService.writeErrorMessage(message, true);
        this.rtcHealthCallback(message);
        frontendLogger.error("RTC generation failed terminally.", { error });
    }

    private createBundle(): RtcPeerConnectionBundle {
        const generation = this.bundleGeneration;
        return createRtcPeerConnectionBundle({
            audioTrack: this.audioTrack,
            logger: this.logger,
            onIceConnectionStateChange: (state) => this.onIceConnectionState(generation, state),
            onTelopMessage: (msg) => this.telopChannelCallback(msg),
            onTextMessage: (msg) => this.textChannelCallback(msg),
            sendIceCandidate: (candidate) => this.onIceCandidate(generation, candidate),
            sincroConfig: this.sincroConfig,
        });
    }

    private isCurrentGeneration(generation: number): boolean {
        return generation === this.bundleGeneration && this.negotiationState.state !== "closed";
    }
}
