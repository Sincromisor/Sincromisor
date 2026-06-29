/**
 * `sincro.motion-debug-log.v1` の NDJSON manifest / frame parser 境界。
 *
 * manifest と frame の envelope だけを厳密に検証し、canonical / temporal / solver などの optional slot は
 * viewer 側の layer parser が個別に扱えるよう `unknown` のまま保持する。旧 log 互換は「optional slot
 * 欠損を許す」ことで担保し、未知 schemaVersion や frame-before-manifest は log 全体の parse error にする。
 */
import { z } from "zod";

/**
 * motion-debug NDJSON manifest が宣言する唯一の受理 version。
 *
 * version mismatch は旧 optional slot fallback では吸収せず、`unknown_schema_version` として log 全体を
 * reject する。
 */
export const SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION = "sincro.motion-debug-log.v1" as const;

const sourceKindSchema = z.enum(["live-camera", "video-fixture", "synthetic"]);

const unknownRecordSchema = z.record(z.string(), z.unknown());

const sourceSchema = z
    .object({
        kind: sourceKindSchema,
        fixtureId: z.string().optional(),
        videoHash: z.string().optional(),
    })
    .strict();

const environmentSchema = z
    .object({
        userAgent: z.string(),
        devicePixelRatio: z.number().finite(),
        viewport: z
            .object({
                width: z.number().finite(),
                height: z.number().finite(),
            })
            .strict(),
        timeOriginMs: z.number().finite().optional(),
    })
    .strict();

const buildSchema = z
    .object({
        appVersion: z.string().optional(),
        gitCommit: z.string().optional(),
        packageVersions: z.record(z.string(), z.string().optional()),
        configHash: z.string(),
    })
    .strict();

const cameraActualSettingsSchema = z
    .object({
        width: z.number().finite().optional(),
        height: z.number().finite().optional(),
        frameRate: z.number().finite().optional(),
        facingMode: z.string().optional(),
        deviceIdHash: z.string().optional(),
        groupIdHash: z.string().optional(),
    })
    .strict();

const cameraSchema = z
    .object({
        requestedConstraints: z.unknown().optional(),
        actualSettings: cameraActualSettingsSchema.optional(),
    })
    .strict();

const avatarSchema = z
    .object({
        avatarProfileId: z.string(),
        vrmMetaHash: z.string().optional(),
        boneCapabilities: z.record(z.string(), z.boolean()),
        restMetrics: unknownRecordSchema.optional(),
        motionProfile: unknownRecordSchema.optional(),
    })
    .strict();

const motionDebugLogManifestSchema = z
    .object({
        schemaVersion: z.literal(SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION),
        createdAtIso: z.string(),
        source: sourceSchema,
        environment: environmentSchema,
        build: buildSchema,
        camera: cameraSchema,
        pipeline: unknownRecordSchema,
        avatar: avatarSchema,
        metricSummary: z.unknown().optional(),
    })
    .strict();

const motionDebugFrameTimestampSchema = z
    .object({
        mediaTimeMs: z.number().finite(),
        presentationTimeMs: z.number().finite().optional(),
        expectedDisplayTimeMs: z.number().finite().optional(),
        presentedFrames: z.number().int().nonnegative().optional(),
        droppedPresentedFrames: z.number().int().nonnegative().optional(),
        clockSource: z
            .enum(["request-video-frame-callback", "request-animation-frame", "timer"])
            .optional(),
    })
    .strict();

const motionDebugFrameVideoSchema = z
    .object({
        width: z.number().finite(),
        height: z.number().finite(),
    })
    .strict();

const motionDebugFrameSchema = z
    .object({
        frameIndex: z.number().int(),
        timestamp: motionDebugFrameTimestampSchema,
        video: motionDebugFrameVideoSchema,
        mediapipe: z.unknown().optional(),
        poseSnapshot: z.unknown().optional(),
        hand: z.unknown().optional(),
        reliability: z.unknown().optional(),
        canonical: z.unknown().optional(),
        temporal: z.unknown().optional(),
        intent: z.unknown().optional(),
        postProcessing: z.unknown().optional(),
        solver: z.unknown().optional(),
        finalPose: z.unknown().optional(),
        applied: z.unknown().optional(),
        metrics: z.unknown().optional(),
    })
    .strict();

const motionDebugManifestLineSchema = z
    .object({
        recordType: z.literal("manifest"),
        manifest: motionDebugLogManifestSchema,
    })
    .strict();

const motionDebugFrameLineSchema = z
    .object({
        recordType: z.literal("frame"),
        frame: motionDebugFrameSchema,
    })
    .strict();

const motionDebugLogLineSchema = z.union([
    motionDebugManifestLineSchema,
    motionDebugFrameLineSchema,
]);

