/** 保持済みの動作履歴を分類器用の特徴量へ変換する。履歴の追加・破棄は行わない。 */
import type { ArmMotionIntent } from "../motionIntent/motionIntentState";
import type { MotionSequenceSample, MotionSequenceSideFeatures } from "./motionSequenceWindow";

const SEMANTIC_ARM_INTENTS = [
    "wave",
    "pointing",
    "thumbsUp",
    "peace",
    "nearFace",
    "explain",
    "clapLike",
    "guarded",
] as const;

type MotionSide = "left" | "right";
type ArmPartName = "leftArm" | "rightArm";
type ArmJointName =
    | "leftShoulder"
    | "leftElbow"
    | "leftWrist"
    | "rightShoulder"
    | "rightElbow"
    | "rightWrist";
type SemanticArmMotionIntent = (typeof SEMANTIC_ARM_INTENTS)[number];
type HandOpenCloseState = "open" | "closed";

type SemanticRun = {
    intent: SemanticArmMotionIntent;
    durationMs: number;
};

/** 入力がない区間では、分類器へすべてゼロの特徴量を渡す。 */
export function createEmptySideFeatures(): MotionSequenceSideFeatures {
    return {
        intentTransitions: 0,
        semanticHoldMs: 0,
        gestureFlickerCount: 0,
        trackingLossMs: 0,
        sideSwapSuspectCount: 0,
        wristVelocitySignChanges: 0,
        handOpenCloseTransitions: 0,
    };
}

function isSemanticIntent(intent: ArmMotionIntent): intent is SemanticArmMotionIntent {
    switch (intent) {
        case "wave":
        case "pointing":
        case "thumbsUp":
        case "peace":
        case "nearFace":
        case "explain":
        case "clapLike":
        case "guarded":
            return true;
        case "tracking":
        case "lost":
        case "fallback":
            return false;
    }
}

/** 各観測は次の標本までの区間を代表する。末尾は終点が未確定なので時間を加算しない。 */
function durationToNext(samples: readonly MotionSequenceSample[], index: number): number {
    const next = samples[index + 1];
    if (next === undefined) {
        return 0;
    }
    return Math.max(0, next.mediaTimeMs - samples[index].mediaTimeMs);
}

function sidePartName(side: MotionSide): ArmPartName {
    return side === "left" ? "leftArm" : "rightArm";
}

function sideJointNames(side: MotionSide): readonly ArmJointName[] {
    return side === "left"
        ? ["leftShoulder", "leftElbow", "leftWrist"]
        : ["rightShoulder", "rightElbow", "rightWrist"];
}

/** 意図・信頼度全体・腕・各関節のいずれかに左右不整合があれば、その標本を一度だけ数える。 */
function hasSideSwapWarning(sample: MotionSequenceSample, side: MotionSide): boolean {
    const intentWarnings = sample.intent?.arms[side].warnings ?? [];
    if (intentWarnings.includes("left_right_swap_suspect")) {
        return true;
    }

    const reliability = sample.reliability;
    if (reliability === undefined) {
        return false;
    }
    if (reliability.warnings.includes("side_inconsistent")) {
        return true;
    }

    const armPart = reliability.parts[sidePartName(side)];
    if (armPart.warnings.includes("side_inconsistent")) {
        return true;
    }

    return sideJointNames(side).some((jointName) =>
        reliability.joints[jointName].warnings.includes("side_inconsistent"),
    );
}

function hasTrackingLoss(sample: MotionSequenceSample, side: MotionSide): boolean {
    if (sample.temporal?.arms[side].state === "lost") {
        return true;
    }
    const intent = sample.intent?.arms[side].intent;
    if (intent === "lost" || intent === "fallback") {
        return true;
    }
    return sample.reliability?.parts[sidePartName(side)].state === "lost";
}

/** 意味のある意図の連続区間を延ばし、通常追跡や欠損への切り替え時に最長区間を確定する。 */
function updateSemanticRun(
    currentRun: SemanticRun | undefined,
    bestRun: SemanticRun | undefined,
    intent: ArmMotionIntent,
    durationMs: number,
): { currentRun?: SemanticRun; bestRun?: SemanticRun } {
    if (!isSemanticIntent(intent)) {
        return { bestRun: selectBestRun(bestRun, currentRun) };
    }
    if (currentRun !== undefined && currentRun.intent === intent) {
        return {
            currentRun: {
                intent: currentRun.intent,
                durationMs: currentRun.durationMs + durationMs,
            },
            bestRun,
        };
    }
    return {
        currentRun: { intent, durationMs },
        bestRun: selectBestRun(bestRun, currentRun),
    };
}

