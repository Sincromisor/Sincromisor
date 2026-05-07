import {
    CHARACTER_GAZE_TRACKING_TUNING_PRESETS,
    DebugConsoleManager,
    type CharacterGazeTrackingTuningPresetKey,
    type DebugConsoleSnapshot,
} from "../../../ts/UI/DebugConsoleManager";
import { RangeControl } from "../components/RangeControl";
import { debugPanelClassName, type DebugPanelProps } from "../debugConsoleTypes";

type GazePanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
    manager: DebugConsoleManager;
};

export function GazePanel({ snapshot, manager, isActive }: GazePanelProps) {
    return (
        <section
            id="debug-console-panel-gaze"
            className={debugPanelClassName("debugCard debugCard--gaze", isActive)}
            data-debug-panel="gaze"
            role="tabpanel"
            aria-labelledby="debug-console-tab-gaze"
            hidden={!isActive}
        >
            <h3>Gaze</h3>
            <div className="gazePanelGrid">
                <div id="characterGaze">
                    <video id="characterGazeVideo" autoPlay={true} playsInline={true}></video>
                    <svg id="characterGazeMarker" viewBox="0 0 320 240" version="1.1" xmlns="http://www.w3.org/2000/svg">
                        <circle id="eyeTarget" cx="50%" cy="50%" r="5" fill="hsl(300 100% 50% / 50%)" />
                    </svg>
                </div>
                <div className="gazePanelDetails">
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
                        <summary>高度な調整</summary>
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
                            <RangeControl
                                id="gazeHoldMs"
                                label="Hold"
                                valueLabel={`${Math.round(snapshot.gaze.tuning.minimumHoldMs)}ms`}
                                min="0"
                                max="2000"
                                step="50"
                                value={snapshot.gaze.tuning.minimumHoldMs}
                                onChange={(value) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    minimumHoldMs: value,
                                })}
                            />
                            <RangeControl
                                id="gazeSwitchMargin"
                                label="Switch Margin"
                                valueLabel={snapshot.gaze.tuning.switchMargin.toFixed(2)}
                                min="0"
                                max="0.5"
                                step="0.01"
                                value={snapshot.gaze.tuning.switchMargin}
                                onChange={(value) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    switchMargin: value,
                                })}
                            />
                            <RangeControl
                                id="gazeRelinkDistance"
                                label="Relink Dist"
                                valueLabel={snapshot.gaze.tuning.relinkDistance.toFixed(2)}
                                min="0.05"
                                max="0.5"
                                step="0.01"
                                value={snapshot.gaze.tuning.relinkDistance}
                                onChange={(value) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    relinkDistance: value,
                                })}
                            />
                            <RangeControl
                                id="gazeOneEuroMinCutoff"
                                label="OneEuro Min"
                                valueLabel={snapshot.gaze.tuning.oneEuroMinCutoff.toFixed(2)}
                                min="0.1"
                                max="4"
                                step="0.1"
                                value={snapshot.gaze.tuning.oneEuroMinCutoff}
                                onChange={(value) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    oneEuroMinCutoff: value,
                                })}
                            />
                            <RangeControl
                                id="gazeOneEuroBeta"
                                label="OneEuro Beta"
                                valueLabel={snapshot.gaze.tuning.oneEuroBeta.toFixed(3)}
                                min="0"
                                max="0.2"
                                step="0.005"
                                value={snapshot.gaze.tuning.oneEuroBeta}
                                onChange={(value) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    oneEuroBeta: value,
                                })}
                            />
                            <RangeControl
                                id="gazeDeadband"
                                label="Deadband"
                                valueLabel={snapshot.gaze.tuning.deadband.toFixed(4)}
                                min="0"
                                max="0.02"
                                step="0.0005"
                                value={snapshot.gaze.tuning.deadband}
                                onChange={(value) => manager.applyCharacterGazeTrackingTuning({
                                    ...snapshot.gaze.tuning,
                                    deadband: value,
                                })}
                            />
                        </div>
                    </details>
                </div>
            </div>
        </section>
    );
}
