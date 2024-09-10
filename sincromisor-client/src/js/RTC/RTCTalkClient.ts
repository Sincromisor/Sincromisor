import { RTCLogger } from "./RTCLogger"
import { TelopChannelMessage, TextChannelMessage } from "./RTCMessage";

export class RTCTalkClient {
    logger: RTCLogger;
    peerConnection: RTCPeerConnection;
    telopChannel: RTCDataChannel;
    textChannel: RTCDataChannel;
    audioTrack: MediaStreamTrack;
    enableSTUN: boolean;
    stunURL: string;
    config: RTCConfiguration;
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
    connectionStateChangeCallback: (state: RTCIceConnectionState) => void = () => { };

    constructor(audioTrack: MediaStreamTrack, enableSTUN: boolean = false, stunURL = "stun:stun.negix.org:3478") {
        this.logger = new RTCLogger();
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
        setTimeout(() => { this.start(); }, 10000);
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
                console.log('negotiate: 1');
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                console.log('negotiate: 2');
                // wait for ICE gathering to complete
                return new Promise<void>((resolve) => {
                    console.log('negotiate: 3');
                    if (peerConnection.iceGatheringState === "complete") {
                        console.log('negotiate: 4');
                        resolve();
                    } else {
                        console.log('negotiate: 5');
                        function checkState() {
                            console.log('negotiate: 6');
                            if (peerConnection.iceGatheringState === "complete") {
                                console.log('negotiate: 7');
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

                const offer = peerConnection.localDescription;
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
                if (rtcServerURL){
                    rtcServerURL = import.meta.env.RTC_SERVER_URL + '/offer';
                } else {
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
                return response.json();
            }).then((answer) => {
                this.logger.answerSDP(answer.sdp);
                return peerConnection.setRemoteDescription(answer);
            }).catch((e) => {
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
            this.connectionStateChangeCallback(peerConnection.iceConnectionState);
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

    private setupTrack(peerConnection: RTCPeerConnection): RTCPeerConnection {
        peerConnection.addEventListener("track", (evt: RTCTrackEvent) => {
            if (evt.track.kind == "video") {
                console.error("Unknown Video Track!");
                const rtcVideo: HTMLVideoElement | null = document.querySelector("video#rtcVideo");
                if (rtcVideo) {
                    rtcVideo.srcObject = evt.streams[0];
                }
            } else {
                const rtcAudio: HTMLAudioElement | null = document.querySelector("audio#rtcAudio");
                if (rtcAudio) {
                    rtcAudio.srcObject = evt.streams[0];
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
