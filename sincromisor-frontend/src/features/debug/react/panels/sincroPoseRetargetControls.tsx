import type {
    ComposerArmApplicationMode,
    ComposerTorsoShoulderApplicationMode,
    SincroPoseArmIkMode,
} from "../../../../character/retargeting/sincroPoseRetargeter";
import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import {
    type DebugRangeControlItem,
    DebugRangeControlList,
} from "../components/debugRangeControls";
import { radToDeg } from "./sincroMotionPanelFormatters";

type SincroPoseRetargetControlsProps = {
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    manager: DebugConsoleManager;
};

type PoseRetargetConfig = DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];

export function SincroPoseRetargetControls({
    poseRetarget,
    manager,
}: SincroPoseRetargetControlsProps) {
    return (
        <details className="audioInlineDetails">
            <summary>Pose retarget 調整</summary>
            <ArmIkModeSelect poseRetarget={poseRetarget} manager={manager} />
            <ComposerArmApplicationSelect poseRetarget={poseRetarget} manager={manager} />
            <ComposerTorsoShoulderApplicationSelect poseRetarget={poseRetarget} manager={manager} />
            <PoseRetargetBaseControls poseRetarget={poseRetarget} manager={manager} />
            <PoseRetargetArmIkControls poseRetarget={poseRetarget} manager={manager} />
        </details>
    );
}

function ArmIkModeSelect({ poseRetarget, manager }: SincroPoseRetargetControlsProps) {
    return (
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
                    applyPoseRetargetPatch(manager, poseRetarget, {
                        armIkMode: parseArmIkMode(event.currentTarget.value),
                    })
                }
            >
                <option value="world_3d_ik">world 3D IK</option>
                <option value="screen_space_ik">screen-space IK</option>
                <option value="feature_only">feature only</option>
            </select>
        </div>
    );
}

function ComposerArmApplicationSelect({ poseRetarget, manager }: SincroPoseRetargetControlsProps) {
    return (
        <div className="audioControlGroup">
            <label className="audioControlLabel" htmlFor="sincroPoseComposerArmApplication">
                Composer Arm
                <span>experimental</span>
            </label>
            <select
                id="sincroPoseComposerArmApplication"
                className="audioControlSelect"
                value={poseRetarget.composerArmApplicationMode}
                onChange={(event) =>
                    applyPoseRetargetPatch(manager, poseRetarget, {
                        composerArmApplicationMode: parseComposerArmApplicationMode(
                            event.currentTarget.value,
                        ),
                    })
                }
            >
                <option value="off">off</option>
                <option value="left">left arm</option>
                <option value="right">right arm</option>
                <option value="both">both arms</option>
            </select>
        </div>
    );
}

function ComposerTorsoShoulderApplicationSelect({
    poseRetarget,
    manager,
}: SincroPoseRetargetControlsProps) {
    return (
        <div className="audioControlGroup">
            <label className="audioControlLabel" htmlFor="sincroPoseComposerTorsoShoulder">
                Composer Torso
                <span>experimental</span>
            </label>
            <select
                id="sincroPoseComposerTorsoShoulder"
                className="audioControlSelect"
                value={poseRetarget.composerTorsoShoulderApplicationMode}
                onChange={(event) =>
                    applyPoseRetargetPatch(manager, poseRetarget, {
                        composerTorsoShoulderApplicationMode:
                            parseComposerTorsoShoulderApplicationMode(event.currentTarget.value),
                    })
                }
            >
                <option value="direct">direct controller</option>
                <option value="composer">composer torso/shoulder</option>
            </select>
        </div>
    );
}

