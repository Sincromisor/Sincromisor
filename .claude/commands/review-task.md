---
description: task-reviewer サブエージェントを単体で呼び出し、タスク記述ファイルをレビューさせる（実装・close は行わない）
argument-hint: task-dir（例: tasks/feature/task-260601153000-foo）
---

`$1` のタスク記述を task-reviewer サブエージェントにレビューさせる。実装・評価・close は
行わず、レビュー単体で完結する。判定は `meta.yaml` に転記する（`review` / `reviewed_sha` のみ。
`status` / `verdict` は触らない）。

これは **task.md 単体の独立レビュー**を行うコマンド。通常の起票は **`/new-task`**（起票 + 独立レビューを
一括）が入口であり、本コマンドは既存 `task.md` を後から再レビューしたいときに使う。NEEDS_REVISION なら
起票したエージェントが `task.md` を改訂し、APPROVED が出てから `/run-task` に進む。評価観点の正本は
`tasks/AUTHORING-CHECKLIST.md`。

## 手順

1. `$1/task.md` が存在することを確認する。なければ停止してユーザーに報告する。
2. task-reviewer サブエージェントを呼び出し、`$1/task.md` をレビューさせ、結果を
   `$1/review.md` に出力させる。
    - 呼び出しプロンプトに対象パス `$1` を明記すること（サブエージェントは親の履歴を
      継承しないため）。
3. サブエージェントの**最終メッセージ（判定と特記事項の要点）を確認し、かつ
   `$1/review.md` を必ず Read** してから報告する。
4. 判定を `meta.yaml` に転記する:
    - APPROVED → `tasks:set $1 review=APPROVED reviewed_sha=$(git rev-parse HEAD)`
      （`reviewed_sha` は `/run-task` レビュー段のスキップ判定の基準になる）
    - NEEDS_REVISION → `tasks:set $1 review=NEEDS_REVISION reviewed_sha=null`

## 報告

レビュー判定（APPROVED / NEEDS_REVISION）と、Critical/High 指摘・実装者への申し送りの
要点をユーザーに提示する（詳細は `$1/review.md` を参照、と示す）。

パイプライン継続（実装/評価）は行わない。続けて実装まで回す場合は
`/run-task $1` を使うようユーザーに案内する。
