# run-task-agents — Codex CLI 対応

run-task-agents キットは Claude Code と Codex CLI のどちらでも、同じタスク実装手順を
対話セッション上で回せる。Claude / Codex の両方が skill・
サブエージェント・hook をネイティブ実装しているためで、`.claude/` を**単一ソース**とし、
Codex CLI 用の成果物を `gen:codex`（`scripts/gen/genCodex.mjs`）で派生生成する。

本書は **Codex で使う場合に固有の前提・生成手順・対応関係・制約**をまとめたもの。
Sincromisor での運用ルール、入口、検証手順は [tasks/README.md](tasks/README.md) を参照。
upstream kit との差分は [.agents/CUSTOMIZATIONS.md](.agents/CUSTOMIZATIONS.md) に記録する。

生成する `.codex/agents/*.toml` は3体、`.agents/skills/*/SKILL.md` は2本。レビュー担当と評価担当は、
ユーザーの明示要求または高リスク変更の場合だけ起動する。

## 前提

- **Codex CLI（>= 0.137。`multi_agent` / `hooks` が stable）**: skill（`.agents/skills/`）と
  サブエージェント（`.codex/agents/*.toml`）、SubagentStop hook（`.codex/hooks.json`）を使います。
  これらは `.claude/` を**単一ソース**に `gen:codex` で生成します（下記「生成」）。
- 共通の前提（**Git** / **Node.js（>=18）または Bun**）と Sincromisor 固有の task workflow は
  [tasks/README.md](tasks/README.md) を参照。

## 生成（編集は `.claude/` に対して行う）

```bash
npm run gen:codex          # .claude/ → .codex/ + .agents/skills/ を生成（上書き）
npm run gen:codex:check    # 生成物が最新か検証（差分があれば exit 1。CI / pre-commit 向け）
```

`.codex/` と `.agents/skills/` は**生成物**。直接編集せず、必ず `.claude/` を直してから再生成する
（各生成ファイル先頭に「直接編集しない」旨のコメントが入る）。`gen:codex:check` を CI に入れると
ソースと生成物のドリフトを検出できる。

source（command / agent）を**改名・削除**したときに残る古い生成物（orphan）は、`gen:codex` 実行時に
**自動 prune（削除）**される（空になった skill ディレクトリも除去）。`gen:codex:check` は orphan が
残っていれば**パスを列挙して exit 1**する。検出・削除の対象は**生成 marker（先頭コメント）を持つ
ファイルに限定**され、marker の無い手書きファイルは触らない。

導入時（キットの展開時）も、`.codex/` / `.agents/skills/` は生成物なので直接コピーせず、展開先で
`npm run gen:codex` を実行して `.claude/` から生成する。Sincromisor では `scripts/gen` を
task workflow の一部として追跡する。

## 対応関係（Claude → Codex）

| Claude                                                   | Codex                                                  | 生成のしかた                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `.claude/commands/*.md`（スラッシュコマンド）            | `.agents/skills/<name>/SKILL.md`（skill）              | frontmatter → `name`/`description`、本文の相対リンク深さを補正                                       |
| `.claude/agents/*.md`（サブエージェント）                | `.codex/agents/*.toml`                                 | 本文を `developer_instructions` に、`tools:` → `sandbox_mode`、`model:` → `codexGen.modelMap` で変換 |
| `.claude/settings.json` の PostToolUse(Task\|Agent) hook | `.codex/hooks.json` の PostToolUse(`close_agent`) hook | 同一スクリプト `logAgentRun.mjs` を指す（Codex/Claude 両形式を防御的に解釈）。対話 TUI 前提          |
| `CLAUDE.md` / `AGENTS.md`                                | `AGENTS.md`（Codex がネイティブに読む）                | 変換不要                                                                                             |
| `scripts/**`（タスク管理・gate・eval）                   | そのまま                                               | ランタイム非依存（Node/Bun）。変換不要                                                               |

## モデルのマッピング

Claude のモデル名（`opus` / `sonnet`）→ Codex のモデルは、展開先 `package.json` の
**`codexGen.modelMap`** で対応づける。未定義のキーは `model` を**省略**し、Codex のセッション
モデルを継承させる（投機的なモデル名をキットに焼き込まない方針）。

```jsonc
{
    "codexGen": {
        // 例: チームが使う Codex モデル名に合わせて設定する（空なら全エージェントが継承）
        "modelMap": {
            "opus": "<codex-strong-model>",
            "sonnet": "<codex-light-model>",
        },
        "hookCommand": "node scripts/metrics/logAgentRun.mjs",
    },
}
```

| 何を                   | どこで                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Codex のモデル対応づけ | 展開先 `package.json` の `codexGen.modelMap`（Claude モデル名 → Codex モデル名。未定義は継承） |

## 既知の差分・制約

- **ツール制限の粒度**: Claude の `tools:`（例: reviewer は Edit/Bash を持たない）に当たる
  ツール単位の制限は Codex に無く、`sandbox_mode`（`read-only` / `workspace-write`）でしか
  表現できない。`Write` か `Edit` を含むエージェントは `workspace-write` になり、「ソースは
  変えないが review.md は書く」のような境界は**本文の禁止事項（規範）で担保**する
  （生成時に各 TOML へ短い preamble を付与）。impl-evaluator は実装 worktree のコミット済み差分を
  変更せず評価する。
- **サブエージェントの自動起動なし**: Codex はサブエージェントを自動起動しない（親の明示指示で
  起動）。`run-task` skill 本文が必要な場合だけ明示起動する。skill が
  description マッチで暗黙起動され得る点は Claude のスラッシュコマンドと異なる。Codex は
  サブエージェントを multi_agent ツール（`spawn_agent` / `wait_agent` / `close_agent`）として
  実行する。
- **メトリクス hook は対話 TUI 前提（best-effort）**: project スコープの hook は**対話 TUI でのみ
  発火し、非対話 `codex exec` では発火しない**ことを 0.139.0 で確認した（`--dangerously-bypass-hook-trust`
    - project trust 済みでも未発火）。生成する `.codex/hooks.json` はサブエージェント完了
      （`close_agent`）を `PostToolUse` で捕捉する（Claude の `Task|Agent` PostToolUse と同じ設計）。
      `close_agent` ペイロードの実フィールド名（usage / duration）は対話セッションで 1 度確認し、
      必要なら `logAgentRun.mjs` の `buildCodexLine` の候補を増やす。`logAgentRun.mjs` は複数候補から
      防御的に拾い、取れなくても「行が出ないだけ」で安全に劣化（常に exit 0）。メトリクスは要求時に
      使う観測用の付加機能で、通常の実装手順には影響しない。
