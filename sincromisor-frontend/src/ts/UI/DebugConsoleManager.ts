type AudioMeterHandle = {
    audioContext: AudioContext;
    sourceNode: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    data: Uint8Array;
    frameId: number;
};

export class DebugConsoleManager {
    private static instance: DebugConsoleManager;
    private static readonly EVENT_LOG_LINES = 80;
    private static readonly CHANNEL_LOG_LINES = 30;
    private static readonly TREND_POINTS = 60;

    private readonly debugConsoleContainer: HTMLDivElement | null;
    private readonly debugConsoleRoot: HTMLDivElement | null;
    private readonly debugMenu: HTMLDivElement | null;
    private readonly debugMenuButton: HTMLButtonElement | null;
    private readonly debugMenuPanel: HTMLDivElement | null;
    private readonly debugConsoleToggleButton: HTMLButtonElement | null;
    private readonly debugConsoleCloseButton: HTMLButtonElement | null;
    private readonly debugTabButtons: NodeListOf<HTMLButtonElement>;
    private readonly debugPanels: NodeListOf<HTMLElement>;

    /* RTC */
    private readonly telopChannelLog: HTMLPreElement | null;
    private readonly textChannelLog: HTMLPreElement | null;
    private readonly rtcEventLog: HTMLPreElement | null;
    private readonly iceConnectionLog: HTMLSpanElement | null;
    private readonly iceGatheringLog: HTMLSpanElement | null;
    private readonly signalingLog: HTMLSpanElement | null;
    private readonly offerSDPLog: HTMLPreElement | null;
    private readonly answerSDPLog: HTMLPreElement | null;
    private readonly metricElements: Record<string, HTMLElement | null>;
    private readonly trendPolylines: Record<string, SVGPolylineElement | null>;
    private readonly trendSeries: Record<string, number[]> = {};
    private readonly trendMaxValues: Record<string, number> = {
        trendOutboundAudioBitrate: 256000, // 256 kbps
        trendInboundAudioBitrate: 256000, // 256 kbps
        trendRoundTripTime: 200, // 200 ms
        trendInboundPacketLossRate: 5, // 5%
    };

    /* CharacterGaze */
    private readonly faceXLog: HTMLElement | null;
    private readonly faceYLog: HTMLElement | null;
    private readonly facing: HTMLElement | null;
    private readonly characterGazeStatus: HTMLElement | null;

    /* Audio meter */
    private readonly localAudioLevelMeter: HTMLElement | null;
    private readonly remoteAudioLevelMeter: HTMLElement | null;
    private readonly localAudioLevelValue: HTMLElement | null;
    private readonly remoteAudioLevelValue: HTMLElement | null;
    private localAudioMeterHandle: AudioMeterHandle | null = null;
    private remoteAudioMeterHandle: AudioMeterHandle | null = null;

    static getManager(): DebugConsoleManager {
        if (!DebugConsoleManager.instance) {
            DebugConsoleManager.instance = new DebugConsoleManager();
        }
        return DebugConsoleManager.instance;
    }

