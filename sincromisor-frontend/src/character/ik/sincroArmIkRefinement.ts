import type { Vector3 } from "three/src/math/Vector3.js";
import { Vector3 as ThreeVector3 } from "three/src/math/Vector3.js";

export type SincroArmIkRefinementConfig = {
    enabled: boolean;
    maxCandidates: 5;
    reachScales: readonly number[];
    elevationOffsetsRad: readonly number[];
    depthScales: readonly number[];
    maxTargetDeltaRatio: number;
};

export type SincroArmIkRefinementCandidate = {
    index: number;
    reachScale: number;
    elevationOffsetRad: number;
    depthScale: number;
    wrist: Vector3;
};

export type SincroArmIkRefinementResult = {
    candidateCount: number;
    selectedCandidateIndex: number;
    applied: boolean;
    selectedCost: number;
    originalCost: number;
    candidates: Array<{
        index: number;
        reachScale: number;
        elevationOffsetRad: number;
        depthScale: number;
        cost: number;
        rejected: boolean;
        rejectReason?: "target_delta_exceeded" | "unusable_direction";
    }>;
};

export type SincroArmIkRefinementCandidateSummary = {
    candidate: SincroArmIkRefinementCandidate;
    cost: number;
    rejected: boolean;
    rejectReason?: "target_delta_exceeded" | "unusable_direction";
};

const MIN_HORIZONTAL_LENGTH = 1e-6;
export const REJECTED_SINCRO_ARM_IK_REFINEMENT_CANDIDATE_COST = 1_000_000;

export function createDefaultSincroArmIkRefinementConfig(): SincroArmIkRefinementConfig {
    return {
        enabled: false,
        maxCandidates: 5,
        reachScales: [1, 0.97, 0.94],
        elevationOffsetsRad: [0, -0.035],
        depthScales: [1, 0.9],
        maxTargetDeltaRatio: 0.08,
    };
}

export function createSincroArmIkRefinementCandidates(
    originalWrist: Vector3,
    config: SincroArmIkRefinementConfig,
): SincroArmIkRefinementCandidate[] {
    const candidates: SincroArmIkRefinementCandidate[] = [
        {
            index: 0,
            reachScale: 1,
            elevationOffsetRad: 0,
            depthScale: 1,
            wrist: originalWrist.clone(),
        },
    ];

    for (const reachScale of config.reachScales) {
        for (const elevationOffsetRad of config.elevationOffsetsRad) {
            for (const depthScale of config.depthScales) {
                if (reachScale === 1 && elevationOffsetRad === 0 && depthScale === 1) {
                    continue;
                }
                candidates.push({
                    index: candidates.length,
                    reachScale,
                    elevationOffsetRad,
                    depthScale,
                    wrist: refinedWrist(originalWrist, {
                        reachScale,
                        elevationOffsetRad,
                        depthScale,
                    }),
                });
                if (candidates.length >= config.maxCandidates) {
                    return candidates;
                }
            }
        }
    }
    return candidates;
}

export function createSincroArmIkRefinementResult(
    evaluations: readonly SincroArmIkRefinementCandidateSummary[],
    selected: SincroArmIkRefinementCandidateSummary,
    original: SincroArmIkRefinementCandidateSummary,
): SincroArmIkRefinementResult {
    return {
        candidateCount: evaluations.length,
        selectedCandidateIndex: selected.candidate.index,
        applied: selected.candidate.index !== 0,
        selectedCost: selected.cost,
        originalCost: original.cost,
        candidates: evaluations.map((evaluation) => ({
            index: evaluation.candidate.index,
            reachScale: evaluation.candidate.reachScale,
            elevationOffsetRad: evaluation.candidate.elevationOffsetRad,
            depthScale: evaluation.candidate.depthScale,
            cost: evaluation.cost,
            rejected: evaluation.rejected,
            ...(evaluation.rejectReason ? { rejectReason: evaluation.rejectReason } : {}),
        })),
    };
}

function refinedWrist(
    originalWrist: Vector3,
    {
        reachScale,
        elevationOffsetRad,
        depthScale,
    }: Pick<SincroArmIkRefinementCandidate, "reachScale" | "elevationOffsetRad" | "depthScale">,
): Vector3 {
    const zDepth = originalWrist.z * depthScale;
    const horizontal = Math.hypot(originalWrist.x, zDepth);
    const radius = Math.hypot(horizontal, originalWrist.y);
    const elevation = Math.atan2(originalWrist.y, horizontal) + elevationOffsetRad;
    const wristBeforeReach =
        horizontal > MIN_HORIZONTAL_LENGTH
            ? new ThreeVector3(
                  (originalWrist.x * radius * Math.cos(elevation)) / horizontal,
                  radius * Math.sin(elevation),
                  (zDepth * radius * Math.cos(elevation)) / horizontal,
              )
            : new ThreeVector3(0, radius * Math.sin(elevation), 0);
    return wristBeforeReach.multiplyScalar(reachScale);
}
