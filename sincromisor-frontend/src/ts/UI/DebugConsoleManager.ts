type AudioMeterHandle = {
    audioContext: AudioContext;
    sourceNode: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    data: Uint8Array;
    frameId: number;
    lowInputFrames: number;
    clippingHoldFrames: number;
    displayLevel: number;
    lastMeterUpdateAt: number;
};

export class DebugConsoleManager {
    private static instance: DebugConsoleManager;
    private static readonly EVENT_LOG_LINES = 80;
    private static readonly CHANNEL_LOG_LINES = 30;
    private static readonly TREND_POINTS = 60;
    private static readonly AUDIO_CLIP_THRESHOLD = 0.98;
    private static readonly AUDIO_LOW_INPUT_THRESHOLD = 0.015;
    private static readonly AUDIO_LOW_INPUT_HOLD_FRAMES = 120;
    private static readonly AUDIO_CLIP_HOLD_FRAMES = 30;
    private static readonly AUDIO_WARNING_SWITCH_HOLD_FRAMES = 18;
    private static readonly AUDIO_METER_UPDATE_INTERVAL_MS = 80;

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
    private readonly localAudioRmsValue: HTMLElement | null;
    private readonly localAudioPeakValue: HTMLElement | null;
    private readonly localAudioWarning: HTMLElement | null;
    private localAudioMeterHandle: AudioMeterHandle | null = null;
    private remoteAudioMeterHandle: AudioMeterHandle | null = null;
    private localAudioWarningState: "ok" | "silent" | "error" = "ok";
    private localAudioWarningPendingState: "ok" | "silent" | "error" = "ok";
    private localAudioWarningPendingFrames: number = 0;

    // シングルトンインスタンスを返す。
    static getManager(): DebugConsoleManager {
        if (!DebugConsoleManager.instance) {
            DebugConsoleManager.instance = new DebugConsoleManager();
        }
        return DebugConsoleManager.instance;
    }

    // デバッグUI要素を取得し、イベントハンドラの初期化を行う。
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
        this.localAudioRmsValue = document.querySelector("#localAudioRmsValue");
        this.localAudioPeakValue = document.querySelector("#localAudioPeakValue");
        this.localAudioWarning = document.querySelector("#localAudioWarning");

