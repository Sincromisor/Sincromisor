# TASK-260601214726 migrate legacy task documents

## 目的

既存の `documents/tasks` 配下のタスクを、新しい `tasks/` レイアウトへ移行する。

## 親タスク

- `TASK-260601214723`

## 依存

- `TASK-260601214724`

## 変更範囲

- `documents/tasks/<category>/open/TASK-*.md` を `tasks/<category>/task-*/task.md` に移す。
- `documents/tasks/<category>/done/TASK-*.md` を `tasks/<category>/task-*/task.md` に移す。
- 各タスクに `meta.yaml` を付与する。
- 既存のカテゴリ README を `tasks/<category>/index.md` の手書き前文、またはカテゴリ説明として移す。
- タスクに付随する CSV / manual verification / research artifact を `artifacts/` またはカテゴリ配下の共有 artifact として整理する。
- 移行後、旧 `documents/tasks` には移行案内を残すか、参照更新完了後に削除する。

## 実装方針

- 一度きりの移行スクリプト `scripts/tasks/migrateLegacyTasks.mjs` を作る。
- `open/` 由来は `status: open`、`done/` 由来は `status: done` にする。
- 既存 ID が `TASK-260517...` の場合は `task-260517...` に変換する。
- 既存 ID が `TASK-1000` や `TASK-3100` の場合は、履歴互換性を優先して `task-1000-...` / `task-3100-...` として保持する。
- 同じ legacy ID を持つタスクが複数ある場合は、canonical ID を slug まで含めて一意にし、`legacy_ids` または `aliases` に旧 ID を保持する。リンク解決は canonical ID を優先し、legacy ID だけでは曖昧な場合に候補一覧を出して手動判断に回す。
- `open/` / `done/` 外の `TASK-*.md` や CSV は、タスク本文ではなく artifact 候補として扱う。親タスクをファイル名、本文リンク、同一 prefix から推定し、推定できない場合はカテゴリ共有 `artifacts/` に置いて `tasks/README.md` または category index に記録する。
- `TASK-1006-manual-verification.md` と `TASK-1006-evaluation-dataset.csv` のように同じ task prefix を持つ補助ファイルは、対応する migrated task の `artifacts/` 配下へ移すことを第一候補にする。
- `closed_at` は旧 done タスクに正確な完了日がない場合、null または移行日とし、方針を `tasks/README.md` に明記する。
- 移行スクリプトは dry-run と apply を分ける。

## 完了条件

- 既存のタスク本文が新レイアウトに移行されている。
- `meta.yaml` が全 task directory に存在する。
- 旧 open / done の状態が `status` に反映されている。
- 既存の task ID 参照が追跡可能である。
- 重複 legacy ID と artifact の移行方針が `tasks/README.md` または移行ログに残っている。
- 移行スクリプトの実行結果と判断を `impl.md` または本タスクの結果に残している。

## 確認

- [x] dry-run で移行対象数と移行先を確認する。
- [x] apply 後、旧 `open/` / `done/` 配下のタスク本文数と新 task directory 数が一致することを確認する。
- [x] `open/` / `done/` 外の artifact 候補数、移行先、未確定ファイルの有無を確認する。
- [x] `TASK-1006` や `TASK-3034` など重複 ID の canonical ID / alias が一意に解決できることを確認する。
- [x] `tasks:index` を実行する。
- [x] `rg "documents/tasks"` で残存参照を確認する。
- [x] 代表的な旧タスクリンクが新 task directory へ辿れることを確認する。

## 結果

- `scripts/tasks/migrateLegacyTasks.mjs` を追加し、dry-run / apply で旧タスクを移行できるようにした。
- `documents/tasks/<category>/open` / `done` 配下の 153 タスク本文を `tasks/<category>/task-*/task.md` へ移動した。
- 各 task directory に `meta.yaml`, `review.md`, `impl.md`, `eval.md`, `acceptance/`, `artifacts/` を作成した。
- 旧カテゴリ README の内容を新しい `tasks/<category>/index.md` の手書き前文として取り込んだ。
- `TASK-1006-evaluation-dataset.csv` と `TASK-1006-manual-verification.md` は `tasks/proper-noun-biasing/task-1006-tests-and-evaluation-dataset/artifacts/` へ移動した。
- `TASK-3034` は slug まで含む canonical ID で `task-3034-chat-overlay-fixed-viewport-height` と `task-3034-right-tool-menu-state-and-popover` に分離し、どちらも `legacy_ids: ["TASK-3034"]` を保持した。
- 旧 `documents/tasks/README.md` は移行案内に置き換えた。
- 残存 `documents/tasks` 参照は確認済み。履歴本文と設計・ルールの参照更新は後続の `task-260601214727-update-agents-and-rules-task-references` / `task-260601214728-task-index-link-and-verification-tooling` で扱う。
