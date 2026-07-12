import type { ComposerSemanticFingerApplicationMode } from "../../../../character/retargeting/sincroPoseRetargeter";
import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";

type SincroPoseRetargetComposerControlsProps = {
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    manager: DebugConsoleManager;
};

/**
 * semantic / finger の composer rollback flag を developer panel にだけ表示する。
 *
 * arm / torso / full application の staged rollback flags は削除済みである。残る semantic / finger flag は
 * MotionIntent / Hand observe を残したまま composer input の semantic layer だけを外すための別責務であり、
 * 通常設定や保存設定 contract へは広げない。
 */
export function SincroPoseRetargetComposerControls({
    poseRetarget,
    manager,
}: SincroPoseRetargetComposerControlsProps) {
    return (
        <ComposerSemanticFingerApplicationSelect poseRetarget={poseRetarget} manager={manager} />
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
