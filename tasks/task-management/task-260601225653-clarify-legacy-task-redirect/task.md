# clarify legacy task redirect

## 目的

旧 `documents/tasks/README.md` の移行案内を、新しい `tasks/` 運用に初見で辿れる内容へ補強する。

このタスクは `task-260601214729-pilot-codex-subagent-task-flow` の pilot として、review -> implement -> evaluate -> close の分離運用を確認するために小さく保つ。

## 依存

- `task-260601214729-pilot-codex-subagent-task-flow`

## 変更範囲

- `documents/tasks/README.md`
- この pilot task の `review.md`, `impl.md`, `eval.md`, `meta.yaml`

## 設計同期

- [ ] 実装、設定、compose、設計文書の更新要否を確認する。

## 受け入れ条件

- [ ] `documents/tasks/README.md` が `tasks/README.md` と `tasks/<category>/task-<id>-<slug>/` を案内している。
- [ ] 旧 `documents/tasks/<category>/open` / `done` が履歴互換の語としてだけ出てくる。
- [ ] 構造確認コマンドとして `npm run tasks:index:check` と `npm run tasks:check` に辿れる。
- [ ] Markdown check が通る。

## 確認

- [ ] `npm run check:md`
- [ ] `npm run tasks:index:check`
- [ ] `npm run tasks:check`

## 実行できなかった検証

- 実施時に記録する。

## subagent 成果物

- review: `review.md`
- implementation log: `impl.md`
- evaluation: `eval.md`
- acceptance artifacts: `acceptance/`
