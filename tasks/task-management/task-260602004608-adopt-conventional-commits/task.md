# Adopt Conventional Commits for future work

## 目的

- 今後のコミットログを Conventional Commits ベースへ揃え、マルチ AI エージェント作業でも履歴から変更意図、確認、関連タスクを追えるようにする。

## 変更範囲

- `tasks/README.md` に Sincromisor のコミットメッセージ規約を追加する。
- `AGENTS.md` と言語別 coding rule のコミット記述を正本参照へ更新する。
- 過去コミットは rewrite しない。

## 設計同期

- [x] 実装、設定、compose、設計文書の更新要否を確認する。

## 受け入れ条件

- [x] Conventional Commits ベースの形式、type、scope、task ID footer、破壊的変更の扱いが文書化されている。
- [x] `AGENTS.md` と coding rule が新しい正本へ矛盾なく誘導している。
- [x] task tooling checks が通る。

## 確認

- [x] `npm run tasks:index`
- [x] `npm run tasks:index:check`
- [x] `npm run tasks:check`

## 実行できなかった検証

- なし

## subagent 成果物

- review: `review.md`
- implementation log: `impl.md`
- evaluation: `eval.md`
- acceptance artifacts: `acceptance/`
