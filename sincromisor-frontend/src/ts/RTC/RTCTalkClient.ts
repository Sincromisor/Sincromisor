import { DebugConsoleManager } from "../UI/DebugConsoleManager";
import { ChatMessage, TelopChannelMessage } from "./RTCMessage";
import { ChatMessageManager } from "../UI/ChatMessageManager";
import { SincroRTCConfig } from "./SincroRTCConfigManager";

export class RTCTalkClient {
    private readonly logger: DebugConsoleManager;
    private readonly peerConnection: RTCPeerConnection;
    private readonly telopChannel: RTCDataChannel;
    private readonly textChannel: RTCDataChannel;
    private readonly chatMessageManager: ChatMessageManager;
    private readonly talkMode: string;
    private config: RTCConfiguration;
    private sincroConfig: SincroRTCConfig;
    // /offer 応答で払い出されるサーバー側セッションID。
    // Trickle ICEの candidate 送信先セッションの特定に使う。
    private sessionId: string | null = null;
    // /offer 応答より先に onicecandidate が発火するため、
    // セッションID取得前のcandidateを一時保管する。
    private pendingIceCandidates: Array<RTCIceCandidateInit | null> = [];
    private statsIntervalId: number | null = null;
    private previousOutboundAudio: { bytes: number; timestamp: number } | null = null;
    private previousInboundAudio: { bytes: number; timestamp: number } | null = null;
    private currentRouteSignature: string | null = null;
    private iceFailureDiagnosticCaptured = false;
    private reconnectTimerId: number | null = null;
    private isNegotiating = false;
    private reconnectAttempt = 0;
    // 直近で接続確立に成功したsession_id。
    // ICE切断後の再接続で「同一セッション更新」を試すために保持する。
    private lastStableSessionId: string | null = null;

    /*
        default     Default codecs
        VP8/90000   VP8
        H264/90000  H264
    */
    videoCodec: string = "default";
    /* 
        default         Default codecs
        opus/48000/2    Opus
        PCMU/8000       PCMU
        PCMA/8000       PCMA
    */
    audioCodec: string = "default";
    telopChannelCallback: (msg: TelopChannelMessage) => void = () => { };
    textChannelCallback: (msg: ChatMessage) => void = () => { };

    /* talk_mode: chat, sincro */
    constructor(sincroConfig: SincroRTCConfig, audioTrack: MediaStreamTrack, talkMode: string) {
        this.logger = DebugConsoleManager.getManager();
        this.chatMessageManager = ChatMessageManager.getManager();
        this.talkMode = talkMode;
        this.config = this.defaultConfig();
        this.sincroConfig = sincroConfig;
        if (sincroConfig) {
            this.config["iceServers"] = sincroConfig.iceServers;
        } else {
            //this.config["iceServers"] = [{ urls: ["stun:stun.l.google.com:19302"] }];
        }
        console.dir(this.config);
        this.peerConnection = new RTCPeerConnection(this.config);
        this.setupICEEventLog(this.peerConnection);
        this.setupTrack(this.peerConnection);
        this.textChannel = this.createTextChannel(this.peerConnection);
        this.telopChannel = this.createTelopChannel(this.peerConnection);

        this.peerConnection.addTrack(audioTrack);
    }

    defaultConfig(): RTCConfiguration {
        return {
            /*"sdpSemantics": "unified-plan",*/
        }
    }

    start(forceIceRestart: boolean = false, preferredSessionId: string | null = null): Promise<void> {
        if (this.isNegotiating) {
            this.logger.addRtcEventLog("start skipped: negotiation already in progress");
            return Promise.resolve();
        }
        if (this.reconnectTimerId != null) {
            clearTimeout(this.reconnectTimerId);
            this.reconnectTimerId = null;
        }
        this.sessionId = null;
        this.pendingIceCandidates = [];
        this.currentRouteSignature = null;
        this.iceFailureDiagnosticCaptured = false;
        this.startStatsCollector();
        this.logger.addRtcEventLog(
            `start negotiation: forceIceRestart=${forceIceRestart}, preferredSessionId=${preferredSessionId ?? "-"}`,
        );
        this.chatMessageManager.writeSystemMessage("音声認識・合成システムに接続します。");
        return this.negotiate(this.peerConnection, forceIceRestart, preferredSessionId);
    }

