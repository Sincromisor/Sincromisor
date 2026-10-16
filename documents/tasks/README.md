# タスク管理

Sincromisor のタスク管理正本は [../../tasks/README.md](../../tasks/README.md) に移行した。

新しいタスクは `tasks/<category>/task-<id>-<slug>/` に作成し、タスク本文、メタデータ、
確認結果を1ディレクトリにまとめる。通常は`task.md`と`meta.yaml`を使い、独立レビュー・評価の記録や`impl.md`は[ファイルの役割](../../tasks/README.md#ファイルの役割)に該当する場合だけ作成する。

旧 `documents/tasks/<category>/open` / `done` は履歴互換のための呼び名であり、現在の作業導線
ではない。旧レイアウトのタスク本文は新レイアウトへ移動済み。

構造確認はリポジトリルートで次を実行する。

```sh
npm run tasks:index:check
npm run tasks:check
```
