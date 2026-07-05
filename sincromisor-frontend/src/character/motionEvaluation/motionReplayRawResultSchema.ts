/**
 * motion-debug の `frame.mediapipe` slot を raw result replay 用の保存 contract として検証する。
 *
 * 受理する値は MediaPipe result から JSON 化した plain object だけで、ImageBitmap、VideoFrame、MPMask、
 * crop object、class instance は含めない。slot 欠損は旧 log 互換として log load では許し、raw replay mode
 * の実行時だけ `missing_mediapipe_raw_result` として扱う。
 */
import { z } from "zod";

const finiteNumberSchema = z.number().finite();

const landmarkSchema = z
    .object({
        x: finiteNumberSchema,
        y: finiteNumberSchema,
        z: finiteNumberSchema,
        visibility: finiteNumberSchema,
        presence: finiteNumberSchema.optional(),
    })
    .strict();

const categorySchema = z
    .object({
        score: finiteNumberSchema,
        index: z.number().int(),
        categoryName: z.string(),
        displayName: z.string(),
    })
    .strict();

const matrixSchema = z
    .object({
        rows: z.number().int().positive(),
        columns: z.number().int().positive(),
        data: z.array(finiteNumberSchema),
    })
    .strict();

const poseRawResultSchema = z
    .object({
        landmarks: z.array(z.array(landmarkSchema)),
        worldLandmarks: z.array(z.array(landmarkSchema)),
    })
    .strict();

const handRawResultSchema = z
    .object({
        landmarks: z.array(z.array(landmarkSchema)),
        worldLandmarks: z.array(z.array(landmarkSchema)),
        handedness: z.array(z.array(categorySchema)),
        handednesses: z.array(z.array(categorySchema)),
    })
    .strict();

const faceRawResultSchema = z
    .object({
        faceLandmarks: z.array(z.array(landmarkSchema)),
        faceBlendshapes: z.array(
            z
                .object({
                    categories: z.array(categorySchema),
                    headIndex: z.number().int(),
                    headName: z.string(),
                })
                .strict(),
        ),
        facialTransformationMatrixes: z.array(matrixSchema),
    })
    .strict();

const gestureRawResultSchema = z
    .object({
        landmarks: z.array(z.array(landmarkSchema)),
        worldLandmarks: z.array(z.array(landmarkSchema)),
        handedness: z.array(z.array(categorySchema)),
        handednesses: z.array(z.array(categorySchema)),
        gestures: z.array(z.array(categorySchema)),
    })
    .strict();

const timingSchema = z
    .object({
        mediaTimeMs: finiteNumberSchema,
        videoWidth: finiteNumberSchema,
        videoHeight: finiteNumberSchema,
    })
    .strict();

const rawResultFrameSchema = z
    .object({
        pose: poseRawResultSchema.optional(),
        hand: handRawResultSchema.optional(),
        face: faceRawResultSchema.optional(),
        gesture: gestureRawResultSchema.optional(),
        timing: timingSchema,
    })
    .strict();

export type SincroMotionReplayRawPoseResult = z.infer<typeof poseRawResultSchema>;
export type SincroMotionReplayRawHandResult = z.infer<typeof handRawResultSchema>;
export type SincroMotionReplayRawFaceResult = z.infer<typeof faceRawResultSchema>;
export type SincroMotionReplayRawGestureResult = z.infer<typeof gestureRawResultSchema>;

/**
 * raw result replay mode が caller へ渡す frame 単位の検証済み入力。
 *
 * `timing` は保存時の media time と video size の検査用で、replay 適用時の正本時刻は従来どおり
 * `MotionReplayApplyContext.mediaTimeMs` に置く。slot は実際に serializer が plain JSON 化できたものだけを
 *持ち、欠損 slot を pose-snapshot から補完しない。
 */
export type SincroMotionReplayRawResultFrame = z.infer<typeof rawResultFrameSchema>;

export type MotionReplayRawResultParseError = {
    slot: "pose" | "hand" | "face" | "gesture" | "timing" | "root";
    path: Array<string | number>;
    message: string;
};

export type MotionReplayRawResultParseResult =
    | { ok: true; frame: SincroMotionReplayRawResultFrame }
    | { ok: false; errors: MotionReplayRawResultParseError[] };

/**
 * `frame.mediapipe` の raw replay contract を検証する。
 *
 * Zod の error path を slot 名付きで返すため、`MotionReplayPlayer` は `parse_error` の message だけで
 * 壊れた raw slot を caller / viewer に示せる。失敗しても pose-snapshot fallback は行わない。
 */
export function parseMotionReplayRawResultFrame(value: unknown): MotionReplayRawResultParseResult {
    const nonJson = findNonJsonValue(value, []);
    if (nonJson !== undefined) {
        return {
            ok: false,
            errors: [
                {
                    slot: rawResultErrorSlot(nonJson.path),
                    path: nonJson.path,
                    message: nonJson.message,
                },
            ],
        };
    }
    const parsed = rawResultFrameSchema.safeParse(value);
    if (parsed.success) {
        return { ok: true, frame: parsed.data };
    }
    return {
        ok: false,
        errors: parsed.error.issues.map((issue) => ({
            slot: rawResultErrorSlot(toReplayErrorPath(issue.path)),
            path: toReplayErrorPath(issue.path),
            message: issue.message,
        })),
    };
}

function toReplayErrorPath(path: readonly PropertyKey[]): Array<string | number> {
    return path.map((segment) =>
        typeof segment === "symbol" ? (segment.description ?? "") : segment,
    );
}

function findNonJsonValue(
    value: unknown,
    path: Array<string | number>,
): { path: Array<string | number>; message: string } | undefined {
    if (value === null) {
        return { path, message: "null is not accepted in MediaPipe raw replay frames." };
    }
    if (typeof value === "number") {
        return Number.isFinite(value)
            ? undefined
            : { path, message: "Non-finite numbers are not JSON replay values." };
    }
    if (typeof value === "string" || typeof value === "boolean") {
        return undefined;
    }
    if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) {
            const child = findNonJsonValue(value[index], [...path, index]);
            if (child !== undefined) {
                return child;
            }
        }
        return undefined;
    }
    if (isPlainRecord(value)) {
        for (const key of Object.keys(value)) {
            const child = findNonJsonValue(value[key], [...path, key]);
            if (child !== undefined) {
                return child;
            }
        }
        return undefined;
    }
    return {
        path,
        message: "MediaPipe raw replay frames accept only plain JSON objects and arrays.",
    };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype;
}

function rawResultErrorSlot(
    path: readonly (string | number)[],
): MotionReplayRawResultParseError["slot"] {
    const first = path[0];
    if (
        first === "pose" ||
        first === "hand" ||
        first === "face" ||
        first === "gesture" ||
        first === "timing"
    ) {
        return first;
    }
    return "root";
}
