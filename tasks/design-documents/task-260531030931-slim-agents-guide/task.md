# TASK-260531030931-slim-agents-guide

## 目的

- `AGENTS.md` を LLM エージェントの初動ガイドとして短く保つ。
- 詳細な構造ルールとタスク運用を正本文書へ分離する。
- 古いフロントエンド導線と確認コマンドを現在構成に合わせて更新する。

## 変更範囲

- `AGENTS.md`
- `documents/rules/code-structure.md`
- `documents/rules/coding-py.md`
- `documents/rules/coding-ts.md`
- `documents/rules/coding-md.md`
- `documents/tasks/README.md`

## 確認

- [x] `cd sincromisor-frontend && npm run check:md`

## 結果

- `AGENTS.md` を初動ガイドに縮約し、詳細ルールは正本文書へのリンクに整理した。
- コード構造ルールを `documents/rules/code-structure.md` に分離した。
- タスク運用の詳細を `documents/tasks/README.md` に集約した。
- 言語別ルール文書の `AGENTS.md` との関係を、分離後の正本構成に合わせて更新した。
