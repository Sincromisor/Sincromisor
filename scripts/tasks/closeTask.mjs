#!/usr/bin/env node
/**
 * タスクの close / FAIL 記録を 1 コマンドで確定する（meta 更新 → index 再生成 → コミット）。
 * /run-task §5 の定型手順を統合し、オーケストレーターの手作業と漏れ
 * （成果物の後追いコミット等）を無くす。Node / Bun 両対応・依存は yaml のみ。
 *
 *   node scripts/tasks/closeTask.mjs <task-dir> verdict=PASS attempts=1             # close（status=done, closed_at 自動）
 *   node scripts/tasks/closeTask.mjs <task-dir> verdict=FAIL attempts=2             # FAIL 記録（status は open のまま）
 *   node scripts/tasks/closeTask.mjs <task-dir> verdict=PASS attempts=1 --dry-run   # 実行内容の表示のみ
 *
 * - コミット対象は **タスクディレクトリ一式**（task.md / meta.yaml / review.md / impl.md /
 *   eval.md / acceptance/）+ 該当カテゴリの index.md。close 後に後追いコミットを残さない。
 * - status の語彙・closed_at 自動設定は setMeta.mjs に委譲する（検証ロジックの二重管理を避ける）。
 * - フォーマッタが Markdown を対象とするプロジェクトでは、本コマンドの前に md 成果物を
 *   整形しておくこと（または本スクリプトに整形ステップを足してカスタマイズする）。
 * - 基点ブランチへのマージ後に実行すること（tasks/README.md「ブランチライフサイクル」）。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readMeta } from "./lib.mjs";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

function fail(msg) {
    console.error(`エラー: ${msg}`);
    process.exit(1);
}

/** @param {string[]} argv */
function run(argv) {
    execFileSync(argv[0], argv.slice(1), { stdio: "inherit" });
}

/** @param {string[]} argv @returns {string} */
function capture(argv) {
    return execFileSync(argv[0], argv.slice(1), { encoding: "utf8" });
}

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const positional = args.filter((a) => a !== "--dry-run");
    const [taskDirRaw, ...pairs] = positional;
    if (!taskDirRaw) {
        fail("使い方: closeTask.mjs <task-dir> verdict=PASS|FAIL attempts=<n> [--dry-run]");
    }
    const taskDir = taskDirRaw.replace(/\/+$/, "");

    const metaPath = join(taskDir, "meta.yaml");
    if (!existsSync(metaPath)) fail(`meta.yaml が見つかりません: ${metaPath}`);

    let verdict = null;
    let attempts = null;
    for (const pair of pairs) {
        const eq = pair.indexOf("=");
        const key = eq === -1 ? pair : pair.slice(0, eq);
        const value = eq === -1 ? "" : pair.slice(eq + 1);
        if (key === "verdict") {
            if (value !== "PASS" && value !== "FAIL") fail(`verdict は PASS|FAIL: ${value}`);
            verdict = value;
        } else if (key === "attempts") {
            const n = Number(value);
            if (!Number.isInteger(n) || n < 0) fail(`attempts は 0 以上の整数: ${value}`);
            attempts = n;
        } else {
            fail(`未知の引数: ${pair}（verdict= / attempts= / --dry-run のみ受け付ける）`);
        }
    }
    if (verdict === null) fail("verdict=PASS|FAIL を指定してください");
    if (attempts === null) fail("attempts=<n> を指定してください");

    const meta = await readMeta(metaPath);
    const categoryIndex = join(dirname(taskDir), "index.md");
    // FAIL は open のまま（再実装候補として残す）
    const setArgs =
        verdict === "PASS"
            ? ["status=done", "verdict=PASS", `attempts=${attempts}`]
            : ["verdict=FAIL", `attempts=${attempts}`];
    const message =
        verdict === "PASS"
            ? `chore(tasks): close ${meta.id} (PASS, attempts=${attempts})`
            : `chore(tasks): record verdict=FAIL attempts=${attempts} (${meta.id})`;

    const node = process.execPath; // 呼び出し元と同じランタイム（node / bun）で子スクリプトを回す
    const steps = [
        [node, join(SCRIPTS_DIR, "setMeta.mjs"), taskDir, ...setArgs],
        [node, join(SCRIPTS_DIR, "genIndex.mjs")],
        ["git", "add", taskDir, categoryIndex],
        ["git", "commit", "-m", message],
    ];
    if (dryRun) {
        console.log("[dry-run] 実行予定:");
        for (const s of steps) console.log(`  ${s.join(" ")}`);
        return;
    }

    run(steps[0]);
    run(steps[1]);
    run(steps[2]);
    const staged = capture(["git", "diff", "--cached", "--name-only"]).trim();
    if (!staged) fail("コミット対象の差分がありません（meta は既に同じ値の可能性）");
    run(steps[3]);
    console.log(`\nclose 完了: ${meta.id}（verdict=${verdict} attempts=${attempts}）`);
}

await main();
