/** 動作記録の先頭行を記録情報として確定し、後続フレームを入力順に検証する。 */
import { z } from "zod";
import {
    motionDebugFrameSchema,
    motionDebugLogManifestSchema,
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugFrame,
    type SincroMotionDebugLogManifest,
    type SincroMotionDebugLogParseError,
    type SincroMotionDebugLogParseErrorCode,
    type SincroMotionDebugLogParseResult,
} from "./motionDebugRecordSchema";

export {
    SINCRO_MOTION_DEBUG_LOG_SCHEMA_VERSION,
    type SincroMotionDebugFrame,
    type SincroMotionDebugLogLine,
    type SincroMotionDebugLogManifest,
    type SincroMotionDebugLogParseError,
    type SincroMotionDebugLogParseErrorCode,
    type SincroMotionDebugLogParseResult,
} from "./motionDebugRecordSchema";

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

type JsonLineParseResult =
    | { ok: true; value: unknown }
    | { ok: false; error: SincroMotionDebugLogParseError };

/** JSON構文エラーを例外として漏らさず、入力行に結び付けて返す。 */
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

/** 記録情報は外枠、版、内容の順で検証し、最初の違反を返す。 */
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

/** フレームは外枠、負の番号、時刻欠損、内容の順で検証する。 */
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

/** 内容の検証より先に構文と種別を確認し、行順違反の判定材料を返す。 */
function readJsonRecord(
    line: string,
    lineIndex: number,
): { value: unknown; recordType: string } | SincroMotionDebugLogParseError {
    const json = parseJsonLine(line, lineIndex);
    if (!json.ok) return json.error;
    const recordType = readRecordType(json.value, lineIndex);
    if (typeof recordType === "object") return recordType;
    return { value: json.value, recordType };
}

/** 先頭行は記録情報だけを受理し、フレーム先行を専用エラーとして区別する。 */
function parseFirstManifest(
    line: string,
): SincroMotionDebugLogManifest | SincroMotionDebugLogParseError {
    const record = readJsonRecord(line, 0);
    if ("code" in record) return record;
    if (record.recordType === "frame") {
        return createError(
            "frame_before_manifest",
            0,
            "Motion debug frame record appeared before the manifest.",
        );
    }
    if (record.recordType !== "manifest") {
        return createError("missing_manifest", 0, "Motion debug log first line is not a manifest.");
    }
    return parseManifestLine(record.value, 0);
}

/** 記録情報が確定した後は、再出現した記録情報と未知の種別を内容検証より先に拒否する。 */
function parseFollowingFrame(
    line: string,
    lineIndex: number,
): SincroMotionDebugFrame | SincroMotionDebugLogParseError {
    const record = readJsonRecord(line, lineIndex);
    if ("code" in record) return record;
    if (record.recordType === "manifest") {
        return createError("invalid_record", lineIndex, "Motion debug manifest must be first.");
    }
    if (record.recordType !== "frame") {
        return createError(
            "invalid_record",
            lineIndex,
            "Motion debug log recordType is unsupported.",
        );
    }
    return parseFrameLine(record.value, lineIndex);
}

/**
 * NDJSONの記録情報とフレームを検証し、入力順を維持して返す。
 * 任意の動作層はここで解析せず、表示・指標計算側へ委ねる。
 * 失敗時は最初の違反のコード・行番号・文言を返し、例外は投げない。
 */
export function parseMotionDebugLogLines(lines: string[]): SincroMotionDebugLogParseResult {
    if (lines.length === 0) {
        return {
            ok: false,
            errors: [createError("empty_input", null, "Motion debug log has no lines.")],
        };
    }
    const manifest = parseFirstManifest(lines[0] ?? "");
    if ("code" in manifest) return { ok: false, errors: [manifest] };

    const frames: SincroMotionDebugFrame[] = [];
    for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
        const frame = parseFollowingFrame(lines[lineIndex] ?? "", lineIndex);
        if ("code" in frame) return { ok: false, errors: [frame] };
        frames.push(frame);
    }
    return { ok: true, manifest, frames };
}
