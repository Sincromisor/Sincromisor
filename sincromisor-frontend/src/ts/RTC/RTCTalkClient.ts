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

    start(): Promise<void> {
        this.sessionId = null;
        this.pendingIceCandidates = [];
        this.chatMessageManager.writeSystemMessage("音声認識・合成システムに接続します。");
        return this.negotiate(this.peerConnection);
    }

    stop(): void {
        this.sessionId = null;
        this.pendingIceCandidates = [];

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
        setTimeout(() => { this.start(); }, Math.random() * 20000 + 10000);
    }

    setMute(mute: boolean): void {
        this.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
            if (sender.track) {
                sender.track.enabled = !mute;
            }
        });
    }

    private async negotiate(peerConnection: RTCPeerConnection): Promise<void> {
        // Trickle ICE方針:
        // 1) OfferはICE completeを待たず先に送信して接続開始を早める
        // 2) 以降のcandidateは /candidate に逐次送信する
        return peerConnection.createOffer()
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
                console.log(JSON.stringify({
                    sdp: offer.sdp,
                    type: offer.type
                }));
                return fetch(this.sincroConfig.offerURL, {
                    body: JSON.stringify({
                        sdp: offer.sdp,
                        type: offer.type,
                        talk_mode: this.talkMode
                    }),
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
                // Offer応答前に貯まったcandidateを、session_id確定後に順次反映する。
                return this.flushPendingIceCandidates()
                    .then(() => {
                        return peerConnection.setRemoteDescription({
                            sdp: answer.sdp,
                            type: answer.type,
                        });
                    });
            }).catch((e) => {
                this.sessionId = null;
                this.pendingIceCandidates = [];
                this.chatMessageManager.writeErrorMessage(`RTCサーバーへの接続に失敗しました...。\n${e}`, true);
                console.error(e);
                this.reConnect();
            });
    }

    private flushPendingIceCandidates(): Promise<void> {
        const pendingCandidates = this.pendingIceCandidates.splice(0, this.pendingIceCandidates.length);
        // 大量candidateでも送信順序を保つため逐次Promiseで流す。
        return pendingCandidates.reduce((p, candidate) => {
            return p.then(() => this.sendIceCandidate(candidate));
        }, Promise.resolve());
    }

    private sendIceCandidate(candidate: RTCIceCandidateInit | null): Promise<void> {
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
        }).then((response) => {
            if (!response.ok) {
                throw new Error(`Failed to send ICE candidate: ${response.status} ${response.statusText}`);
            }
        }).catch((e) => {
            console.error(e);
            this.logger.addTextChannelLog(`! failed to send ice candidate: ${e}\n`);
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
        };
        dc.onopen = () => {
            this.logger.addTelopChannelLog("- open(telop_ch)\n");
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
        };
        dc.onopen = () => {
            this.logger.addTextChannelLog("- open(text_ch)\n");
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
                this.chatMessageManager.writeSystemMessage("音声認識・合成システムに接続しました。");
                break;
            case "completed":
                this.chatMessageManager.writeSystemMessage("音声認識・合成システムとのセッションの確立に成功しました。");
                break;
            case "disconnected":
                this.chatMessageManager.writeErrorMessage("音声認識・合成システムから切断されました。");
                break;
            case "failed":
                this.chatMessageManager.writeErrorMessage("音声認識・合成システムへの接続に失敗しました。");
                break;
            default:
                this.chatMessageManager.writeErrorMessage(`Unknown ICE Connection State - ${state}`);
                console.error(state);
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
                } else {
                    throw "audio#rtcAudio is not found.";
                }
            }
        });
        return peerConnection;
    }
}
