import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";
import { GazePreview } from "./gazePreview";
import { GazeStatusTable } from "./gazeStatusTable";
import { GazeTuningControls } from "./gazeTuningControls";

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
                <GazePreview />
                <div className="gazePanelDetails">
                    <GazeStatusTable gaze={snapshot.gaze} />
                    <GazeTuningControls gaze={snapshot.gaze} manager={manager} />
                </div>
            </div>
        </section>
    );
}
