import type {
    DebugConsoleManager,
    DebugConsoleSnapshot,
    LearnedVadTuningUiConfig,
} from "../../model/debugConsoleManager";
import { DebugCheckboxControl } from "../components/debugCheckboxControl";
import {
    DebugPresetButtonGroup,
    type DebugPresetButtonItem,
} from "../components/debugPresetButtonGroup";
import { DebugRangeControl } from "../components/debugRangeControls";
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
        <DebugCheckboxControl
            id="localVadLearnedEnabled"
            label="学習VAD（Silero）を有効化"
            checked={audio.vadThresholdMode === "learned"}
            onChange={(checked) =>
                manager.applyLocalVadThresholdMode(
                    checked ? "learned" : audio.vadThresholdMode === "auto" ? "auto" : "manual",
                )
            }
        />
    );
}

function LearnedVadStrictControl({ audio, manager }: AudioPanelVadControlChildProps) {
    return (
        <DebugCheckboxControl
            id="localVadLearnedStrictMode"
            label="厳格判定（Learned + RMS）"
            checked={audio.learnedVadStrictMode}
            disabled={audio.vadThresholdMode !== "learned"}
            onChange={(checked) => manager.applyLocalLearnedVadStrictMode(checked)}
        />
    );
}

function VadAutoThresholdControl({ audio, manager }: AudioPanelVadControlChildProps) {
    return (
        <DebugCheckboxControl
            id="localVadThresholdAutoEnabled"
            label="VAD閾値を自動追従（ノイズフロア）"
            checked={audio.vadThresholdMode === "auto"}
            disabled={audio.vadThresholdMode === "learned"}
            onChange={(checked) => manager.applyLocalVadThresholdMode(checked ? "auto" : "manual")}
        />
    );
}

function VadRmsThresholdControls({ audio, manager }: AudioPanelVadControlChildProps) {
    const presetItems: DebugPresetButtonItem[] = VAD_RMS_PRESETS.map((preset) => ({
        id: String(preset.value),
        label: preset.label,
        disabled: audio.vadThresholdMode !== "manual",
        onClick: () => manager.applyLocalVadRmsThreshold(preset.value),
    }));

    return (
        <>
            <DebugRangeControl
                id="localVadRmsThreshold"
                label="VAD RMS Threshold"
                valueLabel={`${(audio.vadRmsThreshold * 100).toFixed(1)}%`}
                min={0.005}
                max={0.2}
                step={0.001}
                value={audio.vadRmsThreshold}
                disabled={audio.vadThresholdMode !== "manual"}
                onChange={(value) => manager.applyLocalVadRmsThreshold(value)}
            />
            <DebugPresetButtonGroup
                items={presetItems}
                legend="VAD RMS Presets"
                buttonClassName="audioPresetButton"
            />
        </>
    );
}
