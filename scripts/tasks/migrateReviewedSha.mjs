#!/usr/bin/env node
/**
 * 既存 meta.yaml に `reviewed_sha` フィールドを一括付与する移行スクリプト（dry-run 既定）。
 *
 * 背景:
 *   キット導入先のリポジトリで、後から `reviewed_sha`（review=APPROVED 判定時点の HEAD SHA。
 *   /run-task レビュー段のスキップ判定に使う）を導入する場合、既存タスクの meta は当該キーを
 *   持たない。本スクリプトはそれらに `reviewed_sha: null` を付与してスキーマを揃える。
 *   ※これは「このキットに含めていない」旧レイアウト移行（migrate）とは別物。
 *
 * 安全側の原則:
 *   - 引数なしは **dry-run**（付与対象の列挙のみ・ファイルを書かない）。
 *   - `--apply` で初めて書き込む。書き込み時も `reviewed_sha` 以外の既存フィールド
 *     （カスタムフィールド = extra を含む）は readMeta→stringifyMeta 経由で不変。
 *
 *   node scripts/tasks/migrateReviewedSha.mjs           # dry-run
 *   node scripts/tasks/migrateReviewedSha.mjs --apply   # 適用
 */

import { readFile, writeFile } from "node:fs/promises";
import { parse as yamlParse } from "yaml";
import { discoverTasks, readMeta, stringifyMeta, TASKS_ROOT } from "./lib.mjs";

const APPLY = process.argv.includes("--apply");

/** 生 YAML に `reviewed_sha` キーが存在するか（値が null でも「付与済み」とみなす）。 */
async function hasReviewedShaKey(metaPath) {
    const raw = yamlParse(await readFile(metaPath, "utf8")) ?? {};
    return Object.hasOwn(raw, "reviewed_sha");
}

async function main() {
    const tasks = await discoverTasks(TASKS_ROOT);
    const targets = [];
    for (const t of tasks) {
        if (!(await hasReviewedShaKey(t.metaPath))) targets.push(t.metaPath);
    }

    console.log(`\n=== reviewed_sha 移行 ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===\n`);
    if (targets.length === 0) {
        console.log("付与対象なし（全 meta.yaml が reviewed_sha を保持済み）。");
        return;
    }

    console.log(`■ reviewed_sha を付与する meta.yaml: ${targets.length} 件`);
    for (const p of targets) console.log(`  ${p}`);

    if (!APPLY) {
        console.log(
            `\nドライラン完了。問題なければ \`--apply\` を付けて再実行すると書き込みます。`,
        );
        return;
    }

    for (const metaPath of targets) {
        // readMeta が reviewed_sha=null を補完し、stringifyMeta が他フィールド・extra を保全して書き戻す
        const meta = await readMeta(metaPath);
        await writeFile(metaPath, stringifyMeta(meta), "utf8");
        console.log(`  付与: ${metaPath}`);
    }
    console.log(`\n適用完了（${targets.length} 件）。`);
}

await main();
