import { describe, expect, test } from "bun:test";
import {
    buildCloseCommitPaths,
    getPrivateTaskArtifactReason,
    MAX_PUBLIC_TASK_ARTIFACT_BYTES,
} from "../lib.mjs";

describe("buildCloseCommitPaths（close のコミット対象パス集合）", () => {
    test("自タスクディレクトリのみを返す", () => {
        const paths = buildCloseCommitPaths("tasks/chore/task-260101000000-fixture");
        expect(paths).toEqual(["tasks/chore/task-260101000000-fixture"]);
    });

    test("カテゴリ index.md を含まない（グローバル index は tasks:reindex が扱う）", () => {
        const paths = buildCloseCommitPaths("tasks/chore/task-260101000000-fixture");
        expect(paths.some((p) => p.endsWith("index.md"))).toBe(false);
        expect(paths).not.toContain("tasks/chore/index.md");
    });

    test("タスク dir の外を触らない（互いに素: 別タスクの dir を含まない）", () => {
        const a = buildCloseCommitPaths("tasks/chore/task-A");
        const b = buildCloseCommitPaths("tasks/chore/task-B");
        const overlap = a.filter((p) => b.includes(p));
        expect(overlap).toEqual([]);
        expect(a.every((p) => p.startsWith("tasks/chore/task-A"))).toBe(true);
        expect(b.every((p) => p.startsWith("tasks/chore/task-B"))).toBe(true);
    });

    test("末尾スラッシュは正規化される（git diff --cached の判定と一致）", () => {
        expect(buildCloseCommitPaths("tasks/chore/fixture/")).toEqual(["tasks/chore/fixture"]);
        expect(buildCloseCommitPaths("tasks/chore/fixture///")).toEqual(["tasks/chore/fixture"]);
    });
});

describe("getPrivateTaskArtifactReason（非公開artifact境界）", () => {
    test("task artifact内の動画、screenshot、raw replayを拒否する", () => {
        expect(getPrivateTaskArtifactReason("tasks/a/task-1/artifacts/video/input.mp4", 10)).toContain(
            ".mp4",
        );
        expect(
            getPrivateTaskArtifactReason("tasks/a/task-1/artifacts/replay/capture.ndjson.gz", 10),
        ).toContain(".ndjson");
        expect(
            getPrivateTaskArtifactReason("tasks/a/task-1/artifacts/evidence/screenshot.png", 10),
        ).toContain(".png");
    });

    test("private directoryと巨大artifactを拒否する", () => {
        expect(
            getPrivateTaskArtifactReason("tasks/a/task-1/artifacts/private/source.bin", 10),
        ).toBe("private artifact directory");
        expect(
            getPrivateTaskArtifactReason(
                "tasks/a/task-1/artifacts/result.json",
                MAX_PUBLIC_TASK_ARTIFACT_BYTES + 1,
            ),
        ).toContain("exceeds");
    });

    test("小さな集計結果とtask外fixtureは許可する", () => {
        expect(getPrivateTaskArtifactReason("tasks/a/task-1/artifacts/summary.json", 100)).toBeNull();
        expect(getPrivateTaskArtifactReason("src/fixtures/replay.ndjson", 100)).toBeNull();
    });
});