/** 同じ継続時間なら先に観測した意図を優先する。 */
function selectBestRun(
    bestRun: SemanticRun | undefined,
    candidate: SemanticRun | undefined,
): SemanticRun | undefined {
    if (candidate === undefined) {
        return bestRun;
    }
    if (bestRun === undefined || candidate.durationMs > bestRun.durationMs) {
        return candidate;
    }
    return bestRun;
}

function handOpenCloseState(
    sample: MotionSequenceSample,
    side: MotionSide,
): HandOpenCloseState | undefined {
    const openness =
        side === "left"
            ? sample.hand?.leftHand.features.openness
            : sample.hand?.rightHand.features.openness;
    if (openness === "open" || openness === "closed") {
        return openness;
    }
    return undefined;
}

/** 意図の欠損では前回値を消さず、観測できた区間だけ継続時間へ加える。 */
function aggregateIntentFeatures(
    samples: readonly MotionSequenceSample[],
    side: MotionSide,
): MotionSequenceSideFeatures {
    const features = createEmptySideFeatures();
    let previousIntent: ArmMotionIntent | undefined;
    let previousFlickerStableDurationMs = 0;
    let currentRun: SemanticRun | undefined;
    let bestRun: SemanticRun | undefined;

    for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];
        const durationMs = durationToNext(samples, index);
        const sideIntent = sample.intent?.arms[side];

        if (sideIntent === undefined) {
            continue;
        }
        if (previousIntent !== undefined && sideIntent.intent !== previousIntent) {
            features.intentTransitions += 1;
        }
        // 150ms未満で意味のある動作が切り替わった場合をちらつきとして数える。
        if (
            previousIntent !== undefined &&
            isSemanticIntent(previousIntent) &&
            previousFlickerStableDurationMs < 150 &&
            (sideIntent.intent === "tracking" ||
                (isSemanticIntent(sideIntent.intent) && sideIntent.intent !== previousIntent))
        ) {
            features.gestureFlickerCount += 1;
        }
        const runUpdate = updateSemanticRun(currentRun, bestRun, sideIntent.intent, durationMs);
        currentRun = runUpdate.currentRun;
        bestRun = runUpdate.bestRun;
        previousIntent = sideIntent.intent;
        previousFlickerStableDurationMs = sideIntent.stableDurationMs;
    }

    const selectedRun = selectBestRun(bestRun, currentRun);
    if (selectedRun !== undefined) {
        features.semanticHoldMs = selectedRun.durationMs;
        features.stableSemanticIntent = selectedRun.intent;
    }
    return features;
}

/**
 * 時刻順の履歴から片腕の特徴量を計算する。意図と身体観測の前回値は独立に扱う。
 * 微小な手首速度と不明な開閉状態は飛ばし、直前の有効観測との変化だけを数える。
 */
export function aggregateSideFeatures(
    samples: readonly MotionSequenceSample[],
    side: MotionSide,
): MotionSequenceSideFeatures {
    const features = aggregateIntentFeatures(samples, side);
    features.wristVelocitySignChanges = countObservedChanges(
        samples.map((sample) => wristVelocitySign(sample, side)),
    );
    features.handOpenCloseTransitions = countObservedChanges(
        samples.map((sample) => handOpenCloseState(sample, side)),
    );
    for (let index = 0; index < samples.length; index += 1) {
        const sample = samples[index];
        const durationMs = durationToNext(samples, index);
        if (hasTrackingLoss(sample, side)) {
            features.trackingLossMs += durationMs;
        }
        if (hasSideSwapWarning(sample, side)) {
            features.sideSwapSuspectCount += 1;
        }
    }

    return features;
}

/** 静止時の揺れを除き、正規化座標の水平速度が毎秒0.02以上の観測だけ符号を返す。 */
function wristVelocitySign(sample: MotionSequenceSample, side: MotionSide): -1 | 1 | undefined {
    const velocity = sample.temporal?.arms[side].velocity.wrist?.[0];
    if (velocity === undefined || !Number.isFinite(velocity) || Math.abs(velocity) < 0.02) {
        return undefined;
    }
    return velocity > 0 ? 1 : -1;
}

/** 欠損は前回値を初期化せず飛ばす。手首の方向と手の開閉に共通の変化数を求める。 */
function countObservedChanges<T>(values: readonly (T | undefined)[]): number {
    let previous: T | undefined;
    let count = 0;
    for (const value of values) {
        if (value === undefined) {
            continue;
        }
        if (previous !== undefined && value !== previous) {
            count += 1;
        }
        previous = value;
    }
    return count;
}
