import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * genIndex.mjs の冪等性を担保する: 直列 reindex（tasks:reindex）が何度走っても収束し、
 * 既に最新な index.md には書き込まない（= close から分離した index コミットが空転しない）。
 *
 * genIndex.mjs は TASKS_ROOT（既定 "tasks"）を cwd 相対に走査するため、隔離した一時
 * ディレクトリに fixture を置き、その cwd でスクリプトを subprocess 実行して挙動を観測する。
 */

const TASKS_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const GEN_INDEX = join(TASKS_DIR, "genIndex.mjs");

let tmp;

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "kit-genindex-idem-"));
});
afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

function writeMeta(taskDir, id, category) {
    mkdirSync(taskDir, { recursive: true });
    const meta = [
        `id: ${id}`,
        `title: ${id}`,
        `category: ${category}`,
        "status: open",
        "depends_on: []",
        "superseded_by: null",
        "review: null",
        "reviewed_sha: null",
        "verdict: null",
        "attempts: 0",
        "created_at: 2026-06-17",
        "closed_at: null",
        "",
    ].join("\n");
    writeFileSync(join(taskDir, "meta.yaml"), meta);
    writeFileSync(join(taskDir, "task.md"), `# ${id}\n`);
}

function run(args) {
    const res = spawnSync(process.execPath, [GEN_INDEX, ...args], {
        cwd: tmp,
        stdio: "ignore",
    });
    return { exitCode: res.status ?? -1 };
}

describe("genIndex 冪等性（直列 reindex の収束）", () => {
    test("生成 → 再生成で index.md の内容が一致（差分ゼロ）", () => {
        writeMeta(join(tmp, "tasks", "chore", "task-260101000000-a"), "task-260101000000-a", "chore");
        const indexPath = join(tmp, "tasks", "chore", "index.md");

        expect(run([]).exitCode).toBe(0);
        const afterFirst = readFileSync(indexPath, "utf8");

        expect(run([]).exitCode).toBe(0);
        const afterSecond = readFileSync(indexPath, "utf8");

        expect(afterSecond).toBe(afterFirst);
    });

    test("生成済みなら --check は exit 0（変更なし）", () => {
        writeMeta(join(tmp, "tasks", "chore", "task-260101000000-a"), "task-260101000000-a", "chore");
        run([]);
        expect(run(["--check"]).exitCode).toBe(0);
    });

    test("未生成なら --check は exit 1（古い index を検出）", () => {
        writeMeta(join(tmp, "tasks", "chore", "task-260101000000-a"), "task-260101000000-a", "chore");
        expect(run(["--check"]).exitCode).toBe(1);
    });
});
