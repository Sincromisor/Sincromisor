import type { Detection } from "@mediapipe/tasks-vision";

type NormalizedKeypoint = {
    x: number;
    y: number;
    score?: number;
};

type FaceCandidate = {
    index: number;
    nose: { x: number; y: number };
    score: number;
};

export type FaceTargetSelectionResult = {
    selectedIndex: number | null;
    candidateCount: number;
    holdLocked: boolean;
    selectedScore?: number;
};

// 複数顔検出時に「誰を見るか」を決める小さな selector。
// 毎フレームの最高スコアだけで切り替えると迷いやすいため、保持時間と切替マージンでヒステリシスをかける。
export class FaceTargetSelector {
    private currentNose: { x: number; y: number } | null = null;
    private lastSwitchAtMs = 0;
    private minimumHoldMs = 900;
    private switchMargin = 0.15;
    private relinkDistance = 0.20;

    reset(): void {
        this.currentNose = null;
        this.lastSwitchAtMs = 0;
    }

    setTuning(params: Partial<{ minimumHoldMs: number; switchMargin: number; relinkDistance: number }>): void {
        if (Number.isFinite(params.minimumHoldMs)) {
            this.minimumHoldMs = Math.max(0, Math.min(5000, Math.round(params.minimumHoldMs as number)));
        }
        if (Number.isFinite(params.switchMargin)) {
            this.switchMargin = Math.max(0, Math.min(1, params.switchMargin as number));
        }
        if (Number.isFinite(params.relinkDistance)) {
            this.relinkDistance = Math.max(0.02, Math.min(1, params.relinkDistance as number));
        }
    }

    getTuning(): { minimumHoldMs: number; switchMargin: number; relinkDistance: number } {
        return {
            minimumHoldMs: this.minimumHoldMs,
            switchMargin: this.switchMargin,
            relinkDistance: this.relinkDistance,
        };
    }

    select(detections: Detection[], nowMs: number): FaceTargetSelectionResult {
        const candidates = this.buildCandidates(detections);
        if (candidates.length === 0) {
            this.currentNose = null;
            return { selectedIndex: null, candidateCount: 0, holdLocked: false };
        }

        candidates.sort((a, b) => b.score - a.score);
        const best = candidates[0];

        if (!this.currentNose) {
            this.currentNose = best.nose;
            this.lastSwitchAtMs = nowMs;
            return { selectedIndex: best.index, candidateCount: candidates.length, holdLocked: false, selectedScore: best.score };
        }

        const matchedCurrent = this.findCurrentCandidate(candidates, this.currentNose);
        const holdElapsedMs = nowMs - this.lastSwitchAtMs;

        // 現在ターゲット相当の候補が残っている間は、一定時間は優先保持して「迷う」挙動を抑える。
        if (matchedCurrent && holdElapsedMs < this.minimumHoldMs) {
            this.currentNose = matchedCurrent.nose;
            return { selectedIndex: matchedCurrent.index, candidateCount: candidates.length, holdLocked: true, selectedScore: matchedCurrent.score };
        }

        if (!matchedCurrent) {
            this.currentNose = best.nose;
            this.lastSwitchAtMs = nowMs;
            return { selectedIndex: best.index, candidateCount: candidates.length, holdLocked: false, selectedScore: best.score };
        }

        // 切替は「少し良い」では行わず、十分優位な場合だけ実行する。
        if (best.index !== matchedCurrent.index && best.score > matchedCurrent.score + this.switchMargin) {
            this.currentNose = best.nose;
            this.lastSwitchAtMs = nowMs;
            return { selectedIndex: best.index, candidateCount: candidates.length, holdLocked: false, selectedScore: best.score };
        }

        this.currentNose = matchedCurrent.nose;
        return { selectedIndex: matchedCurrent.index, candidateCount: candidates.length, holdLocked: false, selectedScore: matchedCurrent.score };
    }

    private buildCandidates(detections: Detection[]): FaceCandidate[] {
        const out: FaceCandidate[] = [];
        for (let i = 0; i < detections.length; i += 1) {
            const keypoints = detections[i].keypoints as NormalizedKeypoint[] | undefined;
            if (!keypoints || keypoints.length < 6) {
                continue;
            }
            const nose = keypoints[2];
            if (!this.isValidPoint(nose)) {
                continue;
            }
            out.push({
                index: i,
                nose: { x: nose.x, y: nose.y },
                score: this.computeScore(keypoints),
            });
        }
        return out;
    }

    private computeScore(keypoints: NormalizedKeypoint[]): number {
        const nose = keypoints[2];
        const centerDist = this.distance(nose, { x: 0.5, y: 0.5 });
        const centerScore = 1 - Math.min(1, centerDist / 0.7);

        const eyeDist = this.distance(keypoints[0], keypoints[1]);
        const earDist = this.distance(keypoints[4], keypoints[5]);
        const sizeEstimate = Math.max(eyeDist, earDist * 0.8);
        const sizeScore = Math.min(1, sizeEstimate / 0.22);

        const continuityScore = this.currentNose
            ? 1 - Math.min(1, this.distance(nose, this.currentNose) / 0.45)
            : 0.5;

        const facingScore = this.computeFacingScore(keypoints);

        // 中央寄り + 近さを主軸にしつつ、連続性と正面向きも少し加味する。
        return centerScore * 0.35 + sizeScore * 0.3 + continuityScore * 0.25 + facingScore * 0.1;
    }

    private computeFacingScore(keypoints: NormalizedKeypoint[]): number {
        const rightEye = keypoints[0];
        const leftEye = keypoints[1];
        const nose = keypoints[2];
        const rEyeDist = this.distance(rightEye, nose);
        const lEyeDist = this.distance(leftEye, nose);
        const denom = rEyeDist + lEyeDist;
        if (denom <= 1e-6) {
            return 0.5;
        }
        const ratio = rEyeDist / denom;
        return 1 - Math.min(1, Math.abs(ratio - 0.5) / 0.5);
    }

    private findCurrentCandidate(candidates: FaceCandidate[], current: { x: number; y: number }): FaceCandidate | null {
        let best: FaceCandidate | null = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (const candidate of candidates) {
            const dist = this.distance(candidate.nose, current);
            if (dist > this.relinkDistance) {
                continue;
            }
            if (dist < bestDist) {
                best = candidate;
                bestDist = dist;
            }
        }
        return best;
    }

    private distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    private isValidPoint(point: NormalizedKeypoint | undefined): point is NormalizedKeypoint {
        if (!point) {
            return false;
        }
        return Number.isFinite(point.x) && Number.isFinite(point.y);
    }
}
