import type {
    DebugConsoleManager,
    DebugConsoleSnapshot,
    LearnedVadTuningUiConfig,
} from "../../model/debugConsoleManager";
import { RangeControl } from "../components/rangeControl";
import { AudioPanelLearnedVadTuning } from "./audioPanelLearnedVadTuning";

const VAD_RMS_PRESETS = [
    { value: 0.015, label: "標準" },
    { value: 0.05, label: "騒音環境" },
    { value: 0.1, label: "超騒音環境" },
];

type AudioPanelVadControlsProps = {
    audio: DebugConsoleSnapshot["audio"];
    manager: DebugConsoleManager;
};

export function AudioPanelVadControls({ audio, manager }: AudioPanelVadControlsProps) {
    const updateLearnedVadTuning = (patch: Partial<LearnedVadTuningUiConfig>): void => {
        manager.applyLocalLearnedVadTuning({
            ...audio.learnedVadTuning,
            ...patch,
        });
    };

    return (
        <div className="audioControlGroup">
            <LearnedVadEnabledControl audio={audio} manager={manager} />
            <AudioPanelLearnedVadTuning
                audio={audio}
                manager={manager}
                onTuningChange={updateLearnedVadTuning}
            />
            <LearnedVadStrictControl audio={audio} manager={manager} />
            <VadAutoThresholdControl audio={audio} manager={manager} />
            <VadRmsThresholdControls audio={audio} manager={manager} />
        </div>
    );
}

type AudioPanelVadControlChildProps = {
    audio: DebugConsoleSnapshot["audio"];
    manager: DebugConsoleManager;
};

function LearnedVadEnabledControl({ audio, manager }: AudioPanelVadControlChildProps) {
    return (
        <label className="audioControlCheckLabel" htmlFor="localVadLearnedEnabled">
            <input
                id="localVadLearnedEnabled"
                type="checkbox"
                checked={audio.vadThresholdMode === "learned"}
                onChange={(event) =>
                    manager.applyLocalVadThresholdMode(
                        event.currentTarget.checked
                            ? "learned"
                            : audio.vadThresholdMode === "auto"
                              ? "auto"
                              : "manual",
                    )
                }
            />
            学習VAD（Silero）を有効化
        </label>
    );
}

function LearnedVadStrictControl({ audio, manager }: AudioPanelVadControlChildProps) {
    return (
        <label className="audioControlCheckLabel" htmlFor="localVadLearnedStrictMode">
            <input
                id="localVadLearnedStrictMode"
                type="checkbox"
                checked={audio.learnedVadStrictMode}
                disabled={audio.vadThresholdMode !== "learned"}
                onChange={(event) =>
                    manager.applyLocalLearnedVadStrictMode(event.currentTarget.checked)
                }
            />
            厳格判定（Learned + RMS）
        </label>
    );
}

function VadAutoThresholdControl({ audio, manager }: AudioPanelVadControlChildProps) {
    return (
        <label className="audioControlCheckLabel" htmlFor="localVadThresholdAutoEnabled">
            <input
                id="localVadThresholdAutoEnabled"
                type="checkbox"
                checked={audio.vadThresholdMode === "auto"}
                disabled={audio.vadThresholdMode === "learned"}
                onChange={(event) =>
                    manager.applyLocalVadThresholdMode(
                        event.currentTarget.checked ? "auto" : "manual",
                    )
                }
            />
            VAD閾値を自動追従（ノイズフロア）
        </label>
    );
}

function VadRmsThresholdControls({ audio, manager }: AudioPanelVadControlChildProps) {
    return (
        <>
            <RangeControl
                id="localVadRmsThreshold"
                label="VAD RMS Threshold"
                valueLabel={`${(audio.vadRmsThreshold * 100).toFixed(1)}%`}
                min="0.005"
                max="0.20"
                step="0.001"
                value={audio.vadRmsThreshold}
                disabled={audio.vadThresholdMode !== "manual"}
                onChange={(value) => manager.applyLocalVadRmsThreshold(value)}
            />
            <fieldset className="audioPresetButtons">
                <legend className="audioPresetButtons__legend">VAD RMS Presets</legend>
                {VAD_RMS_PRESETS.map((preset) => (
                    <button
                        key={preset.value}
                        type="button"
                        className="audioPresetButton"
                        disabled={audio.vadThresholdMode !== "manual"}
                        onClick={() => manager.applyLocalVadRmsThreshold(preset.value)}
                    >
                        {preset.label}
                    </button>
                ))}
            </fieldset>
        </>
    );
}