const recordTypeProbeSchema = z.object({ recordType: z.string() }).passthrough();

const manifestEnvelopeSchema = z
    .object({
        recordType: z.literal("manifest"),
        manifest: z.unknown(),
    })
    .strict();

const frameEnvelopeSchema = z
    .object({
        recordType: z.literal("frame"),
        frame: z.unknown(),
    })
    .strict();

const manifestVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

const frameIndexProbeSchema = z
    .object({
        frameIndex: z.number().finite().optional(),
    })
    .passthrough();

const frameTimestampProbeSchema = z
    .object({
        timestamp: z
            .object({
                mediaTimeMs: z.unknown().optional(),
            })
            .optional(),
    })
    .passthrough();

/**
 * motion-debug NDJSON の manifest record。
 *
 * camera settings は scrub 済み field だけを受け、raw device label / MediaStreamTrack / browser permission
 * object は schema の strict object で reject する。
 */
export type SincroMotionDebugLogManifest = z.infer<typeof motionDebugLogManifestSchema>;

/**
 * motion-debug NDJSON の frame record。
 *
 * `timestamp.mediaTimeMs` と `video` は replay / metrics の時刻・解像度基準として必須にし、各 motion
 * layer は旧 log 互換のため optional `unknown` slot として保持する。
 */
export type SincroMotionDebugFrame = z.infer<typeof motionDebugFrameSchema>;

/**
 * manifest または frame の line-level union。
 *
 * 通常 caller は `parseMotionDebugLogLines()` を使い、line ごとの schema は直接公開 parser としては扱わない。
 */
export type SincroMotionDebugLogLine = z.infer<typeof motionDebugLogLineSchema>;

/**
 * parser が caller へ返す固定 error code。
 *
 * `unknown_schema_version` は manifest の version mismatch 専用で、optional layer の schema mismatch は
 * viewer layer 側の parse error として扱う。
 */
export type SincroMotionDebugLogParseErrorCode =
    | "empty_input"
    | "invalid_json"
    | "missing_manifest"
    | "frame_before_manifest"
    | "unknown_schema_version"
    | "invalid_frame_index"
    | "missing_timestamp"
    | "invalid_record";

/**
 * NDJSON line 単位の parse error。
 *
 * `lineIndex: null` は空入力や最終的な manifest 欠損など、特定行に結びつかない失敗を表す。
 */
export type SincroMotionDebugLogParseError = {
    code: SincroMotionDebugLogParseErrorCode;
    lineIndex: number | null;
    message: string;
};

/**
 * motion-debug log parser の戻り値。
 *
 * 失敗時は最初に検出した境界違反を `errors` に入れて返し、例外は投げない。成功時の frame 配列は
 * 入力順を維持し、frameIndex の連番補正や欠番補完は行わない。
 */
export type SincroMotionDebugLogParseResult =
    | { ok: true; manifest: SincroMotionDebugLogManifest; frames: SincroMotionDebugFrame[] }
    | { ok: false; errors: SincroMotionDebugLogParseError[] };

type JsonLineParseResult =
    | { ok: true; value: unknown }
    | { ok: false; error: SincroMotionDebugLogParseError };

function parseJsonLine(line: string, lineIndex: number): JsonLineParseResult {
    try {
        const value: unknown = JSON.parse(line);
        return { ok: true, value };
    } catch {
        return {
            ok: false,
            error: {
                code: "invalid_json",
                lineIndex,
                message: "Motion debug log line is not valid JSON.",
            },
        };
    }
}

function createError(
    code: SincroMotionDebugLogParseErrorCode,
    lineIndex: number | null,
    message: string,
): SincroMotionDebugLogParseError {
    return { code, lineIndex, message };
}

function readRecordType(
    value: unknown,
    lineIndex: number,
): string | SincroMotionDebugLogParseError {
    const result = recordTypeProbeSchema.safeParse(value);
    if (!result.success) {
        return createError("invalid_record", lineIndex, "Motion debug log recordType is missing.");
    }
    return result.data.recordType;
}

function parseManifestLine(
    value: unknown,
    lineIndex: number,
): SincroMotionDebugLogManifest | SincroMotionDebugLogParseError {
    const envelope = manifestEnvelopeSchema.safeParse(value);
    if (!envelope.success) {
        return createError("invalid_record", lineIndex, "Motion debug manifest record is invalid.");
    }

    const versionProbe = manifestVersionProbeSchema.safeParse(envelope.data.manifest);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION
    ) {
        return createError(
            "unknown_schema_version",
            lineIndex,
            "Motion debug log schemaVersion is not supported.",
        );
    }

    const manifest = motionDebugLogManifestSchema.safeParse(envelope.data.manifest);
    if (!manifest.success) {
        return createError("invalid_record", lineIndex, "Motion debug manifest schema is invalid.");
    }
    return manifest.data;
}

