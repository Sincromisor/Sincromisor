#!/usr/bin/env node
/**
 * タスクの meta.yaml を決定的に更新する（手で YAML を編集しない）。
 * close 時など、オーケストレーターがライフサイクル状態を書き込むために使う。
 *
 *   node scripts/tasks/setMeta.mjs <task-dir|meta.yaml|task.md> key=value [key=value ...]
 *   bun  scripts/tasks/setMeta.mjs <task-dir|meta.yaml|task.md> key=value [key=value ...]
 *
 * 例:
 *   node scripts/tasks/setMeta.mjs tasks/feature/task-260601-foo status=done verdict=PASS
 *   node scripts/tasks/setMeta.mjs <dir> review=APPROVED reviewed_sha=$(git rev-parse HEAD)
 *   node scripts/tasks/setMeta.mjs <dir> status=superseded superseded_by=task-260601-bar
 *
 * - status を終端（done/cancelled/superseded）にして closed_at 未指定なら当日日付を自動設定
 *   （blocked は非終端なので closed_at を打たない。解けたら open に戻す）
 * - depends_on は `depends_on=a,b,c`（カンマ区切り）または `depends_on=` で空配列
 * - 値に `null` / 空文字を渡すと該当フィールドを null 化（depends_on は []）
 *
 * カスタムフィールド（宣言制・保全制）:
 * - 既知 12 フィールド以外のキーは既定で拒否する（`staus=done` のようなタイポ保護）。
 * - ただし `package.json` の `taskMeta.customFields`（`string[]`）に宣言したキーは
 *   `key=value` で設定でき、`null` / 空文字で当該キーを削除できる（値は文字列スカラ）。
 * - 宣言外の既存カスタムフィールドは readMeta→stringifyMeta 経由で触らず保持される。
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    hasJapaneseText,
    isStatus,
    readCustomFields,
    readMeta,
    STATUSES,
    stringifyMeta,
    TERMINAL_STATUSES,
    today,
} from "./lib.mjs";

function resolveMetaPath(arg) {
    if (arg.endsWith("meta.yaml")) return arg;
    if (arg.endsWith("task.md")) return arg.replace(/task\.md$/, "meta.yaml");
    return join(arg, "meta.yaml"); // ディレクトリ指定
}

function fail(msg) {
    console.error(`エラー: ${msg}`);
    process.exit(1);
}

async function main() {
    const [target, ...pairs] = process.argv.slice(2);
    if (!target || pairs.length === 0) {
        fail("使い方: node scripts/tasks/setMeta.mjs <task-dir|meta.yaml> key=value ...");
    }

    const metaPath = resolveMetaPath(target);
    if (!existsSync(metaPath)) fail(`meta.yaml が見つかりません: ${metaPath}`);
    const meta = await readMeta(metaPath);
    const customFields = new Set(await readCustomFields());

    let statusBecameClosed = false;
    let closedAtTouched = false;

    for (const pair of pairs) {
        const eq = pair.indexOf("=");
        if (eq === -1) fail(`key=value 形式で指定してください: ${pair}`);
        const key = pair.slice(0, eq).trim();
        const rawValue = pair.slice(eq + 1).trim();
        const nullish = rawValue === "" || rawValue === "null";

        switch (key) {
            case "status": {
                if (!isStatus(rawValue))
                    fail(`status は ${STATUSES.join("|")} のいずれか: ${rawValue}`);
                // 非終端（open/blocked）→ 終端（done/cancelled/superseded）に移った時だけ closed_at を打つ
                const wasTerminal = TERMINAL_STATUSES.includes(meta.status);
                const willBeTerminal = TERMINAL_STATUSES.includes(rawValue);
                if (willBeTerminal && !wasTerminal) statusBecameClosed = true;
                meta.status = rawValue;
                break;
            }
            case "review":
                if (!nullish && !["APPROVED", "NEEDS_REVISION"].includes(rawValue)) {
                    fail(`review は APPROVED|NEEDS_REVISION|null: ${rawValue}`);
                }
                meta.review = nullish ? null : rawValue;
                break;
            case "reviewed_sha":
                if (!nullish && !/^[0-9a-f]{7,40}$/i.test(rawValue)) {
                    fail(`reviewed_sha は 7〜40 桁の hex（コミット SHA）|null: ${rawValue}`);
                }
                meta.reviewed_sha = nullish ? null : rawValue.toLowerCase();
                break;
            case "verdict":
                if (!nullish && !["PASS", "FAIL"].includes(rawValue)) {
                    fail(`verdict は PASS|FAIL|null: ${rawValue}`);
                }
                meta.verdict = nullish ? null : rawValue;
                break;
            case "attempts": {
                const n = Number(rawValue);
                if (!Number.isInteger(n) || n < 0) fail(`attempts は 0 以上の整数: ${rawValue}`);
                meta.attempts = n;
                break;
            }
            case "depends_on":
                meta.depends_on = nullish
                    ? []
                    : rawValue
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean);
                break;
            case "superseded_by":
                meta.superseded_by = nullish ? null : rawValue;
                break;
            case "closed_at":
                meta.closed_at = nullish ? null : rawValue;
                closedAtTouched = true;
                break;
            case "created_at":
                meta.created_at = nullish ? null : rawValue;
                break;
            case "title":
                if (!hasJapaneseText(rawValue)) {
                    fail("title は、固有名詞だけでなく内容を説明する日本語を含めてください");
                }
                meta.title = rawValue;
                break;
            case "id":
            case "category":
                fail(`${key} はディレクトリ構造に紐づくため setMeta では変更不可（移動が必要）`);
                break;
            default: {
                // package.json の taskMeta.customFields に宣言されたキーのみ受理（タイポ保護）。
                if (!customFields.has(key)) {
                    fail(
                        `未知のフィールド: ${key}` +
                            `（カスタムフィールドは package.json の taskMeta.customFields に宣言が必要）`,
                    );
                }
                const extra = meta.extra ?? {};
                if (nullish) delete extra[key];
                else extra[key] = rawValue;
                meta.extra = extra;
                break;
            }
        }
    }

    // done/superseded 化したのに closed_at 未指定なら当日を自動設定
    if (statusBecameClosed && !closedAtTouched && !meta.closed_at) {
        meta.closed_at = today();
    }

    await writeFile(metaPath, stringifyMeta(meta), "utf8");
    console.log(`更新: ${metaPath}`);
    console.log(stringifyMeta(meta).trimEnd());
    console.log("\n次: tasks:index で index.md を再生成してください。");
}

await main();
