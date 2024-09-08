export class RTCLogger {
    telopChannelLog: HTMLPreElement | null;
    textChannelLog: HTMLPreElement | null;
    iceConnectionLog: HTMLSpanElement | null;
    iceGatheringLog: HTMLSpanElement | null;
    signalingLog: HTMLSpanElement | null;
    offerSDPLog: HTMLPreElement | null;
    answerSDPLog: HTMLPreElement | null;

    constructor() {
        this.telopChannelLog = document.querySelector("pre#telopChannel");
        this.textChannelLog = document.querySelector("pre#textChannel");
        this.iceConnectionLog = document.querySelector("span#iceConnectionState");
        this.iceGatheringLog = document.querySelector("span#iceGatheringState");
        this.signalingLog = document.querySelector("span#signalingState");
        this.offerSDPLog = document.querySelector("pre#offerSDP");
        this.answerSDPLog = document.querySelector("pre#answerSDP");
    }

    private trimTextContent(text: string, lines: number): string {
        return text.split("\n").slice(-lines).join("\n");
    }

    addTelopChannelLog(msg: string): void {
        if (this.telopChannelLog) {
            this.telopChannelLog.textContent += msg;
            const textContent = this.trimTextContent(this.telopChannelLog.textContent as string, 10);
            this.telopChannelLog.textContent = textContent;
            this.telopChannelLog.scrollTo(0, this.telopChannelLog.scrollHeight);
        }
    }

    addTextChannelLog(msg: string): void {
        if (this.textChannelLog) {
            this.textChannelLog.textContent += msg;
            const textContent = this.trimTextContent(this.textChannelLog.textContent as string, 10);
            this.textChannelLog.textContent = textContent;
            this.textChannelLog.scrollTo(0, this.textChannelLog.scrollHeight);
        }
    }

    newIceConnectionState(msg: string): void {
        if (this.iceConnectionLog) {
            this.iceConnectionLog.textContent = msg;
        }
    }

    updateIceConnectionState(msg: string): void {
        if (this.iceConnectionLog) {
            this.iceConnectionLog.textContent += '-> ' + msg;
        }
    }

    newIceGatheringState(msg: string): void {
        if (this.iceGatheringLog) {
            this.iceGatheringLog.textContent = msg;
        }
    }

    updateIceGatheringState(msg: string): void {
        if (this.iceGatheringLog) {
            this.iceGatheringLog.textContent += '-> ' + msg;
        }
    }

    newSignalingState(msg: string): void {
        if (this.signalingLog) {
            this.signalingLog.textContent = msg;
        }
    }

    updateSignalingState(msg: string): void {
        if (this.signalingLog) {
            this.signalingLog.textContent += '-> ' + msg;
        }
    }

    offerSDP(msg: string): void {
        if (this.offerSDPLog) {
            this.offerSDPLog.textContent = msg;
        }
    }

    answerSDP(msg: string): void {
        if (this.answerSDPLog) {
            this.answerSDPLog.textContent = msg;
        }
    }
}
