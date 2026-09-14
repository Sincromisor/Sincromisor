import type { SincroMotionDebugLogManifest } from "../../character/motionEvaluation/motionDebugLogSchema";

const GIT_COMMIT_PATTERN = /^[0-9a-f]{7,40}$/;

/**
 * build-time commit 候補を motion-debug manifest に保存できる canonical hash へ正規化する。
 *
 * build / CI が値を注入しない dev build、空白、`unknown`、Git hash 形式でない値は省略する。
 * 省略は recording failure ではなく、provenance が取得できない正常な build variant として扱う。
 */
export function normalizeMotionDebugBuildGitCommit(value: string | undefined): string | undefined {
    const normalized = value?.trim().toLowerCase();
    if (normalized === undefined || !GIT_COMMIT_PATTERN.test(normalized)) {
        return undefined;
    }
    return normalized;
}

/** キー順に依存しない構成ハッシュを記録し、実験条件を照合できるようにする。 */
export function createPipelineConfigHash(
    pipeline: SincroMotionDebugLogManifest["pipeline"],
): string {
    return `fnv1a32:${fnv1a32(stableJsonStringify(pipeline))}`;
}

function stableJsonStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableJsonStringify).join(",")}]`;
    }
    if (isPlainRecord(value)) {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fnv1a32(value: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
