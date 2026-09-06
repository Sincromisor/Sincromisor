/** 動作記録の記録情報・フレームの形式と解析結果の型を定義する。
 * 任意の動作層は表示側で個別に解析するため unknown のまま保持する。
 * 行順と解析エラーの優先順位は motionDebugLogSchema が検証する。 */
import { z } from "zod";

/** 受理する動作記録の版。異なる版は任意項目の欠損として補わず、記録全体を拒否する。 */
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

/** 記録情報の保存形式。機器の未加工情報を追加キーとして受理しない。 */
export const motionDebugLogManifestSchema = z
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

/** 再生に必要な時刻と映像寸法を検証し、任意の動作層は未解析で保持する。 */
export const motionDebugFrameSchema = z
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

/** 記録の実行環境と入力元を表す。カメラ設定は秘匿情報を除いた項目だけを受理する。 */
export type SincroMotionDebugLogManifest = z.infer<typeof motionDebugLogManifestSchema>;

/** 動画内の時刻と映像寸法を持つフレーム。動作層は古い記録の欠損を許すため任意とする。 */
export type SincroMotionDebugFrame = z.infer<typeof motionDebugFrameSchema>;

/** 保存する1行の形式。行順を含む検証には parseMotionDebugLogLines を使う。 */
export type SincroMotionDebugLogLine = z.infer<typeof motionDebugLogLineSchema>;

/** 呼び出し元へ返す解析エラーの種別。未知の版は記録情報に対する違反を表す。 */
export type SincroMotionDebugLogParseErrorCode =
    | "empty_input"
    | "invalid_json"
    | "missing_manifest"
    | "frame_before_manifest"
    | "unknown_schema_version"
    | "invalid_frame_index"
    | "missing_timestamp"
    | "invalid_record";

/** 入力行に結び付く解析エラー。lineIndex の null は空入力など特定行を持たない失敗を表す。 */
export type SincroMotionDebugLogParseError = {
    code: SincroMotionDebugLogParseErrorCode;
    lineIndex: number | null;
    message: string;
};

/** 成功時は入力順のフレームを返す。失敗時は最初の違反だけを返し、例外や番号の補正は行わない。 */
export type SincroMotionDebugLogParseResult =
    | { ok: true; manifest: SincroMotionDebugLogManifest; frames: SincroMotionDebugFrame[] }
    | { ok: false; errors: SincroMotionDebugLogParseError[] };