    private constructor() {
        this.debugConsoleContainer = document.querySelector("div#sincroDebugConsoleContainer");
        this.debugConsoleRoot = document.querySelector("div#debugConsole");
        this.debugMenu = document.querySelector("div#debugMenu");
        this.debugMenuButton = document.querySelector("button#debugMenuButton");
        this.debugMenuPanel = document.querySelector("div#debugMenuPanel");
        this.debugConsoleToggleButton = document.querySelector("button#debugConsoleToggle");
        this.debugConsoleCloseButton = document.querySelector("button#debugConsoleClose");
        this.debugTabButtons = document.querySelectorAll("button[data-debug-tab]");
        this.debugPanels = document.querySelectorAll("[data-debug-panel]");

        /* RTC */
        this.telopChannelLog = document.querySelector("pre#telopChannel");
        this.textChannelLog = document.querySelector("pre#textChannel");
        this.rtcEventLog = document.querySelector("pre#rtcEventLog");
        this.iceConnectionLog = document.querySelector("span#iceConnectionState");
        this.iceGatheringLog = document.querySelector("span#iceGatheringState");
        this.signalingLog = document.querySelector("span#signalingState");
        this.offerSDPLog = document.querySelector("pre#offerSDP");
        this.answerSDPLog = document.querySelector("pre#answerSDP");
        this.metricElements = {
            rtcRoundTripTime: document.querySelector("#rtcRoundTripTime"),
            rtcAvailableOutgoingBitrate: document.querySelector("#rtcAvailableOutgoingBitrate"),
            rtcCandidatePair: document.querySelector("#rtcCandidatePair"),
            rtcTransportProtocol: document.querySelector("#rtcTransportProtocol"),
            rtcLocalCandidate: document.querySelector("#rtcLocalCandidate"),
            rtcRemoteCandidate: document.querySelector("#rtcRemoteCandidate"),
            outboundAudioBitrate: document.querySelector("#outboundAudioBitrate"),
            inboundAudioBitrate: document.querySelector("#inboundAudioBitrate"),
            outboundPacketsSent: document.querySelector("#outboundPacketsSent"),
            inboundPacketsLost: document.querySelector("#inboundPacketsLost"),
            inboundPacketLossRate: document.querySelector("#inboundPacketLossRate"),
            inboundJitter: document.querySelector("#inboundJitter"),
        };
        this.trendPolylines = {
            trendOutboundAudioBitrate: document.querySelector("#trendOutboundAudioBitrate polyline"),
            trendInboundAudioBitrate: document.querySelector("#trendInboundAudioBitrate polyline"),
            trendRoundTripTime: document.querySelector("#trendRoundTripTime polyline"),
            trendInboundPacketLossRate: document.querySelector("#trendInboundPacketLossRate polyline"),
        };

        /* CharacterGaze */
        this.faceXLog = document.querySelector("dd#faceX");
        this.faceYLog = document.querySelector("dd#faceY");
        this.facing = document.querySelector("dd#facing");
        this.characterGazeStatus = document.querySelector("dd#characterGazeStatus");

        /* Audio meter */
        this.localAudioLevelMeter = document.querySelector("#localAudioLevelMeter");
        this.remoteAudioLevelMeter = document.querySelector("#remoteAudioLevelMeter");
        this.localAudioLevelValue = document.querySelector("#localAudioLevelValue");
        this.remoteAudioLevelValue = document.querySelector("#remoteAudioLevelValue");

        this.setDebugConsoleButtons();
        this.blockPropagationToSceneControls();
        this.setTabEvents();
        this.setShortcutKeyEvent();
    }

    showDebugConsole(): void {
        if (!this.debugConsoleContainer) {
            return;
        }
        this.debugConsoleContainer.classList.add("is-open");
        this.debugConsoleContainer.style.visibility = "visible";
        this.debugConsoleContainer.style.overflow = "visible";
        if (this.debugConsoleToggleButton) {
            this.debugConsoleToggleButton.innerText = "Close Debug Console";
        }
        this.closeDebugMenu();
    }

    hideDebugConsole(): void {
        if (!this.debugConsoleContainer) {
            return;
        }
        this.debugConsoleContainer.classList.remove("is-open");
        this.debugConsoleContainer.style.visibility = "hidden";
        this.debugConsoleContainer.style.overflow = "hidden";
        if (this.debugConsoleToggleButton) {
            this.debugConsoleToggleButton.innerText = "Open Debug Console";
        }
        this.closeDebugMenu();
    }

    private toggleDebugConsole(): void {
        if (!this.debugConsoleContainer) {
            return;
        }
        if (this.debugConsoleContainer.classList.contains("is-open")) {
            this.hideDebugConsole();
            return;
        }
        this.showDebugConsole();
    }

