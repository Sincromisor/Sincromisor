import { describe, expect, test } from "bun:test";
import { buildCloseCommitPaths } from "../lib.mjs";

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
