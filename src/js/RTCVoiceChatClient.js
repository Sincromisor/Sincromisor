export class RTCVoiceChatClient {
    constructor() {
        this.telopChannelLog = document.querySelector("#telopChannel");
        this.textChannelLog = document.querySelector("#textChannel");
        this.iceConnectionLog = document.querySelector("#iceConnectionState");
        this.iceGatheringLog = document.querySelector("#iceGatheringState");
        this.signalingLog = document.querySelector("#signalingState");
        this.offerSDPLog = document.querySelector("#offerSDP");
        this.answerSDPLog = document.querySelector("#answerSDP");
        this.peerConnection = null;
        this.telopChannel = null;
        this.textChannel = null;
        this.telopChannelCallback = null;
        this.textChannelCallback = null;
        this.connectionStateChangeCallback = null;
        this.config = this.defaultConfig();
    }

    defaultConfig() {
        return {
            "rtcPeerConnectionConfig": {
                sdpSemantics: "unified-plan",
                /* stunを利用する際にコメントを外す。 */
                /*iceServers: [{ urls: ["stun:stun.l.google.com:19302"] }]*/
            },
            /*
                default     Default codecs
                VP8/90000   VP8
                H264/90000  H264
            */
            "videoCodec": "default",
            /* 
                default         Default codecs
                opus/48000/2    Opus
                PCMU/8000       PCMU
                PCMA/8000       PCMA
            */
            "audioCodec": "default"
        }
    }

    start(audioTrack, stun = false) {
        let config = this.config.rtcPeerConnectionConfig;
        if (stun) {
            //config["iceServers"] = [{ urls: ["stun:stun.l.google.com:19302"] }]
            config["iceServers"] = [{ urls: ["stun:conoha.hachune.net:3478"] }]
        }
        console.log(config);
        this.peerConnection = new RTCPeerConnection(config);
        this.setupICEEventLog(this.peerConnection);
        this.setupTrack(this.peerConnection);
        this.textChannel = this.createTextChannel(this.peerConnection);
        this.telopChannel = this.createTelopChannel(this.peerConnection);

        this.peerConnection.addTrack(audioTrack);
        return this.negotiate(this.peerConnection);
    }

    stop() {
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
        this.peerConnection.getSenders().forEach((sender) => {
            sender.track.stop();
        });

        // close peer connection
        setTimeout(() => {
            this.peerConnection.close();
        }, 1000);
    }

    reConnect() {
        setTimeout(() => { this.start(this.textChannelCallback, this.telopChannelCallback); }, 5000);
    }

    setMute(mute) {
        this.peerConnection?.getSenders().forEach((sender) => {
            sender.track.enabled = !mute;
        });
    }

    negotiate(peerConnection) {
        return peerConnection.createOffer()
            .then((offer) => {
                return peerConnection.setLocalDescription(offer);
            })
            .then(() => {
                // wait for ICE gathering to complete
                return new Promise((resolve) => {
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
                var offer = peerConnection.localDescription;
                if (this.config.audioCodec !== "default") {
                    offer.sdp = this.sdpFilterCodec("audio", this.config.audioCodec, offer.sdp);
                }
                if (this.config.videoCodec !== "default") {
                    offer.sdp = this.sdpFilterCodec("video", this.config.videoCodec, offer.sdp);
                }

                this.offerSDPLog.textContent = offer.sdp;
                return fetch("/offer", {
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
                this.answerSDPLog.textContent = answer.sdp;
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
    createTelopChannel(peerConnection) {
        const parameters = { "ordered": false, "maxRetransmits": 0 }
        const dc = peerConnection.createDataChannel("telop_ch", parameters);
        dc.onclose = () => {
            this.telopChannelLog.textContent += "- close(telop_ch)\n";
        };
        dc.onopen = () => {
            this.telopChannelLog.textContent += "- open(telop_ch)\n";
        };
        dc.onmessage = (evt) => {
            if (this.telopChannelCallback) { this.telopChannelCallback(evt); }
            this.telopChannelLog.textContent += "< [telop_ch] " + evt.data + "\n";
            this.telopChannelLog.textContent = this.telopChannelLog.textContent.split("\n").slice(-10).join("\n");
            this.telopChannelLog.scrollTo(0, this.telopChannelLog.scrollHeight);
        };
        return dc;
    }

    createTextChannel(peerConnection) {
        const parameters = { "ordered": true }
        const dc = peerConnection.createDataChannel("text_ch", parameters);
        dc.onclose = () => {
            this.textChannelLog.textContent += "- close(text_ch)\n";
        };
        dc.onopen = () => {
            this.textChannelLog.textContent += "- open(text_ch)\n";
        };
        dc.onmessage = (evt) => {
            if (this.textChannelCallback) { this.textChannelCallback(evt); }
            this.textChannelLog.textContent += "< [text_ch] " + evt.data + "\n";
            this.textChannelLog.textContent = this.textChannelLog.textContent.split("\n").slice(-10).join("\n");
            this.textChannelLog.scrollTo(0, this.textChannelLog.scrollHeight);
        };
        return dc;
    }

    setupICEEventLog(peerConnection) {
        // register some listeners to help debugging
        peerConnection.addEventListener("icegatheringstatechange", () => {
            this.iceGatheringLog.textContent += " -> " + peerConnection.iceGatheringState;
        }, false);
        this.iceGatheringLog.textContent = peerConnection.iceGatheringState;

        /* 接続の確立はnew -> checking -> connected、切断されたらdisconnected -> failed */
        peerConnection.addEventListener("iceconnectionstatechange", () => {
            this.iceConnectionLog.textContent += " -> " + peerConnection.iceConnectionState;
            if (this.connectionStateChangeCallback) {
                this.connectionStateChangeCallback(peerConnection.iceConnectionState);
            };
            if (peerConnection.iceConnectionState == 'failed') {
                this.reConnect();
            }
        }, false);
        this.iceConnectionLog.textContent = peerConnection.iceConnectionState;

        peerConnection.addEventListener("signalingstatechange", () => {
            this.signalingLog.textContent += " -> " + peerConnection.signalingState;
        }, false);
        this.signalingLog.textContent = peerConnection.signalingState;
        return peerConnection;
    }

    setupTrack(peerConnection) {
        peerConnection.addEventListener("track", (evt) => {
            if (evt.track.kind == "video") {
                console.error("Unknown Video Track!");
                document.querySelector("#video").srcObject = evt.streams[0];
            } else {
                document.querySelector("#rtcVoice").srcObject = evt.streams[0];
            }
        });
        return peerConnection;
    }

    /* 指定したcodec以外を除外したSDPを生成する。
       これにより指定したcodecの利用を強制する。 */
    sdpFilterCodec(kind, codec, realSdp) {
        /* 「a=rtpmap:111 opus/48000/2」 の 「111」などが入る */
        let allowed = []
        const rtxRegex = new RegExp("a=fmtp:(\\d+) apt=(\\d+)\r$");
        const codecRegex = new RegExp("a=rtpmap:([0-9]+) " + this.escapeRegExp(codec))
        const videoRegex = new RegExp("(m=" + kind + " .*?)( ([0-9]+))*\\s*$")

        const lines = realSdp.split("\n");

        let isKind = false;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("m=" + kind + " ")) {
                isKind = true;
            } else if (lines[i].startsWith("m=")) {
                isKind = false;
            }

            if (isKind) {
                var match = lines[i].match(codecRegex);
                if (match) {
                    allowed.push(parseInt(match[1]));
                }

                match = lines[i].match(rtxRegex);
                if (match && allowed.includes(parseInt(match[2]))) {
                    allowed.push(parseInt(match[1]));
                }
            }
        }

        const skipRegex = "a=(fmtp|rtcp-fb|rtpmap):([0-9]+)";
        let newSdp = "";

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

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
    }
}
