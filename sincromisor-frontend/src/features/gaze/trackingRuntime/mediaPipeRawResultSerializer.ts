/**
 * MediaPipe result を motion-debug raw replay 用の plain JSON snapshot へ写す境界。
 *
 * serializer は landmark / category / matrix の数値 field だけをコピーし、MPMask、ImageBitmap、VideoFrame、
 * crop canvas、MediaPipe task instance は保存しない。slot が作られない状態は tracker 側の model 未ロード、
 * inference 未実行、inference failure、gesture 前提 hand 不成立などで `undefined` として表現され、recording 側は
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

/**
 * motion-debug recording が保存する MediaPipe raw replay 用 frame。
 *
 * 各 slot は live tracker の MediaPipe result から `serialize*Result()` で写した plain JSON subset を受け入れる。
 * `unknown` にしているのは、replay 境界で `parseMotionReplayRawResultFrame()` が slot ごとの schema と
 * non-JSON object を検証するため。`timing` は録画 frame の media time と入力 video 寸法で、slot が 1 つでも
 * ある場合だけ `createTrackerRuntimeMediaPipeRawResult()` から返される。
 */
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

/**
 * tracker runtime から届いた raw slot を 1 frame の replay payload にまとめる。
 *
 * 入力は serializer 済みの pose / hand / face / gesture slot と録画時の `timing`。model 未ロード、inference 未実行、
 * gesture の hand prerequisite 不成立、inference failure などで全 slot が `undefined` の場合は `undefined` を返し、
 * recording 側が空 object を「raw 録画済み」と誤認しないようにする。返す payload は slot と timing の shallow copy
 * だけで、MediaPipe task instance、`MPMask`、`ImageBitmap`、`VideoFrame`、crop canvas などの runtime / transferable
 * object は保持しない。raw slot を省略した frame は replay 時に
 * `missing_mediapipe_raw_result` として見える。
 */
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

/**
 * PoseLandmarkerResult を raw pose replay が既存 pose normalizer に渡せる JSON subset へ変換する。
 *
 * live tracker の full-frame pose inference が返した result を受け入れ、`landmarks` と `worldLandmarks` の数値 field
 * だけを保存する。landmark が空配列でも result が返っている限り raw slot object を返し、この関数自体は
 * `undefined` を返さない。slot が `undefined` になるのは model 未ロードや inference 未実行など、この関数が呼ばれない
 * tracker 側の状態。segmentation mask や MediaPipe runtime object は保存しない。将来 normalizer が未保存 field に
 * 依存すると、raw replay は runtime object で補完されず parse/normalize の欠落として表面化する。
 */
export function serializePoseLandmarkerResult(
    result: PoseLandmarkerResult,
): TrackerRuntimeMediaPipeRawResult["pose"] {
    return {
        landmarks: serializeLandmarkGroups(result.landmarks),
        worldLandmarks: serializeLandmarkGroups(result.worldLandmarks),
    };
}

/**
 * HandLandmarkerResult を raw hand replay 用の JSON subset へ変換する。
 *
 * full-frame hand fallback inference が返した result を受け入れ、hand/world landmarks と handedness category を保存する。
 * landmark/category が空配列でも result が返っている限り raw slot object を返し、この関数自体は `undefined` を返さない。
 * slot が `undefined` になるのは model 未ロード、ROI tracking のみで full-frame fallback 未実行、inference failure など、
 * この関数が呼ばれない tracker 側の状態。ROI crop 由来の crop-local context、MediaPipe task instance、transferable
 * object は保持しない。crop context が必要な raw をここに流すと、replay では手の side assignment や座標が欠落/不一致
 * として見える。
 */
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

/**
 * FaceLandmarkerResult を raw face replay 用の JSON subset へ変換する。
 *
 * full-frame face inference が返した result を受け入れ、face landmarks、blendshape category、facial transformation matrix
 * の数値/文字列 field だけを保存する。各配列が空でも result が返っている限り raw slot object を返し、この関数自体は
 * `undefined` を返さない。slot が `undefined` になるのは model 未ロード、ROI inference のみで full-frame inference
 * 未実行、inference failure など、この関数が呼ばれない tracker 側の状態。MediaPipe の mask/image/video/task instance は
 * 保持しない。保存しない runtime field に replay が依存した場合は、raw replay の parse/normalize error または face
 * snapshot 欠落として見える。
 */
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

/**
 * GestureRecognizerResult を raw gesture replay の検証境界で読める JSON subset へ変換する。
 *
 * gesture tracker の inference が返した result を受け入れ、hand/world landmarks、handedness、gesture category を保存する。
 * 各配列が空でも result が返っている限り raw slot object を返し、この関数自体は `undefined` を返さない。slot が
 * `undefined` になるのは hand prerequisite 不成立、model 未ロード、inference failure など、この関数が呼ばれない
 * tracker 側の状態。MediaPipe task instance、image/video、transferable object は保存しない。現行 replay snapshot は
 * gesture を保持しないため、失敗時は visual motion ではなく raw parse/normalize 境界の欠落として表面化する。
 */
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
