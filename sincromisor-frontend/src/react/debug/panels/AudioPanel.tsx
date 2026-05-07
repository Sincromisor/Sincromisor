import type { DebugConsoleSnapshot, LearnedVadTuningUiConfig } from "../../../ts/UI/DebugConsoleManager";
import { DebugConsoleManager } from "../../../ts/UI/DebugConsoleManager";
import { AudioMeter } from "../components/AudioMeter";
import { RangeControl } from "../components/RangeControl";
import {
    learnedVadFramesLabel,
    localVadEngineLabel,
    metricPercent,
    vadProbabilityLabel,
} from "../components/debugConsoleFormatters";
import { debugPanelClassName, type DebugPanelProps } from "../debugConsoleTypes";

type AudioPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
    manager: DebugConsoleManager;
};

function updateLearnedVadTuning(
    snapshot: DebugConsoleSnapshot,
    manager: DebugConsoleManager,
    patch: Partial<LearnedVadTuningUiConfig>,
): void {
    manager.applyLocalLearnedVadTuning({
        ...snapshot.audio.learnedVadTuning,
        ...patch,
    });
}

export function AudioPanel({ snapshot, manager, isActive }: AudioPanelProps) {
    return (
        <section
            id="debug-console-panel-audio"
            className={debugPanelClassName("debugCard debugCard--audio", isActive)}
            data-debug-panel="audio"
            role="tabpanel"
            aria-labelledby="debug-console-tab-audio"
            hidden={!isActive}
        >
            <h3>Audio</h3>
            <div className="audioMeterGrid">
                <AudioMeter id="localAudioLevelMeter" label="Local Mic" level={snapshot.audio.localLevel}>
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
                </AudioMeter>
                <AudioMeter id="remoteAudioLevelMeter" label="Remote RTC" level={snapshot.audio.remoteLevel} />
                <div className="audioMeterPanel audioMeterPanel--controls">
                    <details className="audioInlineDetails audioInlineDetails--controls">
                        <summary>高度な調整</summary>
                        <RangeControl
                            id="localAudioHighpassCutoff"
                            label="HPF Cutoff"
                            valueLabel={`${Math.round(snapshot.audio.filterConfig.highpassHz)}Hz`}
                            min="60"
                            max="300"
                            step="5"
                            value={snapshot.audio.filterConfig.highpassHz}
                            onChange={(value) => manager.applyLocalAudioFilterConfig({
                                ...snapshot.audio.filterConfig,
                                highpassHz: value,
                            })}
                        />
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
                        </div>
                        <RangeControl
                            id="localAudioLowpassCutoff"
                            label="LPF Cutoff"
                            valueLabel={`${Math.round(snapshot.audio.filterConfig.lowpassHz)}Hz`}
                            min="2500"
                            max="10000"
                            step="100"
                            value={snapshot.audio.filterConfig.lowpassHz}
                            onChange={(value) => manager.applyLocalAudioFilterConfig({
                                ...snapshot.audio.filterConfig,
                                lowpassHz: value,
                            })}
                        />
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
                                <RangeControl
                                    id="localVadLearnedOnThreshold"
                                    label="ON Threshold"
                                    valueLabel={snapshot.audio.learnedVadTuning.onThreshold.toFixed(4)}
                                    min="0.0001"
                                    max="0.1000"
                                    step="0.0001"
                                    value={snapshot.audio.learnedVadTuning.onThreshold}
                                    disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                    onChange={(value) => updateLearnedVadTuning(snapshot, manager, { onThreshold: value })}
                                />
                                <RangeControl
                                    id="localVadLearnedOffThreshold"
                                    label="OFF Threshold"
                                    valueLabel={snapshot.audio.learnedVadTuning.offThreshold.toFixed(4)}
                                    min="0.00005"
                                    max="0.0900"
                                    step="0.00005"
                                    value={snapshot.audio.learnedVadTuning.offThreshold}
                                    disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                    onChange={(value) => updateLearnedVadTuning(snapshot, manager, { offThreshold: value })}
                                />
                                <RangeControl
                                    id="localVadLearnedHangoverMs"
                                    label="Hangover"
                                    valueLabel={`${Math.round(snapshot.audio.learnedVadTuning.hangoverMs)}ms`}
                                    min="0"
                                    max="1200"
                                    step="10"
                                    value={snapshot.audio.learnedVadTuning.hangoverMs}
                                    disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                    onChange={(value) => updateLearnedVadTuning(snapshot, manager, { hangoverMs: value })}
                                />
                                <RangeControl
                                    id="localVadLearnedInferIntervalMs"
                                    label="Infer Interval"
                                    valueLabel={`${Math.round(snapshot.audio.learnedVadTuning.minInferIntervalMs)}ms`}
                                    min="20"
                                    max="400"
                                    step="10"
                                    value={snapshot.audio.learnedVadTuning.minInferIntervalMs}
                                    disabled={snapshot.audio.vadThresholdMode !== "learned"}
                                    onChange={(value) => updateLearnedVadTuning(snapshot, manager, { minInferIntervalMs: value })}
                                />
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
                            <RangeControl
                                id="localVadRmsThreshold"
                                label="VAD RMS Threshold"
                                valueLabel={`${(snapshot.audio.vadRmsThreshold * 100).toFixed(1)}%`}
                                min="0.005"
                                max="0.20"
                                step="0.001"
                                value={snapshot.audio.vadRmsThreshold}
                                disabled={snapshot.audio.vadThresholdMode !== "manual"}
                                onChange={(value) => manager.applyLocalVadRmsThreshold(value)}
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
    );
}
