/**
 * MediaPipe result を motion-debug raw replay 用の plain JSON snapshot へ写す境界。
 *
 * serializer は landmark / category / matrix の数値 field だけをコピーし、MPMask、ImageBitmap、VideoFrame、
 * crop canvas、MediaPipe task instance は保存しない。未対応の slot は `undefined` を返し、recording 側は
 * 空 object を「記録済み」として扱わない。
 */
import type {
    Category,
    FaceLandmarkerResult,
    GestureRecognizerResult,
    HandLandmarkerResult,
    Landmark,
    Matrix,
    NormalizedLandmark,
    PoseLandmarkerResult,
} from "@mediapipe/tasks-vision";

export type TrackerRuntimeMediaPipeRawResult = {
    pose?: unknown;
    hand?: unknown;
    face?: unknown;
    gesture?: unknown;
    timing: {
        mediaTimeMs: number;
        videoWidth: number;
        videoHeight: number;
    };
};

export function createTrackerRuntimeMediaPipeRawResult(input: {
    pose?: unknown;
    hand?: unknown;
    face?: unknown;
    gesture?: unknown;
    timing: TrackerRuntimeMediaPipeRawResult["timing"];
}): TrackerRuntimeMediaPipeRawResult | undefined {
    if (
        input.pose === undefined &&
        input.hand === undefined &&
        input.face === undefined &&
        input.gesture === undefined
    ) {
        return undefined;
    }
    return {
        ...(input.pose === undefined ? {} : { pose: input.pose }),
        ...(input.hand === undefined ? {} : { hand: input.hand }),
        ...(input.face === undefined ? {} : { face: input.face }),
        ...(input.gesture === undefined ? {} : { gesture: input.gesture }),
        timing: { ...input.timing },
    };
}

export function serializePoseLandmarkerResult(
    result: PoseLandmarkerResult,
): TrackerRuntimeMediaPipeRawResult["pose"] {
    return {
        landmarks: serializeLandmarkGroups(result.landmarks),
        worldLandmarks: serializeLandmarkGroups(result.worldLandmarks),
    };
}

export function serializeHandLandmarkerResult(
    result: HandLandmarkerResult,
): TrackerRuntimeMediaPipeRawResult["hand"] {
    return {
        landmarks: serializeLandmarkGroups(result.landmarks),
        worldLandmarks: serializeLandmarkGroups(result.worldLandmarks),
        handedness: serializeCategoryGroups(result.handedness),
        handednesses: serializeCategoryGroups(result.handednesses),
    };
}

export function serializeFaceLandmarkerResult(
    result: FaceLandmarkerResult,
): TrackerRuntimeMediaPipeRawResult["face"] {
    return {
        faceLandmarks: serializeLandmarkGroups(result.faceLandmarks),
        faceBlendshapes: result.faceBlendshapes.map((classification) => ({
            categories: serializeCategories(classification.categories),
            headIndex: classification.headIndex,
            headName: classification.headName,
        })),
        facialTransformationMatrixes: result.facialTransformationMatrixes.map(serializeMatrix),
    };
}

export function serializeGestureRecognizerResult(
    result: GestureRecognizerResult,
): TrackerRuntimeMediaPipeRawResult["gesture"] {
    return {
        landmarks: serializeLandmarkGroups(result.landmarks),
        worldLandmarks: serializeLandmarkGroups(result.worldLandmarks),
        handedness: serializeCategoryGroups(result.handedness),
        handednesses: serializeCategoryGroups(result.handednesses),
        gestures: serializeCategoryGroups(result.gestures),
    };
}

function serializeLandmarkGroups(
    groups: readonly (readonly (Landmark | NormalizedLandmark)[])[],
): Array<Array<Record<string, number>>> {
    return groups.map((landmarks) => landmarks.map(serializeLandmark));
}

function serializeLandmark(landmark: Landmark | NormalizedLandmark): Record<string, number> {
    const base: Record<string, number> = {
        x: finiteOrZero(landmark.x),
        y: finiteOrZero(landmark.y),
        z: finiteOrZero(landmark.z),
        visibility: finiteOrZero(landmark.visibility),
    };
    const presence = "presence" in landmark ? landmark.presence : undefined;
    if (typeof presence === "number" && Number.isFinite(presence)) {
        base.presence = presence;
    }
    return base;
}

function serializeCategoryGroups(groups: readonly (readonly Category[])[]): Array<Array<unknown>> {
    return groups.map((categories) => serializeCategories(categories));
}

function serializeCategories(categories: readonly Category[]): Array<Record<string, unknown>> {
    return categories.map((category) => ({
        score: finiteOrZero(category.score),
        index: Number.isInteger(category.index) ? category.index : -1,
        categoryName: category.categoryName,
        displayName: category.displayName,
    }));
}

function serializeMatrix(matrix: Matrix): { rows: number; columns: number; data: number[] } {
    return {
        rows: matrix.rows,
        columns: matrix.columns,
        data: matrix.data.map(finiteOrZero),
    };
}

function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}
