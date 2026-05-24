import type {
    DebugConsoleManager,
    DebugConsoleSnapshot,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
} from "../../model/debugConsoleManager";
import {
    type DebugRangeControlItem,
    DebugRangeControlList,
} from "../components/debugRangeControls";

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
    const disabled = audio.vadThresholdMode !== "learned";
    const ranges: DebugRangeControlItem[] = [
        {
            id: "localVadLearnedOnThreshold",
            label: "ON Threshold",
            valueLabel: audio.learnedVadTuning.onThreshold.toFixed(4),
            min: 0.0001,
            max: 0.1,
            step: 0.0001,
            value: audio.learnedVadTuning.onThreshold,
            disabled,
            onChange: (value) => onTuningChange({ onThreshold: value }),
        },
        {
            id: "localVadLearnedOffThreshold",
            label: "OFF Threshold",
            valueLabel: audio.learnedVadTuning.offThreshold.toFixed(4),
            min: 0.00005,
            max: 0.09,
            step: 0.00005,
            value: audio.learnedVadTuning.offThreshold,
            disabled,
            onChange: (value) => onTuningChange({ offThreshold: value }),
        },
        {
            id: "localVadLearnedHangoverMs",
            label: "Hangover",
            valueLabel: `${Math.round(audio.learnedVadTuning.hangoverMs)}ms`,
            min: 0,
            max: 1200,
            step: 10,
            value: audio.learnedVadTuning.hangoverMs,
            disabled,
            onChange: (value) => onTuningChange({ hangoverMs: value }),
        },
        {
            id: "localVadLearnedInferIntervalMs",
            label: "Infer Interval",
            valueLabel: `${Math.round(audio.learnedVadTuning.minInferIntervalMs)}ms`,
            min: 20,
            max: 400,
            step: 10,
            value: audio.learnedVadTuning.minInferIntervalMs,
            disabled,
            onChange: (value) => onTuningChange({ minInferIntervalMs: value }),
        },
    ];

    return <DebugRangeControlList items={ranges} />;
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
