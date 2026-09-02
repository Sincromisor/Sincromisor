#!/usr/bin/env node
/**
 * タスクの close / FAIL 記録を 1 コマンドで確定する（meta 更新 → コミット）。
 * /run-task §5 の定型手順を統合し、オーケストレーターの手作業と漏れ
 * （成果物の後追いコミット等）を無くす。Node / Bun 両対応・依存は yaml のみ。
 *
 *   node scripts/tasks/closeTask.mjs <task-dir> verdict=PASS attempts=1             # close（status=done, closed_at 自動）
 *   node scripts/tasks/closeTask.mjs <task-dir> verdict=FAIL attempts=2             # FAIL 記録（status は open のまま）
 *   node scripts/tasks/closeTask.mjs <task-dir> verdict=PASS attempts=1 --dry-run   # 実行内容の表示のみ
 *
 * - コミット対象は **自タスクディレクトリのみ**（task.md / meta.yaml / review.md / impl.md /
 *   eval.md / acceptance/）。close 後に後追いコミットを残さない。
 * - **グローバル index 再生成は close から分離した**。カテゴリ `index.md` の再生成・コミットは
 *   基点ブランチ上で直列に 1 回走る独立ステップ `tasks:reindex`（genIndex + コミット）が担う。
 *   これにより per-task close は互いに素なパスのみ触り、並列・worktree マージで衝突しない。
 * - status の語彙・closed_at 自動設定は setMeta.mjs に委譲する（検証ロジックの二重管理を避ける）。
 * - フォーマッタが Markdown を対象とするプロジェクトでは、本コマンドの前に md 成果物を
 *   整形しておくこと（または本スクリプトに整形ステップを足してカスタマイズする）。
 * - 基点ブランチへのマージ後に実行すること（tasks/README.md「ブランチライフサイクル」）。
 *
 * コミットメッセージ:
 * - 件名は日本語の定型文とし、タスクIDと判定を含める。
 * - 本文は判定、試行回数、確認、残る判断事項を一段落の日本語散文にまとめ、`Refs:`だけを
 *   履歴検索用のフッターとして分離する。
 * - 本文形式は展開先 `package.json`（作業ディレクトリ）の `taskClose.commitTemplate` で上書き
 *   できる。プレースホルダー: `{id}` / `{verdict}` / `{attempts}` / `{taskDir}`。未設定 /
 *   不在 / 解析失敗時は既定本文へ戻す（完了処理を止めない）。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildCloseCommitBody,
    buildCloseCommitPaths,
    getPrivateTaskArtifactReason,
    readCommitTemplate,
    readMeta,
} from "./lib.mjs";

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

/**
 * task 配下を再帰検査し、非公開検証原本がclose commitへ混入する前に停止する。
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function findPrivateArtifacts(dir) {
    const violations = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            violations.push(...(await findPrivateArtifacts(path)));
        } else if (entry.isFile()) {
            const { size } = await stat(path);
            const reason = getPrivateTaskArtifactReason(path, size);
            if (reason) violations.push(`${path} (${reason})`);
        }
    }
    return violations;
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
    const privateArtifacts = await findPrivateArtifacts(taskDir);
    if (privateArtifacts.length > 0) {
        fail(
            [
                "非公開またはrawの検証artifactがtask配下にあります。",
                `work/private-artifacts/${meta.id}/ へ移し、taskには集計結果・SHA-256・再現手順だけを残してください:`,
                ...privateArtifacts.map((path) => `  - ${path}`),
            ].join("\n"),
        );
    }
    // FAIL は open のまま（再実装候補として残す）
    const setArgs =
        verdict === "PASS"
            ? ["status=done", "verdict=PASS", `attempts=${attempts}`]
            : ["verdict=FAIL", `attempts=${attempts}`];
    const subject =
        verdict === "PASS"
            ? `chore(tasks): ${meta.id}をPASSとして完了`
            : `chore(tasks): ${meta.id}のFAIL判定を記録`;
    const template = await readCommitTemplate();
    const body = buildCloseCommitBody({ id: meta.id, verdict, attempts, taskDir }, template);

    const node = process.execPath; // 呼び出し元と同じランタイム（node / bun）で子スクリプトを回す
    // close のコミット対象は自タスクディレクトリのみ（index.md は tasks:reindex が別途扱う）
    const commitPaths = buildCloseCommitPaths(taskDir);
    const steps = [
        [node, join(SCRIPTS_DIR, "setMeta.mjs"), taskDir, ...setArgs],
        ["git", "add", ...commitPaths],
        // `body`は改行・記号を含むため引数配列でそのまま渡す（シェル補間を経由しない）。
        ["git", "commit", "-m", subject, "-m", body],
    ];
    if (dryRun) {
        console.log("[dry-run] 実行予定:");
        for (const s of steps) console.log(`  ${s.join(" ")}`);
        console.log("\n[dry-run] コミットメッセージ:");
        console.log(subject);
        console.log("");
        console.log(body);
        return;
    }

    run(steps[0]);
    run(steps[1]);
    const staged = capture(["git", "diff", "--cached", "--name-only"]).trim();
    if (!staged) fail("コミット対象の差分がありません（meta は既に同じ値の可能性）");
    run(steps[2]);
    console.log(`\n完了処理: ${meta.id}（verdict=${verdict} attempts=${attempts}）`);
}

await main();
