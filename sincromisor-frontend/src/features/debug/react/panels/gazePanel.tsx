import type { Ref } from "react";
import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";
import { GazePreview } from "./gazePreview";
import { GazeStatusTable } from "./gazeStatusTable";
import { GazeTuningControls } from "./gazeTuningControls";

type GazePanelProps = DebugPanelProps & {
    detailsRef: Ref<HTMLDivElement>;
};

/** 追跡が保持する映像DOMと診断の配置先を常設し、購読部分の休止から分離する。 */
export function GazePanel({ detailsRef, isActive }: GazePanelProps) {
    return (
        <section
            id="debug-console-panel-gaze"
            className={debugPanelClassName("debugCard debugCard--gaze", isActive)}
            data-debug-panel="gaze"
            role="tabpanel"
            aria-labelledby="debug-console-tab-gaze"
            hidden={!isActive}
        >
            <div className="gazePanelGrid">
                <GazePreview />
                <div className="gazePanelDetails" ref={detailsRef} />
            </div>
        </section>
    );
}

/** 常設の視線欄へ配置する診断表示。追跡映像やストリームは所有しない。 */
export function GazeDetails({
    snapshot,
    manager,
}: {
    snapshot: DebugConsoleSnapshot;
    manager: DebugConsoleManager;
}) {
    return (
        <>
            <GazeStatusTable gaze={snapshot.gaze} />
            <GazeTuningControls gaze={snapshot.gaze} manager={manager} />
        </>
    );
}
