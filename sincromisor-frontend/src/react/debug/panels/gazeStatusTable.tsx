import type { DebugConsoleSnapshot } from "../../../ts/ui/debugConsoleManager";

type GazeStatusTableProps = {
    gaze: DebugConsoleSnapshot["gaze"];
};

export function GazeStatusTable({ gaze }: GazeStatusTableProps) {
    return (
        <dl className="gazeTable">
            <dt>Status</dt>
            <dd>{gaze.status}</dd>
            <dt>X</dt>
            <dd>{gaze.faceX}</dd>
            <dt>Y</dt>
            <dd>{gaze.faceY}</dd>
            <dt>Facing</dt>
            <dd>{gaze.facing}</dd>
            <dt>Target</dt>
            <dd>{gaze.targetDebug}</dd>
        </dl>
    );
}