        this.setDebugConsoleButtons();
        // 3Dシーン側のポインター制御と干渉しないよう、デバッグUI上のイベントを遮断する。
        this.blockPropagationToSceneControls();
        // 1366px以下ではタブUIで1パネルずつ切り替えるため、常にタブイベントを登録する。
        this.setTabEvents();
        // キーボード運用(PC)向けショートカットは継続しつつ、
        // タブレット向けにはボタン操作でも同等機能を提供する。
        this.setShortcutKeyEvent();
        // モーダル的に扱えるよう、コンソール外クリックで閉じる。
        this.bindOutsideClickClose();
    }

    // デバッグコンソールを表示状態にする。
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

    // デバッグコンソールを非表示状態にする。
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

    // 現在の表示状態に応じてコンソール表示をトグルする。
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

    // メニュー/開閉ボタン類のクリックイベントを登録する。
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

    // 右上のデバッグメニューを開く。
    private openDebugMenu(): void {
        if (!this.debugMenu || !this.debugMenuButton || !this.debugMenuPanel) {
            return;
        }
        this.debugMenu.classList.add("is-open");
        this.debugMenuButton.setAttribute("aria-expanded", "true");
        this.debugMenuPanel.setAttribute("aria-hidden", "false");
    }

    // 右上のデバッグメニューを閉じる。
    private closeDebugMenu(): void {
        if (!this.debugMenu || !this.debugMenuButton || !this.debugMenuPanel) {
            return;
        }
        this.debugMenu.classList.remove("is-open");
        this.debugMenuButton.setAttribute("aria-expanded", "false");
        this.debugMenuPanel.setAttribute("aria-hidden", "true");
    }

    // メニュー外クリックでデバッグメニューを閉じる。
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

    // コンソール外クリックでコンソール全体を閉じる。
    private bindOutsideClickClose(): void {
        document.addEventListener(
            "click",
            (event) => {
                if (!this.debugConsoleContainer || !this.debugConsoleRoot) {
                    return;
                }
                if (!this.debugConsoleContainer.classList.contains("is-open")) {
                    return;
                }
                const target = event.target as Node | null;
                if (!target) {
                    return;
                }
                if (this.debugConsoleRoot.contains(target)) {
                    return;
                }
                if (this.debugMenu && this.debugMenu.contains(target)) {
                    return;
                }
                // コンソール外かつメニュー外のクリックのみ閉じる。
                this.hideDebugConsole();
            },
            { capture: true },
        );
    }

    // 指定要素上のポインターイベント伝播を止める。
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

    // デバッグコンソール上のイベントが3Dシーンへ伝播しないようにする。
    private blockPropagationToSceneControls(): void {
        if (this.debugConsoleRoot) {
            this.blockPointerEvent(this.debugConsoleRoot);
        }
    }

    // タブ名に対応するパネルだけを表示状態にする。
    private setActiveTab(tabName: string): void {
        this.debugTabButtons.forEach((btn) => {
            btn.classList.toggle("is-active", btn.dataset.debugTab === tabName);
        });
        this.debugPanels.forEach((panel) => {
            panel.classList.toggle("is-active", panel.getAttribute("data-debug-panel") === tabName);
        });
    }

    // タブボタンのイベント登録と初期タブ選択を行う。
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

    // キーボードショートカット(Ctrl+Alt+D)を登録する。
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

    // ログ行数上限を超えたテキストを末尾優先で切り詰める。
    private trimTextContent(text: string, lines: number): string {
        return text.split("\n").slice(-lines).join("\n");
    }

    // 指定ログ要素へ追記し、行数上限を維持する。
    private appendLog(logElement: HTMLPreElement | null, msg: string, lines: number): void {
        if (!logElement) {
            return;
        }
        logElement.textContent += msg;
        logElement.textContent = this.trimTextContent(logElement.textContent, lines);
        logElement.scrollTo(0, logElement.scrollHeight);
    }

    // ICE/Signaling状態に応じた表示色クラスを付与する。
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

    // 状態ラベル文字列を更新し、必要なら履歴形式で連結する。
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

    // オーディオメーターのバー幅と数値を更新する。
    private updateAudioMeter(level: number, meter: HTMLElement | null, valueElement: HTMLElement | null): void {
        if (!meter || !valueElement) {
            return;
        }
        const clampedLevel = Math.max(0, Math.min(1, level));
        meter.style.width = `${(clampedLevel * 100).toFixed(1)}%`;
        valueElement.textContent = `${Math.round(clampedLevel * 100)}%`;
    }

    // Local MicのRMS/Peak数値表示を更新する。
    private updateLocalMicMetrics(rms: number, peak: number): void {
        if (this.localAudioRmsValue) {
            this.localAudioRmsValue.textContent = `${(Math.max(0, Math.min(1, rms)) * 100).toFixed(1)}%`;
        }
        if (this.localAudioPeakValue) {
            this.localAudioPeakValue.textContent = `${(Math.max(0, Math.min(1, peak)) * 100).toFixed(1)}%`;
        }
    }

    // Local Micの状態表示テキストと色を更新する。
    private updateLocalMicWarning(state: "ok" | "silent" | "error", message: string): void {
        if (!this.localAudioWarning) {
            return;
        }
        this.localAudioWarning.textContent = message;
        this.localAudioWarning.classList.remove("warn", "error", "silent");
        if (state === "silent") {
            this.localAudioWarning.classList.add("silent");
            return;
        }
        if (state === "error") {
            this.localAudioWarning.classList.add("error");
        }
    }

    // 状態変化のフリッカーを抑えるため、一定継続後に表示状態を切り替える。
    private applyLocalWarningState(nextState: "ok" | "silent" | "error"): void {
        if (nextState === this.localAudioWarningState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 0;
            return;
        }
        if (nextState !== this.localAudioWarningPendingState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 1;
            return;
        }
        this.localAudioWarningPendingFrames += 1;
        if (this.localAudioWarningPendingFrames < DebugConsoleManager.AUDIO_WARNING_SWITCH_HOLD_FRAMES) {
            return;
        }

        this.localAudioWarningState = nextState;
        this.localAudioWarningPendingFrames = 0;
        switch (nextState) {
            case "error":
                this.updateLocalMicWarning("error", "Clipping");
                break;
            case "silent":
                this.updateLocalMicWarning("silent", "Silence");
                break;
            default:
                this.updateLocalMicWarning("ok", "Normal");
        }
    }

    // 音声メーター処理を停止し、関連リソースを解放する。
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
            this.updateLocalMicMetrics(0, 0);
            this.localAudioWarningState = "ok";
            this.localAudioWarningPendingState = "ok";
            this.localAudioWarningPendingFrames = 0;
            this.updateLocalMicWarning("ok", "Normal");
            return;
        }
        this.remoteAudioMeterHandle = null;
        this.updateAudioMeter(0, this.remoteAudioLevelMeter, this.remoteAudioLevelValue);
    }

    // 指定トラックのリアルタイム音量監視を開始する。
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
            let peak = 0;
            for (let i = 0; i < data.length; i += 1) {
                const centered = (data[i] - 128) / 128;
                const absCentered = Math.abs(centered);
                squaredSum += centered * centered;
                if (absCentered > peak) {
                    peak = absCentered;
                }
            }
            const rms = Math.sqrt(squaredSum / data.length);
            const now = performance.now();
            const targetLevel = Math.min(1, rms * 4.5);
            handle.displayLevel = handle.displayLevel * 0.82 + targetLevel * 0.18;
            if (
                now - handle.lastMeterUpdateAt >= DebugConsoleManager.AUDIO_METER_UPDATE_INTERVAL_MS
            ) {
                this.updateAudioMeter(handle.displayLevel, meter, meterValue);
                handle.lastMeterUpdateAt = now;
                if (target === "local") {
                    this.updateLocalMicMetrics(rms, peak);
                }
            }
            if (target === "local") {
                if (peak >= DebugConsoleManager.AUDIO_CLIP_THRESHOLD) {
                    handle.clippingHoldFrames = DebugConsoleManager.AUDIO_CLIP_HOLD_FRAMES;
                } else {
                    handle.clippingHoldFrames = Math.max(0, handle.clippingHoldFrames - 1);
                }
                if (rms <= DebugConsoleManager.AUDIO_LOW_INPUT_THRESHOLD) {
                    handle.lowInputFrames += 1;
                } else {
                    handle.lowInputFrames = 0;
                }

                if (handle.clippingHoldFrames > 0) {
                    this.applyLocalWarningState("error");
                } else if (handle.lowInputFrames >= DebugConsoleManager.AUDIO_LOW_INPUT_HOLD_FRAMES) {
                    this.applyLocalWarningState("silent");
                } else {
                    this.applyLocalWarningState("ok");
                }
            }
            return requestAnimationFrame(loop);
        };

        const frameId = requestAnimationFrame(loop);
        const handle: AudioMeterHandle = {
            audioContext,
            sourceNode,
            analyser,
            data,
            frameId,
            lowInputFrames: 0,
            clippingHoldFrames: 0,
            displayLevel: 0,
            lastMeterUpdateAt: 0,
        };
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

    // ローカル音声トラックをメーター監視対象として登録する。
    setLocalAudioTrack(track: MediaStreamTrack): void {
        if (track.kind !== "audio") {
            return;
        }
        this.startAudioMeter(track, "local");
    }

    // リモート音声トラックをメーター監視対象として登録する。
    setRemoteAudioTrack(track: MediaStreamTrack): void {
        if (track.kind !== "audio") {
            return;
        }
        this.startAudioMeter(track, "remote");
    }

    // getStats再開時にメトリクス表示とトレンド履歴を初期化する。
    resetRealtimeStats(): void {
        // 接続再試行時に古い値を残さないよう、メトリクスとトレンドを初期化する。
        Object.keys(this.metricElements).forEach((key) => {
            this.updateMetricValue(key, "-");
        });
        Object.keys(this.trendPolylines).forEach((key) => {
            this.trendSeries[key] = [];
            this.renderTrend(key);
        });
    }

    // 指定キーのメトリクス表示値を更新する。
    updateMetricValue(key: string, value: string): void {
        const metricElement = this.metricElements[key];
        if (metricElement) {
            metricElement.textContent = value;
        }
    }

    // 1本分のトレンド折れ線を再描画する。
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
        // 直近60点(=約60秒)を固定スケールへ正規化し、比較しやすい折れ線にする。
        const polylinePoints = points.map((v, i) => {
            const x = i * xStep;
            const normalized = Math.max(0, Math.min(1, v / upper));
            const y = height - normalized * (height - 4) - 2;
            return `${x.toFixed(2)},${y.toFixed(2)}`;
        });
        polyline.setAttribute("points", polylinePoints.join(" "));
    }

    // 新しいトレンド点を追加し、固定長バッファを保って再描画する。
    pushTrendPoint(trendKey: string, value: number | null): void {
        const normalizedValue = value != null && Number.isFinite(value) && value >= 0 ? value : 0;
        if (!this.trendSeries[trendKey]) {
            this.trendSeries[trendKey] = [];
        }
        const series = this.trendSeries[trendKey];
        series.push(normalizedValue);
        // 固定長バッファで描画コストを抑え、レイアウトを安定させる。
        if (series.length > DebugConsoleManager.TREND_POINTS) {
            series.splice(0, series.length - DebugConsoleManager.TREND_POINTS);
        }
        this.renderTrend(trendKey);
    }

    // RTCイベントログにタイムスタンプ付きで追記する。
    addRtcEventLog(msg: string): void {
        const now = new Date();
        const ts = now.toISOString().split("T")[1]?.replace("Z", "") || now.toISOString();
        this.appendLog(this.rtcEventLog, `[${ts}] ${msg}\n`, DebugConsoleManager.EVENT_LOG_LINES);
    }

    // telop_chログへ追記する。
    addTelopChannelLog(msg: string): void {
        this.appendLog(this.telopChannelLog, msg, DebugConsoleManager.CHANNEL_LOG_LINES);
    }

    // text_chログへ追記する。
    addTextChannelLog(msg: string): void {
        this.appendLog(this.textChannelLog, msg, DebugConsoleManager.CHANNEL_LOG_LINES);
    }

    // ICE connectionの初期状態表示をセットする。
    newIceConnectionState(msg: string): void {
        this.updateStateLog(this.iceConnectionLog, msg, false);
        this.addRtcEventLog(`ICE connection state = ${msg}`);
    }

    // ICE connectionの遷移状態表示を追記形式で更新する。
    updateIceConnectionState(msg: string): void {
        this.updateStateLog(this.iceConnectionLog, msg, true);
        this.addRtcEventLog(`ICE connection state -> ${msg}`);
    }

    // ICE gatheringの初期状態表示をセットする。
    newIceGatheringState(msg: string): void {
        this.updateStateLog(this.iceGatheringLog, msg, false);
        this.addRtcEventLog(`ICE gathering state = ${msg}`);
    }

    // ICE gatheringの遷移状態表示を追記形式で更新する。
    updateIceGatheringState(msg: string): void {
        this.updateStateLog(this.iceGatheringLog, msg, true);
        this.addRtcEventLog(`ICE gathering state -> ${msg}`);
    }

    // signalingの初期状態表示をセットする。
    newSignalingState(msg: string): void {
        this.updateStateLog(this.signalingLog, msg, false);
        this.addRtcEventLog(`Signaling state = ${msg}`);
    }

    // signalingの遷移状態表示を追記形式で更新する。
    updateSignalingState(msg: string): void {
        this.updateStateLog(this.signalingLog, msg, true);
        this.addRtcEventLog(`Signaling state -> ${msg}`);
    }

    // Offer SDP全文を表示欄へ出力する。
    offerSDP(msg: string): void {
        if (this.offerSDPLog) {
            this.offerSDPLog.textContent = msg;
        }
    }

    // Answer SDP全文を表示欄へ出力する。
    answerSDP(msg: string): void {
        if (this.answerSDPLog) {
            this.answerSDPLog.textContent = msg;
        }
    }

    /* CharacterGaze */
    // 顔検出X座標表示を更新する。
    updateFaceXLog(value: number): void {
        if (this.faceXLog) {
            this.faceXLog.textContent = `${value}`;
        }
    }

    // 顔検出Y座標表示を更新する。
    updateFaceYLog(value: number): void {
        if (this.faceYLog) {
            this.faceYLog.textContent = `${value}`;
        }
    }

    // 正面向き判定の数値表示を更新する。
    updateFacing(value: number): void {
        if (this.facing) {
            this.facing.textContent = `${value}`;
        }
    }

    // CharacterGazeによる注視状態を表示する。
    updateCharacterEyeStatus(watching: boolean): void {
        if (!this.characterGazeStatus) {
            return;
        }
        this.characterGazeStatus.innerText = watching ? "みてる" : "みてない";
    }
}
