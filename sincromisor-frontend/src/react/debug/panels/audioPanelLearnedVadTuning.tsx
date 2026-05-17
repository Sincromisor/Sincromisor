import type {
    DebugConsoleManager,
    DebugConsoleSnapshot,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
} from "../../../ts/UI/DebugConsoleManager";
import { RangeControl } from "../components/RangeControl";

type AudioPanelLearnedVadTuningProps = {
    audio: DebugConsoleSnapshot["audio"];
    manager: DebugConsoleManager;
    onTuningChange: (patch: Partial<LearnedVadTuningUiConfig>) => void;
};

export function AudioPanelLearnedVadTuning({
    audio,
    manager,
    onTuningChange,
}: AudioPanelLearnedVadTuningProps) {
    return (
        <details className="audioInlineDetails">
            <summary>学習VADチューニング</summary>
            <LearnedVadPerformanceModeSelect audio={audio} manager={manager} />
            <LearnedVadThresholdControls audio={audio} onTuningChange={onTuningChange} />
        </details>
    );
}

type LearnedVadPerformanceModeSelectProps = {
    audio: DebugConsoleSnapshot["audio"];
    manager: DebugConsoleManager;
};

function LearnedVadPerformanceModeSelect({ audio, manager }: LearnedVadPerformanceModeSelectProps) {
    return (
        <div className="audioControlGroup">
            <label className="audioControlLabel" htmlFor="localVadLearnedPerformanceMode">
                Preset
                <span>負荷/精度</span>
            </label>
            <select
                id="localVadLearnedPerformanceMode"
                className="audioControlSelect"
                value={audio.learnedVadPerformanceMode}
                onChange={(event) =>
                    manager.applyLocalLearnedVadPerformanceMode(
                        parseLearnedVadPerformanceMode(event.currentTarget.value),
                    )
                }
            >
                <option value="balanced">標準</option>
                <option value="low_cpu">低負荷</option>
                <option value="high_accuracy">高精度</option>
            </select>
        </div>
    );
}

type LearnedVadThresholdControlsProps = {
    audio: DebugConsoleSnapshot["audio"];
    onTuningChange: (patch: Partial<LearnedVadTuningUiConfig>) => void;
};

function LearnedVadThresholdControls({ audio, onTuningChange }: LearnedVadThresholdControlsProps) {
    return (
        <>
            <RangeControl
                id="localVadLearnedOnThreshold"
                label="ON Threshold"
                valueLabel={audio.learnedVadTuning.onThreshold.toFixed(4)}
                min="0.0001"
                max="0.1000"
                step="0.0001"
                value={audio.learnedVadTuning.onThreshold}
                disabled={audio.vadThresholdMode !== "learned"}
                onChange={(value) => onTuningChange({ onThreshold: value })}
            />
            <RangeControl
                id="localVadLearnedOffThreshold"
                label="OFF Threshold"
                valueLabel={audio.learnedVadTuning.offThreshold.toFixed(4)}
                min="0.00005"
                max="0.0900"
                step="0.00005"
                value={audio.learnedVadTuning.offThreshold}
                disabled={audio.vadThresholdMode !== "learned"}
                onChange={(value) => onTuningChange({ offThreshold: value })}
            />
            <RangeControl
                id="localVadLearnedHangoverMs"
                label="Hangover"
                valueLabel={`${Math.round(audio.learnedVadTuning.hangoverMs)}ms`}
                min="0"
                max="1200"
                step="10"
                value={audio.learnedVadTuning.hangoverMs}
                disabled={audio.vadThresholdMode !== "learned"}
                onChange={(value) => onTuningChange({ hangoverMs: value })}
            />
            <RangeControl
                id="localVadLearnedInferIntervalMs"
                label="Infer Interval"
                valueLabel={`${Math.round(audio.learnedVadTuning.minInferIntervalMs)}ms`}
                min="20"
                max="400"
                step="10"
                value={audio.learnedVadTuning.minInferIntervalMs}
                disabled={audio.vadThresholdMode !== "learned"}
                onChange={(value) => onTuningChange({ minInferIntervalMs: value })}
            />
        </>
    );
}

function parseLearnedVadPerformanceMode(value: string): LearnedVadPerformanceMode {
    switch (value) {
        case "low_cpu":
        case "balanced":
        case "high_accuracy":
            return value;
        default:
            return "balanced";
    }
}