function parseFrameLine(
    value: unknown,
    lineIndex: number,
): SincroMotionDebugFrame | SincroMotionDebugLogParseError {
    const envelope = frameEnvelopeSchema.safeParse(value);
    if (!envelope.success) {
        return createError("invalid_record", lineIndex, "Motion debug frame record is invalid.");
    }

    const frameIndexProbe = frameIndexProbeSchema.safeParse(envelope.data.frame);
    if (frameIndexProbe.success && frameIndexProbe.data.frameIndex !== undefined) {
        if (frameIndexProbe.data.frameIndex < 0) {
            return createError(
                "invalid_frame_index",
                lineIndex,
                "Motion debug frameIndex is negative.",
            );
        }
    }

    const timestampProbe = frameTimestampProbeSchema.safeParse(envelope.data.frame);
    if (
        timestampProbe.success &&
        (timestampProbe.data.timestamp === undefined ||
            timestampProbe.data.timestamp.mediaTimeMs === undefined)
    ) {
        return createError(
            "missing_timestamp",
            lineIndex,
            "Motion debug frame timestamp.mediaTimeMs is missing.",
        );
    }

    const frame = motionDebugFrameSchema.safeParse(envelope.data.frame);
    if (!frame.success) {
        return createError("invalid_record", lineIndex, "Motion debug frame schema is invalid.");
    }
    return frame.data;
}

/**
 * NDJSON lines を manifest と replay frames に変換する。
 *
 * 受理する schemaVersion は `sincro.motion-debug-log.v1` のみ。1 行目は manifest 必須で、manifest の
 * 再出現、負の frameIndex、`timestamp.mediaTimeMs` 欠損、unknown recordType は reject する。optional
 * layer の invalid schema はここでは reject せず、viewer / metrics の layer parser が `invalid` 表示へ
 * 変換する。
 */
export function parseMotionDebugLogLines(lines: string[]): SincroMotionDebugLogParseResult {
    if (lines.length === 0) {
        return {
            ok: false,
            errors: [createError("empty_input", null, "Motion debug log has no lines.")],
        };
    }

    let manifest: SincroMotionDebugLogManifest | undefined;
    const frames: SincroMotionDebugFrame[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const jsonLine = parseJsonLine(lines[lineIndex] ?? "", lineIndex);
        if (!jsonLine.ok) {
            return { ok: false, errors: [jsonLine.error] };
        }
        const parsedLine = jsonLine.value;

        const recordType = readRecordType(parsedLine, lineIndex);
        if (typeof recordType === "object") {
            return { ok: false, errors: [recordType] };
        }

        if (lineIndex === 0 && recordType === "frame") {
            return {
                ok: false,
                errors: [
                    createError(
                        "frame_before_manifest",
                        lineIndex,
                        "Motion debug frame record appeared before the manifest.",
                    ),
                ],
            };
        }
        if (lineIndex === 0 && recordType !== "manifest") {
            return {
                ok: false,
                errors: [
                    createError(
                        "missing_manifest",
                        lineIndex,
                        "Motion debug log first line is not a manifest.",
                    ),
                ],
            };
        }

        if (recordType === "manifest") {
            if (lineIndex !== 0 || manifest !== undefined) {
                return {
                    ok: false,
                    errors: [
                        createError(
                            "invalid_record",
                            lineIndex,
                            "Motion debug manifest must be first.",
                        ),
                    ],
                };
            }
            const parsedManifest = parseManifestLine(parsedLine, lineIndex);
            if (typeof parsedManifest === "object" && "code" in parsedManifest) {
                return { ok: false, errors: [parsedManifest] };
            }
            manifest = parsedManifest;
            continue;
        }

        if (recordType === "frame") {
            if (manifest === undefined) {
                return {
                    ok: false,
                    errors: [
                        createError(
                            "frame_before_manifest",
                            lineIndex,
                            "Motion debug frame record appeared before the manifest.",
                        ),
                    ],
                };
            }
            const frame = parseFrameLine(parsedLine, lineIndex);
            if (typeof frame === "object" && "code" in frame) {
                return { ok: false, errors: [frame] };
            }
            frames.push(frame);
            continue;
        }

        return {
            ok: false,
            errors: [
                createError(
                    "invalid_record",
                    lineIndex,
                    "Motion debug log recordType is unsupported.",
                ),
            ],
        };
    }

    if (manifest === undefined) {
        return {
            ok: false,
            errors: [
                createError("missing_manifest", null, "Motion debug log manifest is missing."),
            ],
        };
    }

    return { ok: true, manifest, frames };
}
