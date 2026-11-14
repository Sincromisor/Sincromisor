import type { DebugConsoleManager, DebugConsoleSnapshot } from "../../model/debugConsoleManager";
import { GazeStatusTable } from "./gazeStatusTable";
import { GazeTuningControls } from "./gazeTuningControls";

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
