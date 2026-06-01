# TASK-260531024138 Markdown 記述規約の正本化

- 作成日: 2026-05-31
- ステータス: Done
- 優先度: Medium

## 目的

Markdown の記述規約を `documents/rules/` 配下に正本化し、AGENTS.md から参照できる状態にする。

## 背景

- Markdown の整形は `sincromisor-frontend/package.json` の Prettier scripts と `.prettierrc.json` に定義されている。
- 一方で、見出し、リンク、コードブロック、設計文書とタスク文書の書き分けなど、文書を書く時の判断基準がルールファイルとして独立していない。
- Python / TypeScript と同様に、横断ルールを正本化して LLM エージェントが迷わず参照できるようにする。

## スコープ

- `documents/rules/coding-md.md` の追加
- `AGENTS.md` から Markdown ルールファイルへの参照追加
- 既存の Prettier 設定との整合確認

## 非対象

- 既存 Markdown 文書の全面整形
- Prettier 設定や npm scripts の変更
- 設計文書の内容変更

## 完了条件

- [x] Markdown 記述規約の正本がある
- [x] `AGENTS.md` から正本へ辿れる
- [x] Markdown の確認コマンドが明示されている

## 確認

```sh
cd sincromisor-frontend
npm run check:md
```

- `npm run check:md`: 成功
