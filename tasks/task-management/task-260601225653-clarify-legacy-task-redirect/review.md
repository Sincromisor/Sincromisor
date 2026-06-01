# Review

## Verdict

APPROVED

## Findings

- タスク目的は `documents/tasks/README.md` の移行案内補強に限定されており、現状の同文書は `tasks/README.md` と新レイアウトへの最低限の案内だけで、構造確認コマンドまでは辿れない。受け入れ条件はこの不足に対応している。
- 変更対象はドキュメントと subagent 成果物に限られ、WebRTC 契約、DataChannel 形式、環境変数、compose、公開 API には影響しない。
- `task.md` の確認コマンドにある `npm run check:md` は、ルートではなく `sincromisor-frontend` で定義されている。実装時は `tasks/README.md` の確認コマンドに合わせて `cd sincromisor-frontend && npm run check:md` として扱うこと。

## Required Changes

- なし。実装へ進めてよい。

## Risks

- `documents/tasks/<category>/open` / `done` を現在の作業導線のように案内すると、新しい `tasks/<category>/task-<id>-<slug>/` 運用と矛盾する。旧パスは履歴互換の説明に限定する必要がある。
- `task.md` の変更範囲には `review.md`, `impl.md`, `eval.md`, `meta.yaml` も含まれるが、role ごとの所有範囲は `tasks/README.md` が正本である。implementer は `meta.yaml` と `eval.md` を変更せず、parent / evaluator に任せること。

## Recommended Checks

- `cd sincromisor-frontend && npm run check:md`
- `npm run tasks:index:check`
- `npm run tasks:check`

## Implementation Notes

- `documents/tasks/README.md` から `tasks/README.md` へ相対リンクで誘導し、読む理由を短く添える。
- 新レイアウトは `tasks/<category>/task-<id>-<slug>/` を canonical として案内し、`tasks/<category>/task-*/` のような曖昧な表記は避ける。
- 構造確認コマンドはルート実行の `npm run tasks:index:check` と `npm run tasks:check` へ辿れるようにする。