function PoseRetargetBaseControls({ poseRetarget, manager }: SincroPoseRetargetControlsProps) {
    const ranges: DebugRangeControlItem[] = [
        {
            id: "sincroPoseRetargetIntensity",
            label: "Intensity",
            valueLabel: `${Math.round(poseRetarget.intensityScale * 100)}%`,
            min: 0,
            max: 1.2,
            step: 0.05,
            value: poseRetarget.intensityScale,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { intensityScale: value }),
        },
        {
            id: "sincroPoseRetargetMinConfidence",
            label: "Min Confidence",
            valueLabel: poseRetarget.minConfidence.toFixed(2),
            min: 0,
            max: 1,
            step: 0.05,
            value: poseRetarget.minConfidence,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { minConfidence: value }),
        },
        {
            id: "sincroPoseRetargetSmoothing",
            label: "Smoothing",
            valueLabel: `${Math.round(poseRetarget.smoothingMs)}ms`,
            min: 40,
            max: 800,
            step: 10,
            value: poseRetarget.smoothingMs,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { smoothingMs: value }),
        },
        {
            id: "sincroPoseRetargetNeutralReturn",
            label: "Neutral Return",
            valueLabel: `${Math.round(poseRetarget.returnToNeutralMs)}ms`,
            min: 80,
            max: 2000,
            step: 20,
            value: poseRetarget.returnToNeutralMs,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { returnToNeutralMs: value }),
        },
    ];

    return <DebugRangeControlList items={ranges} />;
}

function PoseRetargetArmIkControls({ poseRetarget, manager }: SincroPoseRetargetControlsProps) {
    return (
        <>
            <PoseRetargetArmIkStrengthControls poseRetarget={poseRetarget} manager={manager} />
            <PoseRetargetArmIkAngleControls poseRetarget={poseRetarget} manager={manager} />
        </>
    );
}

function PoseRetargetArmIkStrengthControls({
    poseRetarget,
    manager,
}: SincroPoseRetargetControlsProps) {
    const ranges: DebugRangeControlItem[] = [
        {
            id: "sincroPoseRetargetIkStrength",
            label: "IK Strength",
            valueLabel: `${Math.round(poseRetarget.armIkStrength * 100)}%`,
            min: 0,
            max: 1,
            step: 0.05,
            value: poseRetarget.armIkStrength,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { armIkStrength: value }),
        },
        {
            id: "sincroPoseRetargetIkTargetScale",
            label: "IK Target Scale",
            valueLabel: poseRetarget.armIkTargetScale.toFixed(2),
            min: 0.2,
            max: 1.5,
            step: 0.05,
            value: poseRetarget.armIkTargetScale,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { armIkTargetScale: value }),
        },
    ];

    return <DebugRangeControlList items={ranges} />;
}

function PoseRetargetArmIkAngleControls({
    poseRetarget,
    manager,
}: SincroPoseRetargetControlsProps) {
    const ranges: DebugRangeControlItem[] = [
        {
            id: "sincroPoseRetargetIkMaxLift",
            label: "Max Lift",
            valueLabel: `${Math.round(radToDeg(poseRetarget.armIkMaxLiftRad))}deg`,
            min: 0,
            max: Math.PI / 2,
            step: 0.02,
            value: poseRetarget.armIkMaxLiftRad,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { armIkMaxLiftRad: value }),
        },
        {
            id: "sincroPoseRetargetIkMaxOpen",
            label: "Max Open",
            valueLabel: `${Math.round(radToDeg(poseRetarget.armIkMaxOpenRad))}deg`,
            min: 0,
            max: Math.PI / 2,
            step: 0.02,
            value: poseRetarget.armIkMaxOpenRad,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, { armIkMaxOpenRad: value }),
        },
        {
            id: "sincroPoseRetargetIkMaxFlex",
            label: "Max Flex",
            valueLabel: `${Math.round(radToDeg(poseRetarget.armIkMaxForearmFlexRad))}deg`,
            min: 0,
            max: Math.PI / 2,
            step: 0.02,
            value: poseRetarget.armIkMaxForearmFlexRad,
            onChange: (value) =>
                applyPoseRetargetPatch(manager, poseRetarget, {
                    armIkMaxForearmFlexRad: value,
                }),
        },
    ];

    return <DebugRangeControlList items={ranges} />;
}

function applyPoseRetargetPatch(
    manager: DebugConsoleManager,
    poseRetarget: PoseRetargetConfig,
    patch: Partial<PoseRetargetConfig>,
): void {
    manager.applySincroPoseRetargetConfig({
        ...poseRetarget,
        ...patch,
    });
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

function parseComposerArmApplicationMode(value: string): ComposerArmApplicationMode {
    switch (value) {
        case "off":
        case "left":
        case "right":
        case "both":
            return value;
        default:
            return "off";
    }
}

function parseComposerTorsoShoulderApplicationMode(
    value: string,
): ComposerTorsoShoulderApplicationMode {
    switch (value) {
        case "direct":
        case "composer":
            return value;
        default:
            return "direct";
    }
}
