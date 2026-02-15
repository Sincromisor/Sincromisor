import { DebugConsoleManager } from "../UI/DebugConsoleManager";
import { ChatMessage, TelopChannelMessage } from "./RTCMessage";
import { ChatMessageManager } from "../UI/ChatMessageManager";
import { SincroRTCConfig } from "./SincroRTCConfigManager";

export class RTCTalkClient {
    // Firefoxは短時間でcompleteに達する一方、Chromiumはネットワーク条件によって
    // ICE gathering完了まで数十秒かかることがある。
    // この値は「ユーザー待ち時間を抑える」ための上限待機時間。
    // timeout後は収集中の候補を含むSDPでoffer送信を続行する。
    // 副作用: candidateが出揃う前に送信するため、NAT条件が厳しい環境では
    // 初回接続成功率がわずかに低下する可能性がある（速度とのトレードオフ）。
    private static readonly ICE_GATHERING_TIMEOUT_MS = 1500;
    private readonly logger: DebugConsoleManager;
    private readonly peerConnection: RTCPeerConnection;
    private readonly telopChannel: RTCDataChannel;
    private readonly textChannel: RTCDataChannel;
    private readonly chatMessageManager: ChatMessageManager;
    private readonly talkMode: string;
    private config: RTCConfiguration;
    private sincroConfig: SincroRTCConfig;

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
        this.chatMessageManager.writeSystemMessage("音声認識・合成システムに接続します。");
        return this.negotiate(this.peerConnection);
    }

    stop(): void {
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
        // 1) Offerを生成してlocalDescriptionへ反映する。
        // setLocalDescription時点でICE candidate収集が開始される。
        return peerConnection.createOffer()
            .then((offer) => {
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                // 2) 本来はICE gathering完了まで待つ。
                // ただしChromiumでは、利用可能なcandidateが既に得られていても
                // 「complete」遷移が遅れるケースがあり、ここで接続開始が大きく遅延する。
                // そのため、complete待ちは最大ICE_GATHERING_TIMEOUT_MSで打ち切る。
                return new Promise<void>((resolve) => {
                    if (peerConnection.iceGatheringState === "complete") {
                        // 既に完了している場合は即座に次へ進む。
                        resolve();
                        return;
                    }

                    const timerId = window.setTimeout(() => {
                        // 3) timeout時はcompleteを待たずにoffer送信へ進む。
                        // Trickle ICE未実装の構成でも、初期candidateのみで接続できる環境が多く、
                        // 体感遅延の大幅な悪化を防げる。
                        // 一方で、candidate不足により接続成立率が低下する可能性がある。
                        peerConnection.removeEventListener("icegatheringstatechange", checkState);
                        console.warn(
                            `negotiate: ICE gathering timeout(${RTCTalkClient.ICE_GATHERING_TIMEOUT_MS}ms), continue with partial candidates.`,
                        );
                        resolve();
                    }, RTCTalkClient.ICE_GATHERING_TIMEOUT_MS);

                    function checkState() {
                        if (peerConnection.iceGatheringState === "complete") {
                            // timeout前にcompleteへ到達した通常経路。
                            window.clearTimeout(timerId);
                            peerConnection.removeEventListener("icegatheringstatechange", checkState);
                            resolve();
                        }
                    }
                    peerConnection.addEventListener("icegatheringstatechange", checkState);
                });
            })
            .then(() => {
                // 4) 取得できた時点のlocalDescriptionをofferとしてシグナリングサーバーへ送る。
                console.log('negotiate: complate.');

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
                return peerConnection.setRemoteDescription(answer);
            }).catch((e) => {
                this.chatMessageManager.writeErrorMessage(`RTCサーバーへの接続に失敗しました...。\n${e}`, true);
                console.error(e);
                this.reConnect();
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
