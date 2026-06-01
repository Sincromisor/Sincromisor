# Implementation Log

## Completion Summary

- `tasks/README.md` の commit body ルールから「必要に応じて」を外し、タスクに紐づく commit では `Why:` / `What:` / `Verify:` / `Risk:` を必須と明記した。
- `Verify:` は 1 commit body 内で 1 回だけ使い、複数コマンドは `; ` 区切りまたは連続した箇条書きで記録するルールを追加した。
- `AGENTS.md` の要約にも body 必須項目を追記した。

## Attempts

- 1: コミットメッセージ規約を更新し、task tooling checks を実行した。

## Verification

- `npm run tasks:index`
- `npm run tasks:index:check`
- `npm run tasks:check`

## Not Run

- なし
