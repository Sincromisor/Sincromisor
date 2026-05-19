import {
    CHARACTER_GAZE_TRACKING_TUNING_PRESETS,
    type CharacterGazeTrackingTuningPresetKey,
    type CharacterGazeTrackingTuningUiConfig,
    type DebugConsoleManager,
    type DebugConsoleSnapshot,
} from "../../../ts/ui/debugConsoleManager";
import { RangeControl } from "../components/rangeControl";

const GAZE_TUNING_PRESET_KEYS: CharacterGazeTrackingTuningPresetKey[] = [
    "stable",
    "balanced",
    "responsive",
];

type GazeTuningControlsProps = {
    gaze: DebugConsoleSnapshot["gaze"];
    manager: DebugConsoleManager;
};

export function GazeTuningControls({ gaze, manager }: GazeTuningControlsProps) {
    const applyPatch = (patch: Partial<CharacterGazeTrackingTuningUiConfig>): void => {
        manager.applyCharacterGazeTrackingTuning({
            ...gaze.tuning,
            ...patch,
        });
    };

    return (
        <details className="audioInlineDetails">
            <summary>高度な調整</summary>
            <div className="audioControlGroup">
                <GazeTuningPresetButtons manager={manager} />
                <GazeTimingControls gaze={gaze} onTuningChange={applyPatch} />
                <GazeFilterControls gaze={gaze} onTuningChange={applyPatch} />
            </div>
        </details>
    );
}

type GazeTuningPresetButtonsProps = {
    manager: DebugConsoleManager;
};

function GazeTuningPresetButtons({ manager }: GazeTuningPresetButtonsProps) {
    return (
        <div className="audioControlPresetButtons">
            {GAZE_TUNING_PRESET_KEYS.map((presetKey) => (
                <button
                    key={presetKey}
                    type="button"
                    data-gaze-tuning-preset={presetKey}
                    onClick={() =>
                        manager.applyCharacterGazeTrackingTuning(
                            CHARACTER_GAZE_TRACKING_TUNING_PRESETS[presetKey],
                        )
                    }
                >
                    {gazePresetLabel(presetKey)}
                </button>
            ))}
        </div>
    );
}

type GazeTuningRangeControlsProps = {
    gaze: DebugConsoleSnapshot["gaze"];
    onTuningChange: (patch: Partial<CharacterGazeTrackingTuningUiConfig>) => void;
};

function GazeTimingControls({ gaze, onTuningChange }: GazeTuningRangeControlsProps) {
    return (
        <>
            <RangeControl
                id="gazeHoldMs"
                label="Hold"
                valueLabel={`${Math.round(gaze.tuning.minimumHoldMs)}ms`}
                min="0"
                max="2000"
                step="50"
                value={gaze.tuning.minimumHoldMs}
                onChange={(value) => onTuningChange({ minimumHoldMs: value })}
            />
            <RangeControl
                id="gazeSwitchMargin"
                label="Switch Margin"
                valueLabel={gaze.tuning.switchMargin.toFixed(2)}
                min="0"
                max="0.5"
                step="0.01"
                value={gaze.tuning.switchMargin}
                onChange={(value) => onTuningChange({ switchMargin: value })}
            />
            <RangeControl
                id="gazeRelinkDistance"
                label="Relink Dist"
                valueLabel={gaze.tuning.relinkDistance.toFixed(2)}
                min="0.05"
                max="0.5"
                step="0.01"
                value={gaze.tuning.relinkDistance}
                onChange={(value) => onTuningChange({ relinkDistance: value })}
            />
        </>
    );
}

function GazeFilterControls({ gaze, onTuningChange }: GazeTuningRangeControlsProps) {
    return (
        <>
            <RangeControl
                id="gazeOneEuroMinCutoff"
                label="OneEuro Min"
                valueLabel={gaze.tuning.oneEuroMinCutoff.toFixed(2)}
                min="0.1"
                max="4"
                step="0.1"
                value={gaze.tuning.oneEuroMinCutoff}
                onChange={(value) => onTuningChange({ oneEuroMinCutoff: value })}
            />
            <RangeControl
                id="gazeOneEuroBeta"
                label="OneEuro Beta"
                valueLabel={gaze.tuning.oneEuroBeta.toFixed(3)}
                min="0"
                max="0.2"
                step="0.005"
                value={gaze.tuning.oneEuroBeta}
                onChange={(value) => onTuningChange({ oneEuroBeta: value })}
            />
            <RangeControl
                id="gazeDeadband"
                label="Deadband"
                valueLabel={gaze.tuning.deadband.toFixed(4)}
                min="0"
                max="0.02"
                step="0.0005"
                value={gaze.tuning.deadband}
                onChange={(value) => onTuningChange({ deadband: value })}
            />
        </>
    );
}

function gazePresetLabel(presetKey: CharacterGazeTrackingTuningPresetKey): string {
    switch (presetKey) {
        case "stable":
            return "安定重視";
        case "balanced":
            return "バランス";
        case "responsive":
            return "追従重視";
    }
}
