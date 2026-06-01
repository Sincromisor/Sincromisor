# タスク管理

Sincromisor のタスク管理正本は [../../tasks/README.md](../../tasks/README.md) に移行した。

新しいタスクは `tasks/<category>/task-<id>-<slug>/` に作成し、タスク本文、メタデータ、
review / implementation / evaluation の各ログを 1 ディレクトリにまとめる。

旧 `documents/tasks/<category>/open` / `done` は履歴互換のための呼び名であり、現在の作業導線
ではない。旧レイアウトのタスク本文は新レイアウトへ移動済み。

構造確認はリポジトリルートで次を実行する。

```sh
npm run tasks:index:check
npm run tasks:check
```
