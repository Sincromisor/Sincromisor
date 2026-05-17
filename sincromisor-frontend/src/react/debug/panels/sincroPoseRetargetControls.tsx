import type { SincroPoseArmIkMode } from "../../../ts/SincroVRM/VRMCharacter/SincroPoseRetargeter";
import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { RangeControl } from "../components/RangeControl";
import { radToDeg } from "./sincroMotionPanelFormatters";

type SincroPoseRetargetControlsProps = {
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    manager: DebugConsoleManager;
};

export function SincroPoseRetargetControls({
    poseRetarget,
    manager,
}: SincroPoseRetargetControlsProps) {
    return (
        <details className="audioInlineDetails">
            <summary>Pose retarget 調整</summary>
            <div className="audioControlGroup">
                <label className="audioControlLabel" htmlFor="sincroPoseRetargetIkMode">
                    IK Mode
                    <span>solver</span>
                </label>
                <select
                    id="sincroPoseRetargetIkMode"
                    className="audioControlSelect"
                    value={poseRetarget.armIkMode}
                    onChange={(event) =>
                        manager.applySincroPoseRetargetConfig({
                            ...poseRetarget,
                            armIkMode: parseArmIkMode(event.currentTarget.value),
                        })
                    }
                >
                    <option value="world_3d_ik">world 3D IK</option>
                    <option value="screen_space_ik">screen-space IK</option>
                    <option value="feature_only">feature only</option>
                </select>
            </div>
            <RangeControl
                id="sincroPoseRetargetIntensity"
                label="Intensity"
                valueLabel={`${Math.round(poseRetarget.intensityScale * 100)}%`}
                min="0"
                max="1.2"
                step="0.05"
                value={poseRetarget.intensityScale}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        intensityScale: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetMinConfidence"
                label="Min Confidence"
                valueLabel={poseRetarget.minConfidence.toFixed(2)}
                min="0"
                max="1"
                step="0.05"
                value={poseRetarget.minConfidence}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        minConfidence: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetSmoothing"
                label="Smoothing"
                valueLabel={`${Math.round(poseRetarget.smoothingMs)}ms`}
                min="40"
                max="800"
                step="10"
                value={poseRetarget.smoothingMs}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        smoothingMs: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetNeutralReturn"
                label="Neutral Return"
                valueLabel={`${Math.round(poseRetarget.returnToNeutralMs)}ms`}
                min="80"
                max="2000"
                step="20"
                value={poseRetarget.returnToNeutralMs}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        returnToNeutralMs: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetIkStrength"
                label="IK Strength"
                valueLabel={`${Math.round(poseRetarget.armIkStrength * 100)}%`}
                min="0"
                max="1"
                step="0.05"
                value={poseRetarget.armIkStrength}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        armIkStrength: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetIkTargetScale"
                label="IK Target Scale"
                valueLabel={poseRetarget.armIkTargetScale.toFixed(2)}
                min="0.2"
                max="1.5"
                step="0.05"
                value={poseRetarget.armIkTargetScale}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        armIkTargetScale: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetIkMaxLift"
                label="Max Lift"
                valueLabel={`${Math.round(radToDeg(poseRetarget.armIkMaxLiftRad))}deg`}
                min="0"
                max={String(Math.PI / 2)}
                step="0.02"
                value={poseRetarget.armIkMaxLiftRad}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        armIkMaxLiftRad: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetIkMaxOpen"
                label="Max Open"
                valueLabel={`${Math.round(radToDeg(poseRetarget.armIkMaxOpenRad))}deg`}
                min="0"
                max={String(Math.PI / 2)}
                step="0.02"
                value={poseRetarget.armIkMaxOpenRad}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        armIkMaxOpenRad: value,
                    })
                }
            />
            <RangeControl
                id="sincroPoseRetargetIkMaxFlex"
                label="Max Flex"
                valueLabel={`${Math.round(radToDeg(poseRetarget.armIkMaxForearmFlexRad))}deg`}
                min="0"
                max={String(Math.PI / 2)}
                step="0.02"
                value={poseRetarget.armIkMaxForearmFlexRad}
                onChange={(value) =>
                    manager.applySincroPoseRetargetConfig({
                        ...poseRetarget,
                        armIkMaxForearmFlexRad: value,
                    })
                }
            />
        </details>
    );
}

function parseArmIkMode(value: string): SincroPoseArmIkMode {
    switch (value) {
        case "world_3d_ik":
        case "screen_space_ik":
        case "feature_only":
            return value;
        default:
            return "world_3d_ik";
    }
}
