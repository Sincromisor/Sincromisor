import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";
import { SincroMotionFaceSection } from "./sincroMotionFaceSection";
import { SincroMotionPoseSection } from "./sincroMotionPoseSection";

type SincroMotionPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
    manager: DebugConsoleManager;
};

export function SincroMotionPanel({ snapshot, manager, isActive }: SincroMotionPanelProps) {
    const face = snapshot.sincroMotion.face;
    const pose = snapshot.sincroMotion.pose;
    const tracker = snapshot.sincroMotion.tracker;
    const poseRetarget = snapshot.sincroMotion.poseRetarget;
    const poseRetargetRuntime = snapshot.sincroMotion.poseRetargetRuntime;

    return (
        <section
            id="debug-console-panel-sincro"
            className={debugPanelClassName("debugCard debugCard--sincro", isActive)}
            data-debug-panel="sincro"
            role="tabpanel"
            aria-labelledby="debug-console-tab-sincro"
            hidden={!isActive}
        >
            <h3>Sincro Motion</h3>
            <div className="sincroMotionGrid">
                <SincroMotionFaceSection face={face} tracker={tracker} />
                <SincroMotionPoseSection
                    pose={pose}
                    poseRetarget={poseRetarget}
                    poseRetargetRuntime={poseRetargetRuntime}
                    manager={manager}
                />
            </div>
        </section>
    );
}
