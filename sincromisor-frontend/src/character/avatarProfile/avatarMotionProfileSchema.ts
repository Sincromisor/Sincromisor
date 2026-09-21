/** 保存データの検証境界。計測処理を読み込まず、検証後の値を複製して返す。 */
import { z } from "zod";
import { cloneAvatarMotionProfile } from "./avatarMotionProfileClone";
import {
    AVATAR_MOTION_PROFILE_BONE_NAMES,
    AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
    type AvatarMotionProfile,
    type AvatarMotionProfileParseError,
    type AvatarMotionProfileParseResult,
} from "./avatarMotionProfileTypes";

const finiteNumberSchema = z.number();
const positiveFiniteNumberSchema = finiteNumberSchema.positive();
const zeroToOneSchema = finiteNumberSchema.min(0).max(1);
const boneNameSchema = z.enum(AVATAR_MOTION_PROFILE_BONE_NAMES);
const quaternionTupleSchema = z.tuple([
    finiteNumberSchema,
    finiteNumberSchema,
    finiteNumberSchema,
    finiteNumberSchema,
]);

// 配分は各値の範囲と合計1（許容差0.001）を検証し、未知キーを拒否する。
const distributionSchema = z
    .object({
        spine: zeroToOneSchema,
        chest: zeroToOneSchema,
        upperChest: zeroToOneSchema,
    })
    .strict()
    .refine((value) => isCloseToOne(value.spine + value.chest + value.upperChest), {
        message: "Torso distribution must sum to 1.",
    });

const twistShareSchema = z
    .object({
        lowerArmTwistShare: zeroToOneSchema,
        handTwistShare: zeroToOneSchema,
    })
    .strict()
    .refine((value) => isCloseToOne(value.lowerArmTwistShare + value.handTwistShare), {
        message: "Wrist twist shares must sum to 1.",
    });

const fingerDistributionSchema = z
    .object({
        proximal: zeroToOneSchema,
        intermediate: zeroToOneSchema,
        distal: zeroToOneSchema,
    })
    .strict()
    .refine((value) => isCloseToOne(value.proximal + value.intermediate + value.distal), {
        message: "Finger curl distribution must sum to 1.",
    });

const fingerChainSchema = z
    .object({
        proximal: z.boolean(),
        intermediate: z.boolean(),
        distal: z.boolean(),
    })
    .strict();

const sideFingerChainsSchema = z
    .object({
        thumb: fingerChainSchema,
        index: fingerChainSchema,
        middle: fingerChainSchema,
        ring: fingerChainSchema,
        little: fingerChainSchema,
    })
    .strict();

// 入れ子も厳密に検証する。ボーン辞書は既知名の部分集合だけを受理する。
const avatarMotionProfileSchema: z.ZodType<AvatarMotionProfile> = z
    .object({
        schemaVersion: z.literal(AVATAR_MOTION_PROFILE_SCHEMA_VERSION),
        model: z
            .object({
                vrmVersion: z.enum(["1.0", "unknown"]),
                modelName: z.string().optional(),
            })
            .strict(),
        capabilities: z
            .object({
                bones: z.partialRecord(boneNameSchema, z.boolean()),
                fingerChains: z
                    .object({
                        left: sideFingerChainsSchema,
                        right: sideFingerChainsSchema,
                    })
                    .strict(),
            })
            .strict(),
        restLocalRotation: z.partialRecord(boneNameSchema, quaternionTupleSchema),
        metrics: z
            .object({
                shoulderWidth: positiveFiniteNumberSchema.optional(),
                torsoLength: positiveFiniteNumberSchema.optional(),
                headSize: positiveFiniteNumberSchema.optional(),
                upperArmLength: z
                    .object({
                        left: positiveFiniteNumberSchema.optional(),
                        right: positiveFiniteNumberSchema.optional(),
                    })
                    .strict(),
                lowerArmLength: z
                    .object({
                        left: positiveFiniteNumberSchema.optional(),
                        right: positiveFiniteNumberSchema.optional(),
                    })
                    .strict(),
                handSize: z
                    .object({
                        left: positiveFiniteNumberSchema.optional(),
                        right: positiveFiniteNumberSchema.optional(),
                    })
                    .strict(),
            })
            .strict(),
        torso: z
            .object({
                distribution: distributionSchema,
                chestFollow: zeroToOneSchema,
            })
            .strict(),
        arm: z
            .object({
                reachScale: finiteNumberSchema.min(0.5).max(1.2),
                lateralScale: finiteNumberSchema.min(0.5).max(1.2),
                verticalScale: finiteNumberSchema.min(0.5).max(1.2),
                depthCompression: finiteNumberSchema.min(0.2).max(0.9),
                elbowOutwardBias: finiteNumberSchema.min(0).max(0.6),
                shoulderDamping: zeroToOneSchema,
            })
            .strict(),
        wrist: z
            .object({
                wristRollInfluence: zeroToOneSchema,
                ...twistShareSchema.shape,
            })
            .strict()
            .refine((value) => isCloseToOne(value.lowerArmTwistShare + value.handTwistShare), {
                message: "Wrist twist shares must sum to 1.",
            }),
        fingers: z
            .object({
                curlScale: finiteNumberSchema.min(0).max(1.2),
                curlMode: z.enum(["grouped", "perFinger"]),
                curlDistribution: fingerDistributionSchema,
                splayLimitDeg: finiteNumberSchema.min(0).max(30),
            })
            .strict(),
        risk: z
            .object({
                smallBodyLargeHead: zeroToOneSchema,
                missingUpperChest: z.boolean(),
                missingShoulders: z.boolean(),
                constraintRisk: zeroToOneSchema,
            })
            .strict(),
        warnings: z.array(z.string()),
    })
    .strict();

