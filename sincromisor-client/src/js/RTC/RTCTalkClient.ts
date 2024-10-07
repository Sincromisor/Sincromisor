import { DebugConsoleManager } from "../UI/DebugConsoleManager";
import { TelopChannelMessage, TextChannelMessage } from "./RTCMessage";
import { ChatMessageManager } from "../UI/ChatMessageManager";

export class RTCTalkClient {
    logger: DebugConsoleManager;
    peerConnection: RTCPeerConnection;
    telopChannel: RTCDataChannel;
    textChannel: RTCDataChannel;
    audioTrack: MediaStreamTrack;
    enableSTUN: boolean;
    stunURL: string;
    config: RTCConfiguration;
    chatMessageManager: ChatMessageManager;

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
    textChannelCallback: (msg: TextChannelMessage) => void = () => { };

    constructor(audioTrack: MediaStreamTrack, enableSTUN: boolean = false, stunURL = "stun:stun.negix.org:3478") {
        this.logger = DebugConsoleManager.getManager();
        this.chatMessageManager = ChatMessageManager.getManager();
        this.audioTrack = audioTrack;
        this.enableSTUN = enableSTUN;
        this.stunURL = stunURL;
        this.config = this.defaultConfig();
        if (enableSTUN) {
            //config["iceServers"] = [{ urls: ["stun:stun.l.google.com:19302"] }]
            this.config["iceServers"] = [{ urls: [stunURL] }];
        }
        console.log(this.config);
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
            /* stunを利用する際にコメントを外す。 */
            /*iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]*/
        }
    }

    start(): Promise<void> {
        this.chatMessageManager.writeSystemMessageText("音声認識・合成システムに接続します。");
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
        return peerConnection.createOffer()
            .then((offer) => {
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                // wait for ICE gathering to complete
                return new Promise<void>((resolve) => {
                    if (peerConnection.iceGatheringState === "complete") {
                        resolve();
                    } else {
                        function checkState() {
                            if (peerConnection.iceGatheringState === "complete") {
                                peerConnection.removeEventListener("icegatheringstatechange", checkState);
                                resolve();
                            }
                        }
                        peerConnection.addEventListener("icegatheringstatechange", checkState);
                    }
                });
            })
            .then(() => {
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
                let rtcServerURL: string | null = import.meta.env.RTC_SERVER_URL;
                if (!rtcServerURL) {
                    rtcServerURL = '/offer';
                }
                return fetch(rtcServerURL, {
                    body: JSON.stringify({
                        sdp: offer.sdp,
                        type: offer.type
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
            this.logger.addTextChannelLog("< [telop_ch] " + evt.data + "\n");
            this.textChannelCallback(JSON.parse(evt.data) as TextChannelMessage);
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
                this.chatMessageManager.writeSystemMessageText("音声認識・合成システムに接続します。");
                break;
            case "checking":
                this.chatMessageManager.writeSystemMessageText("音声認識・合成システムへの接続を確認しています。");
                break;
            case "connected":
                this.chatMessageManager.writeSystemMessageText("音声認識・合成システムに接続しました。");
                break;
            case "completed":
                this.chatMessageManager.writeSystemMessageText("音声認識・合成システムとのセッションの確立に成功しました。");
                break;
            case "disconnected":
                this.chatMessageManager.writeSystemMessageText("音声認識・合成システムから切断されました。");
                break;
            case "failed":
                this.chatMessageManager.writeSystemMessageText("音声認識・合成システムへの接続に失敗しました。");
                break;
            default:
                this.chatMessageManager.writeSystemMessageText(`Unknown ICE Connection State - ${state}`);
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

    /* 指定したcodec以外を除外したSDPを生成する。
       これにより指定したcodecの利用を強制する。
    private sdpFilterCodec(kind: string, codec: string, realSdp: string): string {
        // 「a=rtpmap:111 opus/48000/2」 の 「111」などが入る
        let allowed: number[] = []
        const rtxRegex: RegExp = new RegExp("a=fmtp:(\\d+) apt=(\\d+)\r$");
        const codecRegex: RegExp = new RegExp("a=rtpmap:([0-9]+) " + this.escapeRegExp(codec))
        const videoRegex: RegExp = new RegExp("(m=" + kind + " .*?)( ([0-9]+))*\\s*$")

        const lines: string[] = realSdp.split("\n");

        let isKind: boolean = false;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("m=" + kind + " ")) {
                isKind = true;
            } else if (lines[i].startsWith("m=")) {
                isKind = false;
            }

            if (isKind) {
                var match: RegExpMatchArray | null = lines[i].match(codecRegex);
                if (match) {
                    allowed.push(parseInt(match[1]));
                }

                match = lines[i].match(rtxRegex);
                if (match && allowed.includes(parseInt(match[2]))) {
                    allowed.push(parseInt(match[1]));
                }
            }
        }

        const skipRegex: string = "a=(fmtp|rtcp-fb|rtpmap):([0-9]+)";
        let newSdp: string = "";

        isKind = false;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("m=" + kind + " ")) {
                isKind = true;
            } else if (lines[i].startsWith("m=")) {
                isKind = false;
            }

            if (isKind) {
                var skipMatch = lines[i].match(skipRegex);
                if (skipMatch && !allowed.includes(parseInt(skipMatch[2]))) {
                    continue;
                } else if (lines[i].match(videoRegex)) {
                    newSdp += lines[i].replace(videoRegex, "$1 " + allowed.join(" ")) + "\n";
                } else {
                    newSdp += lines[i] + "\n";
                }
            } else {
                newSdp += lines[i] + "\n";
            }
        }
        return newSdp;
    }
    */

    /*
    private escapeRegExp(string: string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
    }
    */
}
