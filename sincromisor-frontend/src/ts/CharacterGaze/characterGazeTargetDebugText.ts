import type { FaceTargetSelectionResult } from "./FaceTargetSelector";

export function buildCharacterGazeTargetDebugText(selection: FaceTargetSelectionResult): string {
    if (selection.selectedIndex === undefined) {
        return `候補:${selection.candidateCount}`;
    }
    const score = (selection.selectedScore ?? 0).toFixed(2);
    const lockStatus = selection.holdLocked ? " 固定中" : "";
    return `対象:${selection.selectedIndex} 候補:${selection.candidateCount} score:${score}${lockStatus}`;
}
