import { useMemo, useState, useSyncExternalStore } from "react";
import {
    CHARACTER_GAZE_TRACKING_TUNING_PRESETS,
    DEBUG_CONSOLE_TREND_MAX_VALUES,
    DebugConsoleManager,
    type CharacterGazeTrackingTuningPresetKey,
    type DebugConsoleSnapshot,
    type DebugConsoleTrendKey,
    type LearnedVadTuningUiConfig,
} from "../../ts/UI/DebugConsoleManager";
import { hideDebugConsole } from "../../ts/UI/rightToolPanelStore";

type DebugTabKey = "status" | "transport" | "audio" | "channels" | "gaze" | "sdp";

function useDebugConsoleSnapshot(): DebugConsoleSnapshot {
    const manager = DebugConsoleManager.getManager();
    return useSyncExternalStore(
        (listener) => manager.subscribeSnapshot(listener),
        () => manager.getSnapshot(),
        () => manager.getSnapshot(),
    );
}

function meterPercent(value: number): string {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function metricPercent(value: number): string {
    return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function vadProbabilityLabel(value: number | null): string {
    if (value == null || !Number.isFinite(value)) {
        return "-";
    }
    return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

function learnedVadFramesLabel(snapshot: DebugConsoleSnapshot): string {
    const tx = Number.isFinite(snapshot.audio.learnedVadReport.txFrames)
        ? Math.max(0, Math.floor(snapshot.audio.learnedVadReport.txFrames ?? 0))
        : 0;
    const rx = Number.isFinite(snapshot.audio.learnedVadReport.rxPredictions)
        ? Math.max(0, Math.floor(snapshot.audio.learnedVadReport.rxPredictions ?? 0))
        : 0;
    return `tx:${tx} rx:${rx}`;
}

function localVadEngineLabel(snapshot: DebugConsoleSnapshot): string {
    if (snapshot.audio.vadThresholdMode === "learned") {
        return "Silero";
    }
    if (snapshot.audio.vadThresholdMode === "auto") {
        return "Auto RMS";
    }
    return "RMS";
}

function stateClassName(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized.includes("connected") || normalized.includes("completed")) {
        return "state-ok";
    }
    if (normalized.includes("checking") || normalized.includes("disconnected")) {
        return "state-warn";
    }
    if (normalized.includes("failed") || normalized.includes("closed")) {
        return "state-error";
    }
    return "";
}

function buildTrendPoints(series: number[], maxValue: number): string {
    if (series.length === 0) {
        return "";
    }
    const width = 300;
    const height = 86;
    const xStep = series.length > 1 ? width / (series.length - 1) : 0;
    return series.map((value, index) => {
        const clamped = Math.max(0, Math.min(maxValue, value));
        const x = series.length === 1 ? width / 2 : index * xStep;
        const y = height - ((clamped / maxValue) * height);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
}

function updateLearnedVadTuning(
    snapshot: DebugConsoleSnapshot,
    patch: Partial<LearnedVadTuningUiConfig>,
): void {
    const manager = DebugConsoleManager.getManager();
    manager.applyLocalLearnedVadTuning({
        ...snapshot.audio.learnedVadTuning,
        ...patch,
    });
}

function renderTrendGraph(snapshot: DebugConsoleSnapshot, key: DebugConsoleTrendKey): string {
    return buildTrendPoints(snapshot.rtc.trends[key], DEBUG_CONSOLE_TREND_MAX_VALUES[key]);
}

// Debug Console の React 正式 view。
// DOM 直更新は行わず、manager が供給する diagnostics snapshot を描画して操作は callback API へ戻す。
export function DebugConsole() {
    const snapshot = useDebugConsoleSnapshot();
    const [activeTab, setActiveTab] = useState<DebugTabKey>("status");
    const manager = useMemo(() => DebugConsoleManager.getManager(), []);

    return (
        <div id="debugConsole">
            <button id="debugConsoleClose" type="button" aria-label="開発者向け診断を閉じる" onClick={hideDebugConsole}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M18.3 6.7a1 1 0 0 0-1.4 0L12 11.6 7.1 6.7a1 1 0 1 0-1.4 1.4l4.9 4.9-4.9 4.9a1 1 0 1 0 1.4 1.4l4.9-4.9 4.9 4.9a1 1 0 0 0 1.4-1.4l-4.9-4.9 4.9-4.9a1 1 0 0 0 0-1.4z" />
                </svg>
            </button>
            <header className="debugConsoleHeader">
                <div className="debugConsoleTitleBox">
                    <div className="debugConsoleEyebrow">開発者向け診断</div>
                    <h2>Debug Console</h2>
                    <p>まずは Overview で接続状態を確認し、必要な時だけ Audio / Channels / SDP の詳細へ進みます。</p>
                </div>
                <div className="debugConsoleActions">
                    <button id="rtcStop" type="button" onClick={() => manager.requestRtcStop()}>
                        接続を停止
                    </button>
                </div>
            </header>
            <nav className="debugConsoleTabs" aria-label="Developer diagnostics panels">
                {([
                    ["status", "Overview"],
                    ["transport", "Transport"],
                    ["audio", "Audio"],
                    ["channels", "Channels"],
                    ["gaze", "Face & Gaze"],
                    ["sdp", "SDP"],
                ] as const).map(([tabKey, label]) => (
                    <button
                        key={tabKey}
                        type="button"
                        className={`debugTab${activeTab === tabKey ? " is-active" : ""}`}
                        data-debug-tab={tabKey}
                        onClick={() => setActiveTab(tabKey)}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            <section className={`debugCard debugCard--status debugPanel${activeTab === "status" ? " is-active" : ""}`} data-debug-panel="status">
                <h3>Session Overview</h3>
                <p className="debugConsoleLead">接続が不安定な時は、まず ICE / Signaling / RTT を確認してください。ログや SDP はその後で十分です。</p>
                <div className="statusGrid">
                    <div className="statusItem">
                        <span className="statusLabel">ICE Gathering</span>
                        <span className={`statusValue ${stateClassName(snapshot.rtc.iceGatheringState)}`}>{snapshot.rtc.iceGatheringState}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">ICE Connection</span>
                        <span className={`statusValue ${stateClassName(snapshot.rtc.iceConnectionState)}`}>{snapshot.rtc.iceConnectionState}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">Signaling</span>
                        <span className={`statusValue ${stateClassName(snapshot.rtc.signalingState)}`}>{snapshot.rtc.signalingState}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">Round Trip Time</span>
                        <span className="statusValue">{snapshot.rtc.metrics.rtcRoundTripTime}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">Available Out Bitrate</span>
                        <span className="statusValue">{snapshot.rtc.metrics.rtcAvailableOutgoingBitrate}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">Selected Candidate</span>
                        <span className="statusValue">{snapshot.rtc.metrics.rtcCandidatePair}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">Transport Protocol</span>
                        <span className="statusValue">{snapshot.rtc.metrics.rtcTransportProtocol}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">Local Endpoint</span>
                        <span className="statusValue">{snapshot.rtc.metrics.rtcLocalCandidate}</span>
                    </div>
                    <div className="statusItem">
                        <span className="statusLabel">Remote Endpoint</span>
                        <span className="statusValue">{snapshot.rtc.metrics.rtcRemoteCandidate}</span>
                    </div>
                </div>
            </section>

            <section className={`debugCard debugCard--transport debugPanel${activeTab === "transport" ? " is-active" : ""}`} data-debug-panel="transport">
                <h3>WebRTC Transport</h3>
                <div className="metricGrid">
                    <div className="metricItem"><span className="metricLabel">Outbound Audio Bitrate</span><span className="metricValue">{snapshot.rtc.metrics.outboundAudioBitrate}</span></div>
                    <div className="metricItem"><span className="metricLabel">Inbound Audio Bitrate</span><span className="metricValue">{snapshot.rtc.metrics.inboundAudioBitrate}</span></div>
                    <div className="metricItem"><span className="metricLabel">Outbound Packets Sent</span><span className="metricValue">{snapshot.rtc.metrics.outboundPacketsSent}</span></div>
                    <div className="metricItem"><span className="metricLabel">Inbound Packets Lost</span><span className="metricValue">{snapshot.rtc.metrics.inboundPacketsLost}</span></div>
                    <div className="metricItem"><span className="metricLabel">Inbound Packet Loss</span><span className="metricValue">{snapshot.rtc.metrics.inboundPacketLossRate}</span></div>
                    <div className="metricItem"><span className="metricLabel">Inbound Jitter</span><span className="metricValue">{snapshot.rtc.metrics.inboundJitter}</span></div>
                </div>
                <div className="trendGrid">
                    <article className="trendCard">
                        <h4>Outbound Bitrate (60s / max 256 kbps)</h4>
                        <svg id="trendOutboundAudioBitrate" className="trendGraph" viewBox="0 0 300 86" preserveAspectRatio="none">
                            <polyline className="trendLine" points={renderTrendGraph(snapshot, "trendOutboundAudioBitrate")} />
                        </svg>
                    </article>
                    <article className="trendCard">
                        <h4>Inbound Bitrate (60s / max 256 kbps)</h4>
                        <svg id="trendInboundAudioBitrate" className="trendGraph" viewBox="0 0 300 86" preserveAspectRatio="none">
                            <polyline className="trendLine" points={renderTrendGraph(snapshot, "trendInboundAudioBitrate")} />
                        </svg>
                    </article>
                    <article className="trendCard">
                        <h4>RTT (60s / max 200 ms)</h4>
                        <svg id="trendRoundTripTime" className="trendGraph" viewBox="0 0 300 86" preserveAspectRatio="none">
                            <polyline className="trendLine" points={renderTrendGraph(snapshot, "trendRoundTripTime")} />
                        </svg>
                    </article>
                    <article className="trendCard">
                        <h4>Inbound Loss Rate (60s / max 5%)</h4>
                        <svg id="trendInboundPacketLossRate" className="trendGraph" viewBox="0 0 300 86" preserveAspectRatio="none">
                            <polyline className="trendLine" points={renderTrendGraph(snapshot, "trendInboundPacketLossRate")} />
                        </svg>
                    </article>
                </div>
            </section>

            <section className={`debugCard debugCard--audio debugPanel${activeTab === "audio" ? " is-active" : ""}`} data-debug-panel="audio">
                <h3>Audio Monitor (Frontend)</h3>
                <div className="audioMeterGrid">
                    <div className="audioMeterPanel">
                        <div className="audioMeterHeader">
                            <span>Local Mic</span>
                            <span>{meterPercent(snapshot.audio.localLevel)}</span>
                        </div>
                        <div className="audioMeterTrack">
                            <div id="localAudioLevelMeter" className="audioMeterFill" style={{ width: `${Math.max(0, Math.min(1, snapshot.audio.localLevel)) * 100}%` }}></div>
                        </div>
                        <dl className="audioMetricTable">
                            <dt>VAD</dt>
                            <dd>{snapshot.audio.localVadIsSpeech ? "Speech" : "Silence"}</dd>
                            <dt>Engine</dt>
                            <dd>{localVadEngineLabel(snapshot)}</dd>
                            <dt>Prob</dt>
                            <dd>{vadProbabilityLabel(snapshot.audio.learnedVadReport.probability)}</dd>
                            <dt>Model</dt>
                            <dd title={snapshot.audio.learnedVadReport.message ?? ""}>{snapshot.audio.learnedVadReport.status}</dd>
                            <dt>Frames</dt>
                            <dd>{learnedVadFramesLabel(snapshot)}</dd>
                            <dt>RMS</dt>
                            <dd>{metricPercent(snapshot.audio.localRms)}</dd>
                            <dt>Peak</dt>
                            <dd>{metricPercent(snapshot.audio.localPeak)}</dd>
                        </dl>
                        <p className={`audioWarning${snapshot.audio.localWarningState === "ok" ? "" : ` ${snapshot.audio.localWarningState}`}`}>{snapshot.audio.localWarningText}</p>
                        <p className={`audioConstraintStatus ${snapshot.audio.constraintStatus.tone}`.trim()} title={snapshot.audio.constraintStatus.title}>
                            {snapshot.audio.constraintStatus.text}
                        </p>
                    </div>
                    <div className="audioMeterPanel">
                        <div className="audioMeterHeader">
                            <span>Remote RTC</span>
                            <span>{meterPercent(snapshot.audio.remoteLevel)}</span>
                        </div>
                        <div className="audioMeterTrack">
                            <div id="remoteAudioLevelMeter" className="audioMeterFill" style={{ width: `${Math.max(0, Math.min(1, snapshot.audio.remoteLevel)) * 100}%` }}></div>
                        </div>
                    </div>
                    <div className="audioMeterPanel audioMeterPanel--controls">
                        <details className="audioInlineDetails audioInlineDetails--controls">
                            <summary>高度な調整</summary>
                            <p className="debugInlineLead">通常はメーター確認だけで十分です。入力の切り分けや騒音環境の調整が必要な時だけ開いてください。</p>
                            <div className="audioControlGroup">
                                <label className="audioControlLabel" htmlFor="localAudioHighpassCutoff">
                                    HPF Cutoff
                                    <span>{Math.round(snapshot.audio.filterConfig.highpassHz)}Hz</span>
                                </label>
                                <input
                                    id="localAudioHighpassCutoff"
                                    className="audioControlRange"
                                    type="range"
                                    min="60"
                                    max="300"
                                    step="5"
                                    value={snapshot.audio.filterConfig.highpassHz}
                                    onChange={(event) => manager.applyLocalAudioFilterConfig({
                                        ...snapshot.audio.filterConfig,
                                        highpassHz: Number.parseFloat(event.currentTarget.value),
                                    })}
                                />
                            </div>
                            <div className="audioControlGroup">
                                <label className="audioControlCheckLabel" htmlFor="localAudioLowpassEnabled">
                                    <input
                                        id="localAudioLowpassEnabled"
                                        type="checkbox"
                                        checked={snapshot.audio.filterConfig.lowpassEnabled}
                                        onChange={(event) => manager.applyLocalAudioFilterConfig({
                                            ...snapshot.audio.filterConfig,
                                            lowpassEnabled: event.currentTarget.checked,
                                        })}
                                    />
                                    LPFを有効化
                                </label>
                                <label className="audioControlLabel" htmlFor="localAudioLowpassCutoff">
                                    LPF Cutoff
                                    <span>{Math.round(snapshot.audio.filterConfig.lowpassHz)}Hz</span>
                                </label>
                                <input
                                    id="localAudioLowpassCutoff"
                                    className="audioControlRange"
                                    type="range"
                                    min="2500"
                                    max="10000"
                                    step="100"
                                    value={snapshot.audio.filterConfig.lowpassHz}
                                    onChange={(event) => manager.applyLocalAudioFilterConfig({
                                        ...snapshot.audio.filterConfig,
                                        lowpassHz: Number.parseFloat(event.currentTarget.value),
                                    })}
                                />
                            </div>
                            <div className="audioControlGroup">
                                <label className="audioControlCheckLabel" htmlFor="localVadLearnedEnabled">
                                    <input
                                        id="localVadLearnedEnabled"
                                        type="checkbox"
                                        checked={snapshot.audio.vadThresholdMode === "learned"}
                                        onChange={(event) => manager.applyLocalVadThresholdMode(
                                            event.currentTarget.checked
                                                ? "learned"
                                                : (snapshot.audio.vadThresholdMode === "auto" ? "auto" : "manual"),
                                        )}
                                    />
                                    学習VAD（Silero）を有効化
                                </label>
                                <details className="audioInlineDetails">
                                    <summary>学習VADチューニング</summary>
                                    <div className="audioControlGroup">
                                        <label className="audioControlLabel" htmlFor="localVadLearnedPerformanceMode">
                                            Preset
                                            <span>負荷/精度</span>
                                        </label>
                                        <select
                                            id="localVadLearnedPerformanceMode"
                                            className="audioControlSelect"
                                            value={snapshot.audio.learnedVadPerformanceMode}
                                            onChange={(event) => manager.applyLocalLearnedVadPerformanceMode(event.currentTarget.value as "low_cpu" | "balanced" | "high_accuracy")}
                                        >
                                            <option value="balanced">標準</option>
                                            <option value="low_cpu">低負荷</option>
                                            <option value="high_accuracy">高精度</option>
                                        </select>
                                    </div>
                                    <div className="audioControlGroup">
                                        <label className="audioControlLabel" htmlFor="localVadLearnedOnThreshold">
                                            ON Threshold
                                            <span>{snapshot.audio.learnedVadTuning.onThreshold.toFixed(4)}</span>
                                        </label>
                                        <input
                                            id="localVadLearnedOnThreshold"
                                            className="audioControlRange"
                                            type="range"
                                            min="0.0001"
                                            max="0.1000"
                                            step="0.0001"
                                            value={snapshot.audio.learnedVadTuning.onThreshold}
                                            disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                            onChange={(event) => updateLearnedVadTuning(snapshot, {
                                                onThreshold: Number.parseFloat(event.currentTarget.value),
                                            })}
                                        />
                                    </div>
                                    <div className="audioControlGroup">
                                        <label className="audioControlLabel" htmlFor="localVadLearnedOffThreshold">
                                            OFF Threshold
                                            <span>{snapshot.audio.learnedVadTuning.offThreshold.toFixed(4)}</span>
                                        </label>
                                        <input
                                            id="localVadLearnedOffThreshold"
                                            className="audioControlRange"
                                            type="range"
                                            min="0.00005"
                                            max="0.0900"
                                            step="0.00005"
                                            value={snapshot.audio.learnedVadTuning.offThreshold}
                                            disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                            onChange={(event) => updateLearnedVadTuning(snapshot, {
                                                offThreshold: Number.parseFloat(event.currentTarget.value),
                                            })}
                                        />
                                    </div>
                                    <div className="audioControlGroup">
                                        <label className="audioControlLabel" htmlFor="localVadLearnedHangoverMs">
                                            Hangover
                                            <span>{Math.round(snapshot.audio.learnedVadTuning.hangoverMs)}ms</span>
                                        </label>
                                        <input
                                            id="localVadLearnedHangoverMs"
                                            className="audioControlRange"
                                            type="range"
                                            min="0"
                                            max="1200"
                                            step="10"
                                            value={snapshot.audio.learnedVadTuning.hangoverMs}
                                            disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                            onChange={(event) => updateLearnedVadTuning(snapshot, {
                                                hangoverMs: Number.parseFloat(event.currentTarget.value),
                                            })}
                                        />
                                    </div>
                                    <div className="audioControlGroup">
                                        <label className="audioControlLabel" htmlFor="localVadLearnedInferIntervalMs">
                                            Infer Interval
                                            <span>{Math.round(snapshot.audio.learnedVadTuning.minInferIntervalMs)}ms</span>
                                        </label>
                                        <input
                                            id="localVadLearnedInferIntervalMs"
                                            className="audioControlRange"
                                            type="range"
                                            min="20"
                                            max="400"
                                            step="10"
                                            value={snapshot.audio.learnedVadTuning.minInferIntervalMs}
                                            disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                            onChange={(event) => updateLearnedVadTuning(snapshot, {
                                                minInferIntervalMs: Number.parseFloat(event.currentTarget.value),
                                            })}
                                        />
                                    </div>
                                </details>
                                <label className="audioControlCheckLabel" htmlFor="localVadLearnedStrictMode">
                                    <input
                                        id="localVadLearnedStrictMode"
                                        type="checkbox"
                                        checked={snapshot.audio.learnedVadStrictMode}
                                        disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                        onChange={(event) => manager.applyLocalLearnedVadStrictMode(event.currentTarget.checked)}
                                    />
                                    厳格判定（Learned + RMS）
                                </label>
                                <label className="audioControlCheckLabel" htmlFor="localVadThresholdAutoEnabled">
                                    <input
                                        id="localVadThresholdAutoEnabled"
                                        type="checkbox"
                                        checked={snapshot.audio.vadThresholdMode === "auto"}
                                        disabled={snapshot.audio.vadThresholdMode === "learned"}
                                        onChange={(event) => manager.applyLocalVadThresholdMode(event.currentTarget.checked ? "auto" : "manual")}
                                    />
                                    VAD閾値を自動追従（ノイズフロア）
                                </label>
                                <label className="audioControlLabel" htmlFor="localVadRmsThreshold">
                                    VAD RMS Threshold
                                    <span>{(snapshot.audio.vadRmsThreshold * 100).toFixed(1)}%</span>
                                </label>
                                <input
                                    id="localVadRmsThreshold"
                                    className="audioControlRange"
                                    type="range"
                                    min="0.005"
                                    max="0.20"
                                    step="0.001"
                                    value={snapshot.audio.vadRmsThreshold}
                                    disabled={snapshot.audio.vadThresholdMode !== "manual"}
                                    onChange={(event) => manager.applyLocalVadRmsThreshold(Number.parseFloat(event.currentTarget.value))}
                                />
                                <div className="audioPresetButtons" role="group" aria-label="VAD RMS Presets">
                                    {[0.015, 0.05, 0.1].map((preset, index) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            className="audioPresetButton"
                                            disabled={snapshot.audio.vadThresholdMode !== "manual"}
                                            onClick={() => manager.applyLocalVadRmsThreshold(preset)}
                                        >
                                            {index === 0 ? "標準" : index === 1 ? "騒音環境" : "超騒音環境"}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </details>
                    </div>
                </div>
                <audio id="rtcAudio" autoPlay={true}></audio>
            </section>

            <section className={`debugCard debugCard--channels debugPanel${activeTab === "channels" ? " is-active" : ""}`} data-debug-panel="channels">
                <h3>Data Channel Events</h3>
                <div className="channelGrid">
                    <article><h4>text_ch</h4><pre id="textChannel">{snapshot.rtc.textChannelLog}</pre></article>
                    <article><h4>telop_ch</h4><pre id="telopChannel">{snapshot.rtc.telopChannelLog}</pre></article>
                    <article><h4>RTC Event Timeline</h4><pre id="rtcEventLog">{snapshot.rtc.rtcEventLog}</pre></article>
                </div>
            </section>

            <section className={`debugCard debugCard--gaze debugPanel${activeTab === "gaze" ? " is-active" : ""}`} data-debug-panel="gaze">
                <h3>Face &amp; Gaze</h3>
                <div id="characterGaze">
                    <video id="characterGazeVideo" autoPlay={true} playsInline={true}></video>
                    <svg id="characterGazeMarker" viewBox="0 0 320 240" version="1.1" xmlns="http://www.w3.org/2000/svg">
                        <circle id="eyeTarget" cx="50%" cy="50%" r="5" fill="hsl(300 100% 50% / 50%)" />
                    </svg>
                </div>
                <dl className="gazeTable">
                    <dt>Status</dt>
                    <dd>{snapshot.gaze.status}</dd>
                    <dt>X</dt>
                    <dd>{snapshot.gaze.faceX}</dd>
                    <dt>Y</dt>
                    <dd>{snapshot.gaze.faceY}</dd>
                    <dt>Facing</dt>
                    <dd>{snapshot.gaze.facing}</dd>
                    <dt>Target</dt>
                    <dd>{snapshot.gaze.targetDebug}</dd>
                </dl>
                <details className="audioInlineDetails">
                    <summary>高度な調整 (Gaze Tuning)</summary>
                    <p className="debugInlineLead">視線追従が不安定な時だけ調整してください。通常運用では既定値のままで構いません。</p>
                    <div className="audioControlGroup">
                        <div className="audioControlPresetButtons">
                            {(["stable", "balanced", "responsive"] as CharacterGazeTrackingTuningPresetKey[]).map((presetKey) => (
                                <button
                                    key={presetKey}
                                    type="button"
                                    data-gaze-tuning-preset={presetKey}
                                    onClick={() => manager.applyCharacterGazeTrackingTuning(CHARACTER_GAZE_TRACKING_TUNING_PRESETS[presetKey])}
                                >
                                    {presetKey === "stable" ? "安定重視" : presetKey === "balanced" ? "バランス" : "追従重視"}
                                </button>
                            ))}
                        </div>
                        <label className="audioControlLabel">
                            Hold(ms)
                            <input
                                id="gazeHoldMs"
                                className="audioControlRange"
                                type="range"
                                min="0"
                                max="2000"
                                step="50"
                                value={snapshot.gaze.tuning.minimumHoldMs}
                                onChange={(event) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    minimumHoldMs: Number.parseFloat(event.currentTarget.value),
                                })}
                            />
                            <span>{Math.round(snapshot.gaze.tuning.minimumHoldMs)}ms</span>
                        </label>
                        <label className="audioControlLabel">
                            Switch Margin
                            <input
                                id="gazeSwitchMargin"
                                className="audioControlRange"
                                type="range"
                                min="0"
                                max="0.5"
                                step="0.01"
                                value={snapshot.gaze.tuning.switchMargin}
                                onChange={(event) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    switchMargin: Number.parseFloat(event.currentTarget.value),
                                })}
                            />
                            <span>{snapshot.gaze.tuning.switchMargin.toFixed(2)}</span>
                        </label>
                        <label className="audioControlLabel">
                            Relink Dist
                            <input
                                id="gazeRelinkDistance"
                                className="audioControlRange"
                                type="range"
                                min="0.05"
                                max="0.5"
                                step="0.01"
                                value={snapshot.gaze.tuning.relinkDistance}
                                onChange={(event) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    relinkDistance: Number.parseFloat(event.currentTarget.value),
                                })}
                            />
                            <span>{snapshot.gaze.tuning.relinkDistance.toFixed(2)}</span>
                        </label>
                        <label className="audioControlLabel">
                            OneEuro Min
                            <input
                                id="gazeOneEuroMinCutoff"
                                className="audioControlRange"
                                type="range"
                                min="0.1"
                                max="4"
                                step="0.1"
                                value={snapshot.gaze.tuning.oneEuroMinCutoff}
                                onChange={(event) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    oneEuroMinCutoff: Number.parseFloat(event.currentTarget.value),
                                })}
                            />
                            <span>{snapshot.gaze.tuning.oneEuroMinCutoff.toFixed(2)}</span>
                        </label>
                        <label className="audioControlLabel">
                            OneEuro Beta
                            <input
                                id="gazeOneEuroBeta"
                                className="audioControlRange"
                                type="range"
                                min="0"
                                max="0.2"
                                step="0.005"
                                value={snapshot.gaze.tuning.oneEuroBeta}
                                onChange={(event) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    oneEuroBeta: Number.parseFloat(event.currentTarget.value),
                                })}
                            />
                            <span>{snapshot.gaze.tuning.oneEuroBeta.toFixed(3)}</span>
                        </label>
                        <label className="audioControlLabel">
                            Deadband
                            <input
                                id="gazeDeadband"
                                className="audioControlRange"
                                type="range"
                                min="0"
                                max="0.02"
                                step="0.0005"
                                value={snapshot.gaze.tuning.deadband}
                                onChange={(event) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    deadband: Number.parseFloat(event.currentTarget.value),
                                })}
                            />
                            <span>{snapshot.gaze.tuning.deadband.toFixed(4)}</span>
                        </label>
                    </div>
                </details>
            </section>

            <section className={`debugCard debugCard--sdp debugPanel${activeTab === "sdp" ? " is-active" : ""}`} data-debug-panel="sdp">
                <h3>SDP Details</h3>
                <div className="sdpGrid">
                    <article><h4>Offer</h4><pre id="offerSDP">{snapshot.rtc.offerSdp}</pre></article>
                    <article><h4>Answer</h4><pre id="answerSDP">{snapshot.rtc.answerSdp}</pre></article>
                </div>
            </section>
        </div>
    );
}
