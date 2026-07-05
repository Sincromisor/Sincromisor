import type { Category, GestureRecognizerResult } from "@mediapipe/tasks-vision";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import {
    createLostGestureSideSnapshot,
    type SincroGestureHandedness,
    type SincroGestureSideSnapshot,
    type SincroGestureWarningCode,
} from "./sincroGestureMotionSnapshot";

export type SincroGestureRecognizerLike = {
    recognizeForVideo(videoFrame: TexImageSource, timestampMs: number): GestureRecognizerResult;
    close(): void;
};

export type SincroGestureRecognizerInference = {
    result: GestureRecognizerResult;
    inferenceTimeMs: number;
    inferenceEndedAtMs: number;
};

export function runSincroGestureRecognizer(input: {
    gestureRecognizer: SincroGestureRecognizerLike | undefined;
    videoFrame: TexImageSource;
    timestampMs: number;
}): SincroGestureRecognizerInference {
    const inferenceStartedAtMs = performance.now();
    const result = input.gestureRecognizer?.recognizeForVideo(input.videoFrame, input.timestampMs);
    const inferenceEndedAtMs = performance.now();
    if (result === undefined) {
        throw new Error("GestureRecognizer model is not loaded.");
    }
    return {
        result,
        inferenceTimeMs: inferenceEndedAtMs - inferenceStartedAtMs,
        inferenceEndedAtMs,
    };
}

export function calculateGestureInferenceFps(input: {
    lastInferenceEndedAtMs: number | undefined;
    inferenceEndedAtMs: number;
}): number {
    return input.lastInferenceEndedAtMs === undefined
        ? 0
        : 1000 / Math.max(1, input.inferenceEndedAtMs - input.lastInferenceEndedAtMs);
}

/**
 * GestureRecognizer result を Hand tracker の左右 assignment に従って side snapshot へ正規化する。
 *
 * Gesture handedness は左右入れ替えに使わず、Hand assignment と食い違う場合は
 * `handedness_mismatch` warning だけを残す。category が複数ある場合は finite score 最大を採用し、
 * tie は `categoryName` 昇順で決めるため replay / test で順序が安定する。
 */
export function normalizeSincroGestureRecognizerResult(input: {
    result: GestureRecognizerResult;
    hand: SincroHandMotionSnapshot;
}): { left?: SincroGestureSideSnapshot; right?: SincroGestureSideSnapshot } {
    const assignedSides = collectDetectedHandSides(input.hand);
    const normalized: { left?: SincroGestureSideSnapshot; right?: SincroGestureSideSnapshot } = {};
    for (let index = 0; index < assignedSides.length; index += 1) {
        const side = assignedSides[index];
        const categories = input.result.gestures[index] ?? [];
        const handedness = normalizeGestureHandedness(input.result.handedness[index]?.[0]);
        const snapshot = createGestureSideSnapshot({
            categories,
            handedness,
            assignedSide: side,
        });
        if (side === "left") {
            normalized.left = snapshot;
        } else {
            normalized.right = snapshot;
        }
    }
    return normalized;
}

export function handSnapshotCanDriveGesture(hand: SincroHandMotionSnapshot): boolean {
    return hand.trackingEnabled && hand.detected;
}

function collectDetectedHandSides(hand: SincroHandMotionSnapshot): ("left" | "right")[] {
    const sides: ("left" | "right")[] = [];
    if (hand.leftHand.detected) {
        sides.push("left");
    }
    if (hand.rightHand.detected) {
        sides.push("right");
    }
    return sides;
}

function createGestureSideSnapshot(input: {
    categories: readonly Category[];
    handedness: SincroGestureHandedness;
    assignedSide: "left" | "right";
}): SincroGestureSideSnapshot {
    const category = selectTopGestureCategory(input.categories);
    if (category === undefined) {
        return createLostGestureSideSnapshot(["categories_missing"]);
    }
    const warnings: SincroGestureWarningCode[] =
        input.handedness !== "unknown" && input.handedness !== input.assignedSide
            ? ["handedness_mismatch"]
            : [];
    return {
        label: category.categoryName,
        confidence: clamp01(category.score),
        handedness: input.handedness,
        source: "gesture-recognizer",
        warnings,
    };
}

function selectTopGestureCategory(categories: readonly Category[]): Category | undefined {
    let selected: Category | undefined;
    for (const category of categories) {
        if (!Number.isFinite(category.score)) {
            continue;
        }
        if (selected === undefined) {
            selected = category;
            continue;
        }
        if (category.score > selected.score) {
            selected = category;
            continue;
        }
        if (category.score === selected.score && category.categoryName < selected.categoryName) {
            selected = category;
        }
    }
    return selected;
}

function normalizeGestureHandedness(category: Category | undefined): SincroGestureHandedness {
    const label = category?.categoryName.toLowerCase();
    if (label === "left") {
        return "left";
    }
    if (label === "right") {
        return "right";
    }
    return "unknown";
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
