import type { Ref } from "react";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";
import { GazePreview } from "./gazePreview";

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
