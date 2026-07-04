import type {
    ComposerArmApplicationMode,
    ComposerSemanticFingerApplicationMode,
    ComposerTorsoShoulderApplicationMode,
    FullNormalizedPoseApplicationMode,
} from "../../../../character/retargeting/sincroPoseRetargeter";
import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";

type SincroPoseRetargetComposerControlsProps = {
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    manager: DebugConsoleManager;
};

/**
 * Pose retarget の composer application rollback flag 群を developer panel にだけ表示する。
 *
 * arm、torso / shoulder、semantic / finger は独立 flag として扱い、通常設定や保存設定 contract へは
 * 広げない。full normalized pose application も同じ Debug Console 限定の復旧 hook であり、各 select は
 * DebugConsoleManager の既存 pose retarget config path だけを通して runtime へ反映する。
 * 所有者は motion runtime で、段階 rollback flag を削除する場合はこの panel と snapshot pick を同時に消す。
 */
export function SincroPoseRetargetComposerControls({
    poseRetarget,
    manager,
}: SincroPoseRetargetComposerControlsProps) {
    return (
        <>
            <ComposerArmApplicationSelect poseRetarget={poseRetarget} manager={manager} />
            <ComposerTorsoShoulderApplicationSelect poseRetarget={poseRetarget} manager={manager} />
            <ComposerSemanticFingerApplicationSelect
                poseRetarget={poseRetarget}
                manager={manager}
            />
            <FullNormalizedPoseApplicationSelect poseRetarget={poseRetarget} manager={manager} />
        </>
    );
}

function ComposerArmApplicationSelect({
    poseRetarget,
    manager,
}: SincroPoseRetargetComposerControlsProps) {
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
}: SincroPoseRetargetComposerControlsProps) {
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

function ComposerSemanticFingerApplicationSelect({
    poseRetarget,
    manager,
}: SincroPoseRetargetComposerControlsProps) {
    return (
        <div className="audioControlGroup">
            <label className="audioControlLabel" htmlFor="sincroPoseComposerSemanticFinger">
                Composer Gesture
                <span>experimental</span>
            </label>
            <select
                id="sincroPoseComposerSemanticFinger"
                className="audioControlSelect"
                value={poseRetarget.composerSemanticFingerApplicationMode}
                onChange={(event) =>
                    applyPoseRetargetPatch(manager, poseRetarget, {
                        composerSemanticFingerApplicationMode:
                            parseComposerSemanticFingerApplicationMode(event.currentTarget.value),
                    })
                }
            >
                <option value="composer">semantic/finger composer</option>
                <option value="off">off</option>
            </select>
        </div>
    );
}

function FullNormalizedPoseApplicationSelect({
    poseRetarget,
    manager,
}: SincroPoseRetargetComposerControlsProps) {
    return (
        <div className="audioControlGroup">
            <label className="audioControlLabel" htmlFor="sincroPoseFullNormalizedApplication">
                Full Pose
                <span>experimental</span>
            </label>
            <select
                id="sincroPoseFullNormalizedApplication"
                className="audioControlSelect"
                value={poseRetarget.fullNormalizedPoseApplicationMode}
                onChange={(event) =>
                    applyPoseRetargetPatch(manager, poseRetarget, {
                        fullNormalizedPoseApplicationMode: parseFullNormalizedPoseApplicationMode(
                            event.currentTarget.value,
                        ),
                    })
                }
            >
                <option value="off">off</option>
                <option value="upper_body">upper body finalPose</option>
            </select>
        </div>
    );
}

function applyPoseRetargetPatch(
    manager: DebugConsoleManager,
    poseRetarget: SincroPoseRetargetComposerControlsProps["poseRetarget"],
    patch: Partial<SincroPoseRetargetComposerControlsProps["poseRetarget"]>,
): void {
    manager.applySincroPoseRetargetConfig({
        ...poseRetarget,
        ...patch,
    });
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

function parseComposerSemanticFingerApplicationMode(
    value: string,
): ComposerSemanticFingerApplicationMode {
    switch (value) {
        case "off":
        case "composer":
            return value;
        default:
            return "composer";
    }
}

function parseFullNormalizedPoseApplicationMode(value: string): FullNormalizedPoseApplicationMode {
    switch (value) {
        case "off":
        case "upper_body":
            return value;
        default:
            return "off";
    }
}
