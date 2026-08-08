#!/usr/bin/env node
/**
 * 新規タスクの雛形（task.md + meta.yaml）を生成する。
 *
 *   node scripts/tasks/newTask.mjs <category> "<タイトル>" [--slug=<slug>] [--depends=a,b]
 *   bun  scripts/tasks/newTask.mjs <category> "<タイトル>" [--slug=<slug>] [--depends=a,b]
 *
 * 例:
 *   node scripts/tasks/newTask.mjs feature "ログイン画面にパスワード再設定を追加"
 *
 * - id = task-<yyMMddHHmmss>-<slug>
 * - slug は --slug 未指定ならタイトルから生成（英数とハイフンのみ）。
 *   日本語タイトルなど英数字を含まない場合は --slug=<英数とハイフン> が必須。
 * - status=open / created_at=当日 で meta.yaml を作成する。
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { stringifyMeta, TASKS_ROOT, today, writeFileEnsured } from "./lib.mjs";

function fail(msg) {
    console.error(`エラー: ${msg}`);
    process.exit(1);
}

function timestamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return (
        String(d.getFullYear()).slice(2) +
        p(d.getMonth() + 1) +
        p(d.getDate()) +
        p(d.getHours()) +
        p(d.getMinutes()) +
        p(d.getSeconds())
    );
}

function slugify(s) {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60);
}

async function main() {
    const args = process.argv.slice(2);
    const flags = new Map();
    const positional = [];
    for (const a of args) {
        const m = a.match(/^--([^=]+)=(.*)$/);
        if (m) flags.set(m[1], m[2]);
        else positional.push(a);
    }
    const [category, title] = positional;
    if (!category || !title) {
        fail(
            '使い方: node scripts/tasks/newTask.mjs <category> "<タイトル>" [--slug=..] [--depends=a,b]',
        );
    }

    const slug = flags.get("slug") ? slugify(flags.get("slug")) : slugify(title);
    if (!slug) fail("slug を生成できません。--slug=<英数とハイフン> を指定してください。");

    const id = `task-${timestamp()}-${slug}`;
    const dir = join(TASKS_ROOT, category, id);
    if (existsSync(join(dir, "meta.yaml"))) fail(`既に存在します: ${dir}`);

    const depends = (flags.get("depends") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

    /** @type {import("./lib.mjs").TaskMeta} */
    const meta = {
        id,
        title,
        category,
        status: "open",
        depends_on: depends,
        superseded_by: null,
        review: null,
        reviewed_sha: null,
        verdict: null,
        attempts: 0,
        created_at: today(),
        closed_at: null,
        extra: {
            legacy_ids: [],
        },
    };

    const taskMd = `# ${title}

<!-- ${TASKS_ROOT}/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

<!-- なぜこのタスクが必要か。解決する問題・参照する設計ドキュメント -->

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] <検証可能な条件1>
- [ ] <検証可能な条件2>

## 設計判断

<!-- 実装結果を左右する判断だけを書く。外部境界がある場合は、設定値・port・address・probe の
  供給元、消費先、正本もここか実装方針に明記する。通常の実装判断や不採用案の網羅は不要。 -->

## スコープ境界

<!-- 本タスクの作業 / 依存タスクの責務の分界。スコープ外（やらないこと）。チェックリスト観点4。 -->

## 実装方針

<!-- 変更する主なファイル、再利用する既存パターン、高リスク時だけ必要な不変条件・観測点。 -->

## テスト

<!-- プロジェクトの 3 点ゲート（lint / 型・ビルド / テスト）でどう完了を検証するか。
  受け入れ条件に対応し、期待値が一意なテスト。高リスク統合タスクだけは必要に応じて
  単体テスト、所有者間の結合テスト、本番用アダプターまたは契約用固定データの観測点を分ける。 -->

## ドキュメント同期の要否

<!-- 公開 API / 通信契約 / 公開挙動への影響を判定。チェックリスト観点6。
  要なら同期先（API スキーマ / 利用例 / README / 設計資料など）を具体名で受け入れ条件に書く。
  不要ならその理由を 1 行。公開バレル/生成物を変えるなら再生成とコミットを方針に含める。 -->

`;

    await writeFileEnsured(join(dir, "meta.yaml"), stringifyMeta(meta));
    await writeFileEnsured(join(dir, "task.md"), taskMd);
    // 互換レイアウトだけ維持し、実際に使う成果物だけ担当エージェントが記入する。
    await writeFileEnsured(join(dir, "review.md"), "");
    await writeFileEnsured(join(dir, "impl.md"), "");
    await writeFileEnsured(join(dir, "eval.md"), "");
    await writeFileEnsured(join(dir, "acceptance", ".gitkeep"), "");
    await writeFileEnsured(join(dir, "artifacts", ".gitkeep"), "");
    console.log(`作成: ${dir}/`);
    console.log("  - task.md");
    console.log(`  - meta.yaml (status=open, created_at=${meta.created_at})`);
    console.log("\n次: task.md を記述 → tasks:index で index.md を再生成。");
}

await main();
