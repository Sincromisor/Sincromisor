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