    private setDebugConsoleButtons(): void {
        if (this.debugMenuButton) {
            this.blockPointerEvent(this.debugMenuButton);
            this.debugMenuButton.addEventListener("click", () => {
                if (this.debugMenu?.classList.contains("is-open")) {
                    this.closeDebugMenu();
                } else {
                    this.openDebugMenu();
                }
            });
        }
        if (this.debugConsoleToggleButton) {
            this.blockPointerEvent(this.debugConsoleToggleButton);
            this.debugConsoleToggleButton.addEventListener("click", () => {
                this.toggleDebugConsole();
            });
        }
        if (this.debugConsoleCloseButton) {
            this.blockPointerEvent(this.debugConsoleCloseButton);
            this.debugConsoleCloseButton.addEventListener("click", () => {
                this.hideDebugConsole();
            });
        }
        this.bindDocumentMenuClose();
    }

    private openDebugMenu(): void {
        if (!this.debugMenu || !this.debugMenuButton || !this.debugMenuPanel) {
            return;
        }
        this.debugMenu.classList.add("is-open");
        this.debugMenuButton.setAttribute("aria-expanded", "true");
        this.debugMenuPanel.setAttribute("aria-hidden", "false");
    }

    private closeDebugMenu(): void {
        if (!this.debugMenu || !this.debugMenuButton || !this.debugMenuPanel) {
            return;
        }
        this.debugMenu.classList.remove("is-open");
        this.debugMenuButton.setAttribute("aria-expanded", "false");
        this.debugMenuPanel.setAttribute("aria-hidden", "true");
    }

    private bindDocumentMenuClose(): void {
        document.addEventListener("click", (event) => {
            if (!this.debugMenu) {
                return;
            }
            const target = event.target as Node | null;
            if (target && this.debugMenu.contains(target)) {
                return;
            }
            this.closeDebugMenu();
        });
    }

    private blockPointerEvent(element: HTMLElement): void {
        const stop = (event: Event): void => {
            event.stopPropagation();
        };
        // Use bubble phase so target controls (buttons/tabs) still receive events.
        element.addEventListener("pointerdown", stop);
        element.addEventListener("pointerup", stop);
        element.addEventListener("touchstart", stop);
        element.addEventListener("touchend", stop);
        element.addEventListener("mousedown", stop);
        element.addEventListener("mouseup", stop);
        element.addEventListener("wheel", stop);
        element.addEventListener("click", stop);
    }

    private blockPropagationToSceneControls(): void {
        if (this.debugConsoleRoot) {
            this.blockPointerEvent(this.debugConsoleRoot);
        }
    }

