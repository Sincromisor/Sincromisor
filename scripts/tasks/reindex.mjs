#!/usr/bin/env node
/**
 * 全カテゴリ `<TASKS_ROOT>/<category>/index.md` を再生成し、変更があれば 1 コミットにまとめる
 * （`tasks:index` = 再生成のみ・no-commit に対し、`tasks:reindex` = 再生成 + コミット）。
 * Node / Bun 両対応・依存は yaml のみ。
 *
 *   node scripts/tasks/reindex.mjs            # 全 index 再生成 → 変更があれば chore(tasks): reindex で 1 コミット
 *   node scripts/tasks/reindex.mjs --dry-run  # 実行内容の表示のみ（再生成・コミットしない）
 *
 * 設計意図:
 * - グローバル index 再生成は per-task close から完全分離した独立ステップである。close は
 *   自タスク dir のみコミットし、index.md の再生成・コミットは**基点ブランチ上で直列に 1 回**
 *   走るこのステップが担う。マージは git により基点ブランチ上で直列化されるため、reindex も
 *   同じ直列区間に入り、index は常にマージ後の全体ビューから一意に生成される。
 * - 「生成」（`tasks:index` = genIndex.mjs。no-commit の既存契約を維持。CI の `tasks:index:check`
 *   が依存）と「確定（コミット）」（`tasks:reindex`）の責務を分ける。
 * - 再生成は genIndex.mjs に委譲する（冪等。変更が無ければ何も書かない / コミットしない）。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listDirs, TASKS_ROOT } from "./lib.mjs";

const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

/** @param {string[]} argv */
function run(argv) {
    execFileSync(argv[0], argv.slice(1), { stdio: "inherit" });
}

/** @param {string[]} argv @returns {string} */
function capture(argv) {
    return execFileSync(argv[0], argv.slice(1), { encoding: "utf8" });
}

/** 既存する全カテゴリ index.md のパスを列挙する（git add 対象を限定するため）。 */
async function listIndexPaths() {
    const out = [];
    for (const cat of await listDirs(TASKS_ROOT)) {
        const p = join(TASKS_ROOT, cat, "index.md");
        if (existsSync(p)) out.push(p);
    }
    return out;
}

async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const node = process.execPath; // 呼び出し元と同じランタイム（node / bun）で子スクリプトを回す

    if (dryRun) {
        console.log("[dry-run] 実行予定:");
        console.log(`  ${node} ${join(SCRIPTS_DIR, "genIndex.mjs")}`);
        console.log(`  git add <変更のあった ${TASKS_ROOT}/*/index.md>`);
        console.log('  git commit -m "chore(tasks): reindex"  （変更がある場合のみ）');
        return;
    }

    // 全カテゴリ index.md を再生成（冪等。差分が無ければ書き込まない）
    run([node, join(SCRIPTS_DIR, "genIndex.mjs")]);

    // index.md だけを stage（タスク dir 等の無関係な差分は巻き込まない）
    const indexPaths = await listIndexPaths();
    if (indexPaths.length > 0) run(["git", "add", ...indexPaths]);
    const staged = capture(["git", "diff", "--cached", "--name-only"]).trim();
    if (!staged) {
        console.log("\nreindex: index.md に変更はありません（コミットなし）");
        return;
    }

    run(["git", "commit", "-m", "chore(tasks): reindex"]);
    console.log(`\nreindex 完了: 以下の index.md をコミットしました\n${staged}`);
}

await main();