    stop(): void {
        if (this.reconnectTimerId != null) {
            clearTimeout(this.reconnectTimerId);
            this.reconnectTimerId = null;
        }
        this.sessionId = null;
        this.pendingIceCandidates = [];
        this.currentRouteSignature = null;
        this.iceFailureDiagnosticCaptured = false;
        this.reconnectAttempt = 0;
        this.lastStableSessionId = null;
        this.stopStatsCollector();
        this.logger.resetRealtimeStats();

        // close data channel
        if (this.textChannel) { this.textChannel.close(); }
        if (this.telopChannel) { this.telopChannel.close(); }

        // close transceivers
        if (this.peerConnection.getTransceivers) {
            this.peerConnection.getTransceivers().forEach((transceiver) => {
                if (transceiver.stop) { transceiver.stop(); }
            });
        }

        // close local audio / video
        this.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
            sender.track?.stop();
        });

        // close peer connection
        setTimeout(() => {
            this.peerConnection.close();
        }, 1000);
    }

    reConnect(): void {
        const preferredSessionId = this.sessionId ?? this.lastStableSessionId;
        // 切断後に遅れて発火する onicecandidate を旧sessionへ送らないよう、
        // 再接続スケジュール時点で session_id を無効化する。
        this.sessionId = null;
        this.pendingIceCandidates = [];

        if (this.reconnectTimerId != null) {
            this.logger.addRtcEventLog("reconnect already scheduled");
            return;
        }
        const waitMs = this.nextReconnectDelayMs();
        this.logger.addRtcEventLog(
            `schedule reconnect in ${Math.round(waitMs)}ms (attempt=${this.reconnectAttempt}, preferredSessionId=${preferredSessionId ?? "-"})`,
        );
        this.reconnectTimerId = window.setTimeout(() => {
            this.reconnectTimerId = null;
            void this.start(true, preferredSessionId);
        }, waitMs);
    }

    setMute(mute: boolean): void {
        this.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
            if (sender.track) {
                sender.track.enabled = !mute;
            }
        });
    }

    private async negotiate(
        peerConnection: RTCPeerConnection,
        forceIceRestart: boolean,
        preferredSessionId: string | null,
    ): Promise<void> {
        if (peerConnection.signalingState !== "stable") {
            this.logger.addRtcEventLog(
                `negotiate skipped: signaling state is not stable (${peerConnection.signalingState})`,
            );
            this.reConnect();
            return Promise.resolve();
        }

        this.isNegotiating = true;
        // Trickle ICE方針:
        // 1) OfferはICE completeを待たず先に送信して接続開始を早める
        // 2) 以降のcandidateは /candidate に逐次送信する
        return peerConnection.createOffer({ iceRestart: forceIceRestart })
            .then((offer) => {
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                const offer: RTCSessionDescription | null = peerConnection.localDescription;
                if (offer == null) {
                    throw "Offer is null.";
                }
                /* コーデックのフィルタリング
                   offer.sdpは読み取り専用であるため、これではエラーとなる。
                if (this.audioCodec !== "default") {
                    offer.sdp = this.sdpFilterCodec("audio", this.audioCodec, offer.sdp);
                }
                if (this.videoCodec !== "default") {
                    offer.sdp = this.sdpFilterCodec("video", this.videoCodec, offer.sdp);
                }
                */

                this.logger.offerSDP(offer.sdp);
                const offerPayload: {
                    sdp: string;
                    type: RTCSdpType;
                    talk_mode: string;
                    session_id?: string;
                } = {
                    sdp: offer.sdp,
                    type: offer.type,
                    talk_mode: this.talkMode,
                };
                if (preferredSessionId) {
                    offerPayload.session_id = preferredSessionId;
                }
                this.logger.addRtcEventLog(
                    `send offer: mode=${preferredSessionId ? "session-update" : "new-session"}, targetSessionId=${preferredSessionId ?? "-"}`,
                );
                console.log(JSON.stringify({
                    sdp: offer.sdp,
                    type: offer.type
                }));
                return fetch(this.sincroConfig.offerURL, {
                    body: JSON.stringify(offerPayload),
                    headers: {
                        "Content-Type": "application/json"
                    },
                    method: "POST"
                });
            }).then((response) => {
                switch (response.status) {
                    case 200:
                        break;
                    case 429:
                        console.error(response);
                        throw `Too many requests - ${response.status} ${response.statusText}`;
                    default:
                        console.error(response);
                        throw `Invalid response - ${response.status} ${response.statusText}`;
                }
                return response.json();
            }).then((answer) => {
                console.log(answer);
                this.logger.answerSDP(answer.sdp);
                this.sessionId = answer.session_id;
                this.lastStableSessionId = answer.session_id;
                if (preferredSessionId && preferredSessionId !== answer.session_id) {
                    // サーバー側で既存更新に失敗した場合は、新規セッションへのフォールバックが返る。
                    this.logger.addRtcEventLog(
                        `offer fallback detected: preferredSessionId=${preferredSessionId}, assignedSessionId=${answer.session_id}`,
                    );
                } else if (preferredSessionId) {
                    this.logger.addRtcEventLog(`offer update succeeded: sessionId=${answer.session_id}`);
                } else {
                    this.logger.addRtcEventLog(`offer created new session: sessionId=${answer.session_id}`);
                }
                // Offer応答前に貯まったcandidateを、session_id確定後に順次反映する。
                return this.flushPendingIceCandidates()
                    .then(() => {
                        return peerConnection.setRemoteDescription({
                            sdp: answer.sdp,
                            type: answer.type,
                        });
                    })
                    .then(() => {
                        this.reconnectAttempt = 0;
                        this.logger.addRtcEventLog("negotiate succeeded: reconnect attempt reset");
                    });
            }).catch((e) => {
                this.sessionId = null;
                this.pendingIceCandidates = [];
                this.chatMessageManager.writeErrorMessage(`RTCサーバーへの接続に失敗しました...。\n${e}`, true);
                console.error(e);
                this.logger.addRtcEventLog(`negotiate failed: ${e}`);
                this.reConnect();
            }).finally(() => {
                this.isNegotiating = false;
            });
    }

    private nextReconnectDelayMs(): number {
        // 段階的バックオフ。連続失敗時は待機時間を伸ばし、群発再接続を避けるためジッターを加える。
        this.reconnectAttempt += 1;
        const baseMs = 5000;
        const maxMs = 60000;
        const step = Math.min(this.reconnectAttempt - 1, 5);
        const backoffMs = Math.min(baseMs * (2 ** step), maxMs);
        const jitterRatio = 0.8 + (Math.random() * 0.4); // 0.8x - 1.2x
        return Math.min(Math.round(backoffMs * jitterRatio), maxMs);
    }

    private flushPendingIceCandidates(): Promise<void> {
        const pendingCandidates = this.pendingIceCandidates.splice(0, this.pendingIceCandidates.length);
        // 大量candidateでも送信順序を保つため逐次Promiseで流す。
        return pendingCandidates.reduce((p, candidate) => {
            return p.then(() => this.sendIceCandidate(candidate));
        }, Promise.resolve());
    }

    private sendIceCandidate(candidate: RTCIceCandidateInit | null): Promise<void> {
        // Firefox等で candidateオブジェクト自体は存在するが candidate文字列が空のケースがある。
        // これは実質 end-of-candidates なので null として統一する。
        if (candidate != null && (!candidate.candidate || candidate.candidate.trim() === "")) {
            candidate = null;
        }

        if (!this.sessionId) {
            // session_id未確定時は送信できないためキューへ退避。
            this.pendingIceCandidates.push(candidate);
            return Promise.resolve();
        }
        return fetch(this.sincroConfig.candidateURL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                session_id: this.sessionId,
                candidate: candidate,
            }),
        }).then(async (response) => {
            if (!response.ok) {
                throw new Error(`Failed to send ICE candidate: ${response.status} ${response.statusText}`);
            }
            const result = await response.json().catch(() => null);
            if (result?.status === false) {
                this.logger.addRtcEventLog(
                    `ICE candidate ignored by server: ${result.reason ?? "unknown_reason"}`,
                );
            }
        }).catch((e) => {
            console.error(e);
            this.logger.addTextChannelLog(`! failed to send ice candidate: ${e}\n`);
            this.logger.addRtcEventLog(`candidate send failed: ${e}`);
        });
    }

    /*
        {"ordered": true}">Ordered, reliable
        {"ordered": false, "maxRetransmits": 0}">Unordered, no retransmissions
        {"ordered": false, "maxPacketLifetime": 500}">Unordered, 500ms lifetime
    */
    private createTelopChannel(peerConnection: RTCPeerConnection): RTCDataChannel {
        const parameters: RTCDataChannelInit = { "ordered": false, "maxRetransmits": 0 }
        const dc: RTCDataChannel = peerConnection.createDataChannel("telop_ch", parameters);
        dc.onclose = () => {
            this.logger.addTelopChannelLog("- close(telop_ch)\n");
            this.logger.addRtcEventLog("telop_ch closed");
        };
        dc.onopen = () => {
            this.logger.addTelopChannelLog("- open(telop_ch)\n");
            this.logger.addRtcEventLog("telop_ch opened");
        };
        dc.onmessage = (evt) => {
            this.logger.addTelopChannelLog("< [telop_ch] " + evt.data + "\n");
            this.telopChannelCallback(JSON.parse(evt.data) as TelopChannelMessage);
        };
        return dc;
    }

    private createTextChannel(peerConnection: RTCPeerConnection): RTCDataChannel {
        const parameters: RTCDataChannelInit = { "ordered": true }
        const dc: RTCDataChannel = peerConnection.createDataChannel("text_ch", parameters);
        dc.onclose = () => {
            this.logger.addTextChannelLog("- close(text_ch)\n");
            this.logger.addRtcEventLog("text_ch closed");
        };
        dc.onopen = () => {
            this.logger.addTextChannelLog("- open(text_ch)\n");
            this.logger.addRtcEventLog("text_ch opened");
        };
        dc.onmessage = (evt) => {
            this.logger.addTextChannelLog("< [text_ch] " + evt.data + "\n");
            this.textChannelCallback(JSON.parse(evt.data) as ChatMessage);
        };
        return dc;
    }

    private setupICEEventLog(peerConnection: RTCPeerConnection): RTCPeerConnection {
        peerConnection.addEventListener("icecandidate", (event) => {
            // event.candidate === null は end-of-candidates。
            // サーバー側にも明示的に伝えるため null のまま送る。
            const candidate = event.candidate ? event.candidate.toJSON() : null;
            this.sendIceCandidate(candidate);
            if (candidate) {
                this.logger.addRtcEventLog(`new ICE candidate: ${candidate.sdpMid ?? "audio"}`);
            } else {
                this.logger.addRtcEventLog("ICE candidate gathering completed");
            }
        });
        peerConnection.addEventListener("icecandidateerror", (event) => {
            // STUN/TURNへの疎通失敗をブラウザが検知した場合の詳細ログ。
            // 「ICE failed」切り分け時に about:webrtc を開かずに最低限の情報を残す。
            const err = event as RTCPeerConnectionIceErrorEvent;
            this.logger.addRtcEventLog(
                `ICE candidate error: url=${err.url ?? "-"}, code=${err.errorCode}, text=${err.errorText ?? "-"}`,
            );
        });

        // register some listeners to help debugging
        peerConnection.addEventListener("icegatheringstatechange", () => {
            this.logger.updateIceGatheringState(peerConnection.iceGatheringState);
        }, false);
        this.logger.newIceGatheringState(peerConnection.iceGatheringState);

        /* 接続の確立はnew -> checking -> connected、切断されたらdisconnected -> failed */
        peerConnection.addEventListener("iceconnectionstatechange", () => {
            this.logger.updateIceConnectionState(peerConnection.iceConnectionState);
            this.connectionStateChecker(peerConnection.iceConnectionState);
            if (peerConnection.iceConnectionState == 'failed') {
                this.reConnect();
            }
        }, false);
        this.logger.newIceConnectionState(peerConnection.iceConnectionState);

        peerConnection.addEventListener("signalingstatechange", () => {
            this.logger.updateSignalingState(peerConnection.signalingState);
        }, false);
        this.logger.newSignalingState(peerConnection.signalingState);
        return peerConnection;
    }

    private connectionStateChecker(state: RTCIceConnectionState) {
        /* new -> checking -> connected、disconnected -> failed */
        switch (state) {
            case "new":
                this.chatMessageManager.writeSystemMessage("音声認識・合成システムに接続します。");
                break;
            case "checking":
                this.chatMessageManager.writeSystemMessage("音声認識・合成システムへの接続を確認しています。");
                break;
            case "connected":
                this.iceFailureDiagnosticCaptured = false;
                this.chatMessageManager.writeSystemMessage("音声認識・合成システムに接続しました。");
                break;
            case "completed":
                this.iceFailureDiagnosticCaptured = false;
                this.chatMessageManager.writeSystemMessage("音声認識・合成システムとのセッションの確立に成功しました。");
                break;
            case "disconnected":
                this.chatMessageManager.writeErrorMessage("音声認識・合成システムから切断されました。");
                break;
            case "failed":
                this.chatMessageManager.writeErrorMessage("音声認識・合成システムへの接続に失敗しました。");
                void this.captureIceFailureDiagnostics("iceConnectionState=failed");
                break;
            default:
                this.chatMessageManager.writeErrorMessage(`Unknown ICE Connection State - ${state}`);
                console.error(state);
        }
    }

    private async captureIceFailureDiagnostics(reason: string): Promise<void> {
        if (this.iceFailureDiagnosticCaptured) {
            return;
        }
        this.iceFailureDiagnosticCaptured = true;
        try {
            const report = await this.peerConnection.getStats();
            let selectedPair: any = null;
            let pairTotal = 0;
            let pairSucceeded = 0;
            const localCandidates = new Map<string, any>();
            const remoteCandidates = new Map<string, any>();
            const localTypeCount: Record<string, number> = {};
            const remoteTypeCount: Record<string, number> = {};

            report.forEach((stats: any) => {
                if (stats.type === "candidate-pair") {
                    pairTotal += 1;
                    if (stats.state === "succeeded") {
                        pairSucceeded += 1;
                    }
                    if (stats.selected || stats.nominated) {
                        selectedPair = stats;
                    }
                }
                if (stats.type === "local-candidate") {
                    localCandidates.set(stats.id, stats);
                    const t = stats.candidateType ?? "unknown";
                    localTypeCount[t] = (localTypeCount[t] ?? 0) + 1;
                }
                if (stats.type === "remote-candidate") {
                    remoteCandidates.set(stats.id, stats);
                    const t = stats.candidateType ?? "unknown";
                    remoteTypeCount[t] = (remoteTypeCount[t] ?? 0) + 1;
                }
            });

            const local = selectedPair?.localCandidateId ? localCandidates.get(selectedPair.localCandidateId) : null;
            const remote = selectedPair?.remoteCandidateId ? remoteCandidates.get(selectedPair.remoteCandidateId) : null;
            const localType = local?.candidateType ?? "-";
            const remoteType = remote?.candidateType ?? "-";
            const pairState = selectedPair?.state ?? "-";
            const rttMs = selectedPair?.currentRoundTripTime != null
                ? `${(selectedPair.currentRoundTripTime * 1000).toFixed(1)}ms`
                : "-";

            this.logger.addRtcEventLog(
                `ICE failure diagnostics: reason=${reason}, pair=${pairState} ${localType}->${remoteType}, rtt=${rttMs}, pairs=${pairSucceeded}/${pairTotal}(succeeded/total)`,
            );
            this.logger.addRtcEventLog(
                `ICE failure diagnostics: localCandidates=${JSON.stringify(localTypeCount)}, remoteCandidates=${JSON.stringify(remoteTypeCount)}, ua=${navigator.userAgent}`,
            );
            this.logger.addRtcEventLog(
                `ICE failure diagnostics: signaling=${this.peerConnection.signalingState}, gathering=${this.peerConnection.iceGatheringState}, session_id=${this.sessionId ?? "-"}`,
            );
        } catch (e) {
            this.logger.addRtcEventLog(`ICE failure diagnostics collection failed: ${e}`);
            console.error(e);
        }
    }

    private setupTrack(peerConnection: RTCPeerConnection): RTCPeerConnection {
        peerConnection.addEventListener("track", (evt: RTCTrackEvent) => {
            if (evt.track.kind == "video") {
                console.error("Unknown Video Track!");
                const rtcVideo: HTMLVideoElement | null = document.querySelector("video#rtcVideo");
                if (rtcVideo) {
                    rtcVideo.srcObject = evt.streams[0];
                } else {
                    throw "video#rtcVideo is not found.";
                }
            } else {
                const rtcAudio: HTMLAudioElement | null = document.querySelector("audio#rtcAudio");
                if (rtcAudio) {
                    rtcAudio.srcObject = evt.streams[0];
                    this.logger.setRemoteAudioTrack(evt.track);
                    this.logger.addRtcEventLog(`remote track received: ${evt.track.kind}`);
                } else {
                    throw "audio#rtcAudio is not found.";
                }
            }
        });
        return peerConnection;
    }

    private startStatsCollector(): void {
        this.stopStatsCollector();
        this.previousOutboundAudio = null;
        this.previousInboundAudio = null;
        this.statsIntervalId = window.setInterval(() => {
            this.collectAndRenderStats().catch((e) => {
                console.error(e);
            });
        }, 1000);
    }

    private stopStatsCollector(): void {
        if (this.statsIntervalId != null) {
            clearInterval(this.statsIntervalId);
            this.statsIntervalId = null;
        }
        this.previousOutboundAudio = null;
        this.previousInboundAudio = null;
    }

    private formatBitrate(bitsPerSecond: number | null): string {
        if (bitsPerSecond == null || !Number.isFinite(bitsPerSecond) || bitsPerSecond < 0) {
            return "-";
        }
        if (bitsPerSecond >= 1_000_000) {
            return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
        }
        if (bitsPerSecond >= 1_000) {
            return `${(bitsPerSecond / 1_000).toFixed(1)} kbps`;
        }
        return `${bitsPerSecond.toFixed(0)} bps`;
    }

    private candidateAddress(candidate: any): string {
        return candidate?.address ?? candidate?.ip ?? "-";
    }

    private candidatePort(candidate: any): string {
        if (candidate?.port == null) {
            return "-";
        }
        return `${candidate.port}`;
    }

    private candidateEndpointLabel(candidate: any): string {
        if (!candidate) {
            return "-";
        }
        const address = this.candidateAddress(candidate);
        const port = this.candidatePort(candidate);
        const type = candidate?.candidateType ?? "unknown";
        const protocol = candidate?.protocol ?? "-";
        return `${address}:${port} (${type}/${protocol})`;
    }

    private calcBitrate(
        currentBytes: number | undefined,
        currentTimestamp: number | undefined,
        prev: { bytes: number; timestamp: number } | null,
    ): { bitrate: number | null; next: { bytes: number; timestamp: number } | null } {
        if (currentBytes == null || currentTimestamp == null) {
            return { bitrate: null, next: prev };
        }
        if (!prev) {
            return {
                bitrate: null,
                next: { bytes: currentBytes, timestamp: currentTimestamp },
            };
        }
        const durationSec = (currentTimestamp - prev.timestamp) / 1000;
        if (durationSec <= 0) {
            return { bitrate: null, next: prev };
        }
        const bitrate = ((currentBytes - prev.bytes) * 8) / durationSec;
        return {
            bitrate,
            next: { bytes: currentBytes, timestamp: currentTimestamp },
        };
    }

    private async collectAndRenderStats(): Promise<void> {
        const report = await this.peerConnection.getStats();
        let outboundAudio: any = null;
        let inboundAudio: any = null;
        let selectedPair: any = null;
        const localCandidates = new Map<string, any>();
        const remoteCandidates = new Map<string, any>();

        report.forEach((stats: any) => {
            if (stats.type === "outbound-rtp" && stats.kind === "audio" && !stats.isRemote) {
                outboundAudio = stats;
            }
            if (stats.type === "inbound-rtp" && stats.kind === "audio" && !stats.isRemote) {
                inboundAudio = stats;
            }
            if (stats.type === "candidate-pair" && (stats.selected || stats.nominated)) {
                selectedPair = stats;
            }
            if (stats.type === "local-candidate") {
                localCandidates.set(stats.id, stats);
            }
            if (stats.type === "remote-candidate") {
                remoteCandidates.set(stats.id, stats);
            }
        });

        const outboundResult = this.calcBitrate(
            outboundAudio?.bytesSent,
            outboundAudio?.timestamp,
            this.previousOutboundAudio,
        );
        this.previousOutboundAudio = outboundResult.next;
        this.logger.updateMetricValue("outboundAudioBitrate", this.formatBitrate(outboundResult.bitrate));
        this.logger.pushTrendPoint("trendOutboundAudioBitrate", outboundResult.bitrate);

        const inboundResult = this.calcBitrate(
            inboundAudio?.bytesReceived,
            inboundAudio?.timestamp,
            this.previousInboundAudio,
        );
        this.previousInboundAudio = inboundResult.next;
        this.logger.updateMetricValue("inboundAudioBitrate", this.formatBitrate(inboundResult.bitrate));
        this.logger.pushTrendPoint("trendInboundAudioBitrate", inboundResult.bitrate);

        const packetsSent = outboundAudio?.packetsSent;
        this.logger.updateMetricValue(
            "outboundPacketsSent",
            packetsSent == null ? "-" : `${packetsSent}`,
        );

        const packetsLost = inboundAudio?.packetsLost;
        const packetsReceived = inboundAudio?.packetsReceived;
        this.logger.updateMetricValue(
            "inboundPacketsLost",
            packetsLost == null ? "-" : `${packetsLost}`,
        );
        if (packetsLost == null || packetsReceived == null || packetsLost + packetsReceived <= 0) {
            this.logger.updateMetricValue("inboundPacketLossRate", "-");
            this.logger.pushTrendPoint("trendInboundPacketLossRate", null);
        } else {
            const lossRate = (packetsLost / (packetsLost + packetsReceived)) * 100;
            this.logger.updateMetricValue("inboundPacketLossRate", `${lossRate.toFixed(2)}%`);
            this.logger.pushTrendPoint("trendInboundPacketLossRate", lossRate);
        }

        if (inboundAudio?.jitter == null) {
            this.logger.updateMetricValue("inboundJitter", "-");
        } else {
            this.logger.updateMetricValue("inboundJitter", `${(inboundAudio.jitter * 1000).toFixed(1)} ms`);
        }

        if (selectedPair?.currentRoundTripTime == null) {
            this.logger.updateMetricValue("rtcRoundTripTime", "-");
            this.logger.pushTrendPoint("trendRoundTripTime", null);
        } else {
            this.logger.updateMetricValue("rtcRoundTripTime", `${(selectedPair.currentRoundTripTime * 1000).toFixed(1)} ms`);
            this.logger.pushTrendPoint("trendRoundTripTime", selectedPair.currentRoundTripTime * 1000);
        }
        this.logger.updateMetricValue(
            "rtcAvailableOutgoingBitrate",
            this.formatBitrate(selectedPair?.availableOutgoingBitrate ?? null),
        );

        const localCandidate = selectedPair?.localCandidateId ? localCandidates.get(selectedPair.localCandidateId) : null;
        const remoteCandidate = selectedPair?.remoteCandidateId ? remoteCandidates.get(selectedPair.remoteCandidateId) : null;
        if (!localCandidate || !remoteCandidate) {
            this.logger.updateMetricValue("rtcCandidatePair", "-");
            this.logger.updateMetricValue("rtcTransportProtocol", "-");
            this.logger.updateMetricValue("rtcLocalCandidate", "-");
            this.logger.updateMetricValue("rtcRemoteCandidate", "-");
            this.currentRouteSignature = null;
        } else {
            const localType = localCandidate.candidateType ?? "unknown";
            const remoteType = remoteCandidate.candidateType ?? "unknown";
            const localProtocol = localCandidate.protocol ?? "-";
            const relayProtocol = localCandidate.relayProtocol ? `/${localCandidate.relayProtocol}` : "";
            const localEndpoint = this.candidateEndpointLabel(localCandidate);
            const remoteEndpoint = this.candidateEndpointLabel(remoteCandidate);

            this.logger.updateMetricValue("rtcCandidatePair", `${localType} -> ${remoteType}`);
            this.logger.updateMetricValue("rtcTransportProtocol", `${localProtocol}${relayProtocol}`);
            this.logger.updateMetricValue("rtcLocalCandidate", localEndpoint);
            this.logger.updateMetricValue("rtcRemoteCandidate", remoteEndpoint);

            const routeSignature = `${localEndpoint}=>${remoteEndpoint}`;
            if (this.currentRouteSignature !== routeSignature) {
                this.currentRouteSignature = routeSignature;
                this.logger.addRtcEventLog(`selected route: ${localEndpoint} -> ${remoteEndpoint}`);
            }
        }
    }
}
