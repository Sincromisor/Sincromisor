# TASK-260601214729 pilot Codex subagent task flow

## 目的

新しい Codex subagent タスク運用を、小さな実タスクで試行し、review -> implement -> evaluate -> close の独立性と実用性を確認する。

## 親タスク

- `TASK-260601214723`

## 依存

- `TASK-260601214724`
- `TASK-260601214725`
- `TASK-260601214726`
- `TASK-260601214728`
- `TASK-260601214727`

## 変更範囲

- pilot 用に新規作成する `tasks/<category>/task-*/`
- 必要最小限の実装または文書変更
- pilot task の `review.md`, `impl.md`, `eval.md`, `meta.yaml`
- 運用で見つかった不足に対する `tasks/README.md` または skill の修正

## 実装方針

- pilot は小さく、影響範囲が明確で、確認コマンドが短時間で実行できる題材を選ぶ。
- 親 Codex は subagent を次の順で起動する。
    1. reviewer: `task.md` をレビューし、`review.md` を出力する。
    2. implementer: APPROVED 後に実装し、テストを実行し、`impl.md` を追記して commit する。
    3. evaluator: committed diff を独立検証し、`eval.md` を出力する。
    4. parent: `tasks:set` と `tasks:index` で close する。
- evaluator は実装者の報告ではなく、実際の diff と品質ゲート結果で PASS / FAIL を判定する。

## 完了条件

- pilot task が新レイアウトで起票されている。
- reviewer / implementer / evaluator が別 subagent として実行されている。
- `review.md`, `impl.md`, `eval.md` が task directory に残っている。
- 評価 PASS 後に `meta.yaml` が `status=done`, `verdict=PASS` になっている。
- 運用上の不足があれば、該当文書または skill に反映されている。

## 確認

- [x] parent Codex の入力だけで reviewer が仕様レビューできる。
- [x] implementer が `meta.yaml` と `eval.md` を触っていない。
- [x] evaluator が source code を変更していない。
- [x] evaluator が品質ゲートを独立実行している。
- [x] close 後に `tasks:index:check` が通る。

## 結果

- Pilot task `task-260601225653-clarify-legacy-task-redirect` を新レイアウトで起票した。
- reviewer / implementer / evaluator を別 subagent として実行し、成果物を `review.md`, `impl.md`, `eval.md` に分離した。
- implementer は実装 commit `b059e336e10b20a360b099d8edebc8a747183d78` を作成した。
- parent Codex が pilot task を `status=done`, `verdict=PASS` へ close し、close commit `6ab1025` を作成した。
