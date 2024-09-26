export class DebugConsoleManager {
    private static instance: DebugConsoleManager

    /* RTC */
    telopChannelLog: HTMLPreElement | null;
    textChannelLog: HTMLPreElement | null;
    iceConnectionLog: HTMLSpanElement | null;
    iceGatheringLog: HTMLSpanElement | null;
    signalingLog: HTMLSpanElement | null;
    offerSDPLog: HTMLPreElement | null;
    answerSDPLog: HTMLPreElement | null;

    /* CharacterGaze */
    faceXLog: HTMLElement | null;
    faceYLog: HTMLElement | null;
    facing: HTMLElement | null;
    characterGazeStatus: HTMLElement | null;

    static getManager(): DebugConsoleManager {
        if (!DebugConsoleManager.instance) {
            DebugConsoleManager.instance = new DebugConsoleManager();
        }
        return DebugConsoleManager.instance;
    }

    private constructor() {
        /* RTC */
        this.telopChannelLog = document.querySelector("pre#telopChannel");
        this.textChannelLog = document.querySelector("pre#textChannel");
        this.iceConnectionLog = document.querySelector("span#iceConnectionState");
        this.iceGatheringLog = document.querySelector("span#iceGatheringState");
        this.signalingLog = document.querySelector("span#signalingState");
        this.offerSDPLog = document.querySelector("pre#offerSDP");
        this.answerSDPLog = document.querySelector("pre#answerSDP");

        /* CharacterGaze */
        this.faceXLog = document.querySelector('dd#faceX');
        this.faceYLog = document.querySelector('dd#faceY');
        this.facing = document.querySelector('dd#facing');
        this.characterGazeStatus = document.querySelector('dd#characterGazeStatus');

        this.setShortcutKeyEvent();
    }

    /* ctrl + alt + dでデバッグコンソールを表示 */
    private setShortcutKeyEvent(): void {
        const debugConsole: HTMLDivElement | null = document.querySelector("div#debugConsole");
        if (!debugConsole) {
            return;
        }
        window.addEventListener("keydown", (e) => {
            // macOSのChromeではalt+dでkeyの値がδになる
            if (e.ctrlKey && e.altKey && (e.key == 'd' || e.code == 'KeyD')) {
                if (window.getComputedStyle(debugConsole).zIndex == '-1') {
                    debugConsole.style.zIndex = '255';
                    debugConsole.style.overflow = 'scroll';
                } else {
                    debugConsole.style.zIndex = '-1';
                    debugConsole.style.overflow = 'hidden';
                }
            }
        });
    }

    /* RTC */
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

    /* CharacterGaze */
    updateFaceXLog(value: number): void {
        if (this.faceXLog) {
            this.faceXLog.textContent = `${value}`;
        }
    }

    updateFaceYLog(value: number): void {
        if (this.faceYLog) {
            this.faceYLog.textContent = `${value}`;
        }
    }

    updateFacing(value: number): void {
        if (this.facing) {
            this.facing.textContent = `${value}`;
        }
    }

    updateCharacterEyeStatus(watching: boolean): void {
        if (!this.characterGazeStatus) {
            return;
        }
        if (watching) {
            this.characterGazeStatus.innerText = 'みてる';
        } else {
            this.characterGazeStatus.innerText = 'みてない';
        }
    }
}
