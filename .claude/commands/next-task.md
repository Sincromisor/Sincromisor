---
description: 依存が解決済みで今すぐ着手できる「次のタスク」を機械抽出し、推奨順に提示して /run-task へ橋渡しする
argument-hint: なし（任意で --ready-only）
---

`tasks:next` を実行し、結果を解釈してユーザーに提示する。状態は一切変更しない（読み取り専用）。

> 補足: `tasks:next` はプロジェクトのスクリプトランナーで実行する
> （例: `npm run tasks:next`）。

## 手順

1. `tasks:next` を実行する（`$ARGUMENTS` が与えられていればそのまま渡す。例: `--ready-only`。
   npm の場合はフラグの前に `--` が要る: `npm run tasks:next -- --ready-only`）。
   判定ロジックの正本は `scripts/tasks/nextTasks.mjs`、データモデルは `scripts/tasks/lib.mjs`。
2. 出力の各区分の意味を踏まえて要約する:
    - **READY / 即実行可（APPROVED）**: `depends_on` がすべて done かつ `review=APPROVED`。
      `/run-task task-dir` に即投入できる（`reviewed_sha` から差分がなければレビュー段は
      機械スキップされる）。
    - **READY / 再実装候補（前回 FAIL）**: APPROVED 済みだが前回 `verdict=FAIL`。残課題は `eval.md` を参照。
    - **READY / 要レビュー（未 APPROVED）**: 依存は解けているが `review` が未 APPROVED。
      先に `/review-task task-dir`（または起票し直しなら `/new-task`）でレビューを通す。
    - **WAITING / 依存待ち**: open だが未 done の依存がある。各タスクの「待機中の依存」を見て、
      どれを先に done にすれば解けるかを示す（依存が `cancelled`/`superseded`/`missing` の場合は
      人間判断が要る点を明示）。
    - **BLOCKED**: `status=blocked`。外部要因待ち。要因の解消は `task.md` を参照。
3. 先頭の `▶ 次に実行すべき` を推奨として提示し、ユーザーが望めばそのまま `/run-task task-dir` に進む。
   推奨が「要レビュー」なら `/run-task` の前に `/review-task` が要る点を添える。

機械連携が要る場面（自動チェーン等）では `tasks:next --json` を使う。
規約の全体像は `tasks/README.md` を参照。
