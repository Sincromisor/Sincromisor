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

<!--
  起票の入口は /new-task（起票 + 独立レビューを一括）。既存 task.md を後から再レビューする
  場合は /review-task <task-dir> を使う。いずれも APPROVED を得てから /run-task に渡す。
  各節は ${TASKS_ROOT}/AUTHORING-CHECKLIST.md（task-reviewer 評価観点の正本）に対応する。
  初回 NEEDS_REVISION の最頻出根拠は「設計判断の未確定」と「ドキュメント同期要否の未記載」。
-->

## 背景 / 目的

<!-- なぜこのタスクが必要か。解決する問題・参照する設計ドキュメント -->

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] <検証可能な条件1>
- [ ] <検証可能な条件2>

## 設計判断（着手前に確定済み）

<!-- 実装者に「どちらでもよい」を残さない。チェックリスト観点2。
  - 新規型・モジュール・データ構造の所在（ファイルパス）と最小スキーマ
  - 解釈余地のある箇所（フォーマット/識別方式/経路）をどれに決めたか + 不採用案を退ける理由
  - 外部境界（ネットワーク/外部 API/LLM/DB 等）の入力検証・失敗時挙動の方針
  確定すべき判断が無ければ「なし」と明記する。 -->

## スコープ境界

<!-- 本タスクの作業 / 依存タスクの責務の分界。スコープ外（やらないこと）。チェックリスト観点4。 -->

## 高リスク統合タスクの追加設計（該当時のみ）

<!-- 通常の局所変更では「対象外」と理由を1行書けばよい。
  複数の所有者・状態・外部境界、再試行・時刻・終了処理、全称条件を含む場合だけ、
  該当する所有権・生存期間・エラー・時刻・観測者の不変条件、対象一覧、
  受け入れ条件ごとの検証層と本番環境での観測点を記載する。独立検証できる変更束は分割する。 -->

## 実装方針（既存コード整合: file:line）

<!-- 触るファイルを file:line で参照し、前提（行番号/シグネチャ/契約）が現状と一致することを確認。
  採用するライブラリや機能・既存パターンへの整合。チェックリスト観点3。 -->

## テスト

<!-- プロジェクトの 3 点ゲート（lint / 型・ビルド / テスト）でどう完了を検証するか。
  受け入れ条件に対応し、期待値が一意なテスト。高リスク統合タスクだけは必要に応じて
  単体テスト、所有者間の結合テスト、本番用アダプターまたは契約用固定データの観測点を分ける。 -->

## ドキュメント同期の要否

<!-- 公開 API / 通信契約 / 公開挙動への影響を判定。チェックリスト観点6。
  要なら同期先（API スキーマ / 利用例 / README / 設計資料など）を具体名で受け入れ条件に書く。
  不要ならその理由を 1 行。公開バレル/生成物を変えるなら再生成とコミットを方針に含める。 -->

## 文書の言語

<!-- 説明文は原則として一般的な日本語で書く。
  コマンド名、ファイル名、設定キー、識別子、規格名、固有の状態値など、
  正確さや検索性のために必要な語だけを英語で残す。 -->
`;

    await writeFileEnsured(join(dir, "meta.yaml"), stringifyMeta(meta));
    await writeFileEnsured(join(dir, "task.md"), taskMd);
    await writeFileEnsured(
        join(dir, "review.md"),
        `# レビュー: ${id}

## 判定

-

## 親への要約

-
`,
    );
    await writeFileEnsured(
        join(dir, "impl.md"),
        `# 実装記録: ${id}

## 完了時の要約

-

## 不合格分類

none

## 検証結果

-

## 未実行の確認

-
`,
    );
    await writeFileEnsured(
        join(dir, "eval.md"),
        `# 評価: ${id}

## 判定

-

## 完了時の要約

-

## 検証結果

-
`,
    );
    await writeFileEnsured(join(dir, "acceptance", ".gitkeep"), "");
    await writeFileEnsured(join(dir, "artifacts", ".gitkeep"), "");
    console.log(`作成: ${dir}/`);
    console.log("  - task.md");
    console.log(`  - meta.yaml (status=open, created_at=${meta.created_at})`);
    console.log("\n次: task.md を記述 → tasks:index で index.md を再生成。");
}

await main();