    private setActiveTab(tabName: string): void {
        this.debugTabButtons.forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.debugTab === tabName);
        });
        this.debugPanels.forEach((panel) => {
            panel.classList.toggle("is-active", panel.getAttribute("data-debug-panel") === tabName);
        });
    }

    private setTabEvents(): void {
        this.debugTabButtons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const tabName = btn.dataset.debugTab;
                if (!tabName) {
                    return;
                }
                this.setActiveTab(tabName);
            });
        });
        this.setActiveTab("status");
    }

    /* ctrl + alt + dでデバッグコンソールを表示 */
    private setShortcutKeyEvent(): void {
        if (!this.debugConsoleContainer) {
            console.error("DebugConsole is not found!");
            return;
        }
        window.addEventListener("keydown", (e) => {
            // macOSのChromeではalt+dでkeyの値がδになる
            if (e.ctrlKey && e.altKey && (e.key == "d" || e.code == "KeyD")) {
                this.toggleDebugConsole();
            }
        });
    }

    private trimTextContent(text: string, lines: number): string {
        return text.split("\n").slice(-lines).join("\n");
    }

    private appendLog(logElement: HTMLPreElement | null, msg: string, lines: number): void {
        if (!logElement) {
            return;
        }
        logElement.textContent += msg;
        logElement.textContent = this.trimTextContent(logElement.textContent, lines);
        logElement.scrollTo(0, logElement.scrollHeight);
    }

    private setStateClass(stateElement: HTMLSpanElement, state: string): void {
        const normalizedState = state.toLowerCase();
        stateElement.classList.remove("state-ok", "state-warn", "state-error");
        if (normalizedState.includes("connected") || normalizedState.includes("completed")) {
            stateElement.classList.add("state-ok");
            return;
        }
        if (normalizedState.includes("checking") || normalizedState.includes("disconnected")) {
            stateElement.classList.add("state-warn");
            return;
        }
        if (normalizedState.includes("failed") || normalizedState.includes("closed")) {
            stateElement.classList.add("state-error");
        }
    }

    private updateStateLog(stateElement: HTMLSpanElement | null, state: string, append: boolean): void {
        if (!stateElement) {
            return;
        }
        if (append && stateElement.textContent) {
            stateElement.textContent += ` -> ${state}`;
        } else {
            stateElement.textContent = state;
        }
        this.setStateClass(stateElement, state);
    }

    private updateAudioMeter(level: number, meter: HTMLElement | null, valueElement: HTMLElement | null): void {
        if (!meter || !valueElement) {
            return;
        }
        const clampedLevel = Math.max(0, Math.min(1, level));
        meter.style.width = `${(clampedLevel * 100).toFixed(1)}%`;
        valueElement.textContent = `${Math.round(clampedLevel * 100)}%`;
    }

    private stopAudioMeter(handle: AudioMeterHandle | null, target: "local" | "remote"): void {
        if (!handle) {
            return;
        }
        cancelAnimationFrame(handle.frameId);
        handle.sourceNode.disconnect();
        handle.analyser.disconnect();
        handle.audioContext.close().catch((e) => console.error(e));
        if (target === "local") {
            this.localAudioMeterHandle = null;
            this.updateAudioMeter(0, this.localAudioLevelMeter, this.localAudioLevelValue);
            return;
        }
        this.remoteAudioMeterHandle = null;
        this.updateAudioMeter(0, this.remoteAudioLevelMeter, this.remoteAudioLevelValue);
    }

    private startAudioMeter(track: MediaStreamTrack, target: "local" | "remote"): void {
        if (typeof window.AudioContext === "undefined") {
            return;
        }
        if (target === "local") {
            this.stopAudioMeter(this.localAudioMeterHandle, "local");
        } else {
            this.stopAudioMeter(this.remoteAudioMeterHandle, "remote");
        }

        const stream = new MediaStream([track]);
        const audioContext = new window.AudioContext();
        const sourceNode = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        sourceNode.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const meter = target === "local" ? this.localAudioLevelMeter : this.remoteAudioLevelMeter;
        const meterValue = target === "local" ? this.localAudioLevelValue : this.remoteAudioLevelValue;

        const loop = (): number => {
            analyser.getByteTimeDomainData(data);
            let squaredSum = 0;
            for (let i = 0; i < data.length; i += 1) {
                const centered = (data[i] - 128) / 128;
                squaredSum += centered * centered;
            }
            const rms = Math.sqrt(squaredSum / data.length);
            this.updateAudioMeter(Math.min(1, rms * 4.5), meter, meterValue);
            return requestAnimationFrame(loop);
        };

        const frameId = requestAnimationFrame(loop);
        const handle: AudioMeterHandle = { audioContext, sourceNode, analyser, data, frameId };
        if (target === "local") {
            this.localAudioMeterHandle = handle;
        } else {
            this.remoteAudioMeterHandle = handle;
        }

        if (audioContext.state === "suspended") {
            audioContext.resume().catch((e) => console.error(e));
        }

        track.addEventListener(
            "ended",
            () => {
                if (target === "local") {
                    this.stopAudioMeter(this.localAudioMeterHandle, "local");
                } else {
                    this.stopAudioMeter(this.remoteAudioMeterHandle, "remote");
                }
            },
            { once: true },
        );
    }

    setLocalAudioTrack(track: MediaStreamTrack): void {
        if (track.kind !== "audio") {
            return;
        }
        this.startAudioMeter(track, "local");
    }

    setRemoteAudioTrack(track: MediaStreamTrack): void {
        if (track.kind !== "audio") {
            return;
        }
        this.startAudioMeter(track, "remote");
    }

    resetRealtimeStats(): void {
        Object.keys(this.metricElements).forEach((key) => {
            this.updateMetricValue(key, "-");
        });
        Object.keys(this.trendPolylines).forEach((key) => {
            this.trendSeries[key] = [];
            this.renderTrend(key);
        });
    }

    updateMetricValue(key: string, value: string): void {
        const metricElement = this.metricElements[key];
        if (metricElement) {
            metricElement.textContent = value;
        }
    }

    private renderTrend(trendKey: string): void {
        const polyline = this.trendPolylines[trendKey];
        if (!polyline) {
            return;
        }
        const points = this.trendSeries[trendKey] ?? [];
        if (points.length <= 1) {
            polyline.setAttribute("points", "");
            return;
        }
        const width = 300;
        const height = 86;
        const upper = this.trendMaxValues[trendKey] ?? 1;
        const xStep = width / (DebugConsoleManager.TREND_POINTS - 1);
        const polylinePoints = points.map((v, i) => {
            const x = i * xStep;
            const normalized = Math.max(0, Math.min(1, v / upper));
            const y = height - normalized * (height - 4) - 2;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });
        polyline.setAttribute("points", polylinePoints.join(" "));
    }

    pushTrendPoint(trendKey: string, value: number | null): void {
        const normalizedValue = value != null && Number.isFinite(value) && value >= 0 ? value : 0;
        if (!this.trendSeries[trendKey]) {
            this.trendSeries[trendKey] = [];
        }
        const series = this.trendSeries[trendKey];
        series.push(normalizedValue);
        if (series.length > DebugConsoleManager.TREND_POINTS) {
            series.splice(0, series.length - DebugConsoleManager.TREND_POINTS);
        }
        this.renderTrend(trendKey);
    }

    addRtcEventLog(msg: string): void {
        const now = new Date();
        const ts = now.toISOString().split("T")[1]?.replace("Z", "") || now.toISOString();
        this.appendLog(this.rtcEventLog, `[${ts}] ${msg}\n`, DebugConsoleManager.EVENT_LOG_LINES);
    }

    addTelopChannelLog(msg: string): void {
        this.appendLog(this.telopChannelLog, msg, DebugConsoleManager.CHANNEL_LOG_LINES);
    }

    addTextChannelLog(msg: string): void {
        this.appendLog(this.textChannelLog, msg, DebugConsoleManager.CHANNEL_LOG_LINES);
    }

    newIceConnectionState(msg: string): void {
        this.updateStateLog(this.iceConnectionLog, msg, false);
        this.addRtcEventLog(`ICE connection state = ${msg}`);
    }

    updateIceConnectionState(msg: string): void {
        this.updateStateLog(this.iceConnectionLog, msg, true);
        this.addRtcEventLog(`ICE connection state -> ${msg}`);
    }

    newIceGatheringState(msg: string): void {
        this.updateStateLog(this.iceGatheringLog, msg, false);
        this.addRtcEventLog(`ICE gathering state = ${msg}`);
    }

    updateIceGatheringState(msg: string): void {
        this.updateStateLog(this.iceGatheringLog, msg, true);
        this.addRtcEventLog(`ICE gathering state -> ${msg}`);
    }

    newSignalingState(msg: string): void {
        this.updateStateLog(this.signalingLog, msg, false);
        this.addRtcEventLog(`Signaling state = ${msg}`);
    }

    updateSignalingState(msg: string): void {
        this.updateStateLog(this.signalingLog, msg, true);
        this.addRtcEventLog(`Signaling state -> ${msg}`);
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
        this.characterGazeStatus.innerText = watching ? "みてる" : "みてない";
    }
}
