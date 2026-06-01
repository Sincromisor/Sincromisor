# Implementation Log

## Completion Summary

- Conventional Commits ベースのコミットメッセージ規約を `tasks/README.md` に追加した。
- `type(scope): summary`、`Refs:` footer、推奨 type / scope、破壊的変更、実装 commit / close commit の例を明文化した。
- `AGENTS.md`、TypeScript / Python coding rule は詳細を重複定義せず、task 正本へ誘導する形に更新した。

## Attempts

- 1: 文書正本と参照元を更新し、task tooling checks を実行した。

## Verification

- `npm run tasks:index`
- `npm run tasks:index:check`
- `npm run tasks:check`

## Not Run

- なし