// 版違いは構造エラーより先に分類するため、版だけを先行して読む。
const schemaVersionProbeSchema = z
    .object({
        schemaVersion: z.string().optional(),
    })
    .passthrough();

/** 保存用プロファイルを検証し、版・構造・数値範囲の失敗を呼び出し元へ返す。入力は変更しない。 */
export function parseAvatarMotionProfile(value: unknown): AvatarMotionProfileParseResult {
    const versionProbe = schemaVersionProbeSchema.safeParse(value);
    if (
        versionProbe.success &&
        versionProbe.data.schemaVersion !== undefined &&
        versionProbe.data.schemaVersion !== AVATAR_MOTION_PROFILE_SCHEMA_VERSION
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_schema_version",
                    path: ["schemaVersion"],
                    message: "Avatar motion profile schemaVersion is not supported.",
                },
            ],
        };
    }
    const plainObjectErrors = collectPlainObjectErrors(value, []);
    if (plainObjectErrors.length > 0) {
        return { ok: false, errors: plainObjectErrors };
    }
    const parsed = avatarMotionProfileSchema.safeParse(value);
    if (!parsed.success) {
        return {
            ok: false,
            errors: parsed.error.issues.map((issue) => ({
                code: classifyIssue(issue),
                path: zodPathToStrings(issue.path),
                message: issue.message,
            })),
        };
    }
    return { ok: true, profile: cloneAvatarMotionProfile(parsed.data) };
}

// Zodによる構造検証前に、入れ子のクラスインスタンスを経路付きで拒否する。
function collectPlainObjectErrors(value: unknown, path: string[]): AvatarMotionProfileParseError[] {
    if (Array.isArray(value)) {
        return value.flatMap((item, index) =>
            collectPlainObjectErrors(item, [...path, String(index)]),
        );
    }
    if (value === null || typeof value !== "object") {
        return [];
    }
    if (!isPlainRecord(value)) {
        return [
            {
                code: "invalid_state",
                path,
                message: "Avatar motion profile must contain only plain objects and arrays.",
            },
        ];
    }
    return Object.entries(value).flatMap(([key, nested]) =>
        collectPlainObjectErrors(nested, [...path, key]),
    );
}

function isPlainRecord(value: object): boolean {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function zodPathToStrings(path: readonly PropertyKey[]): string[] {
    return path.map((segment) => String(segment));
}

// Zod の翻訳可能な文言ではなく構造化された分類を使い、非有限数を既存の範囲エラーへ揃える。
function classifyIssue(issue: z.core.$ZodIssue): AvatarMotionProfileParseError["code"] {
    if (
        issue.code === "custom" ||
        ((issue.code === "too_small" || issue.code === "too_big") &&
            "origin" in issue &&
            issue.origin === "number") ||
        (issue.code === "invalid_type" &&
            issue.expected === "number" &&
            "received" in issue &&
            ["NaN", "Infinity", "-Infinity"].includes(String(issue.received)))
    ) {
        return "out_of_range";
    }
    return "invalid_state";
}

function isCloseToOne(value: number): boolean {
    return Number.isFinite(value) && Math.abs(value - 1) <= 0.001;
}
