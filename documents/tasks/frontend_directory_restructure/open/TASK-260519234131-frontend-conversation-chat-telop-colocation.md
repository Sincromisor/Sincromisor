# TASK-260519234131 frontend conversation chat telop colocation

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: Medium
- 種別: Task

## 目的

chat / telop の model と React 表示を `src/features/conversation` 配下に近接配置し、会話 UI の責務を追いやすくする。

## スコープ

- `chatMessageService` の `conversation/chat/model` への移動
- React chat view の `conversation/chat/react` への移動
- React telop view の `conversation/telop/react` への移動
- legacy telop renderer の配置整理

## 非対象

- TalkManager の移動
- chat / telop の表示デザイン変更
- DataChannel message schema 変更

## 完了条件

- chat と telop の state / view が `features/conversation` 配下にまとまっている
- React UI から AppController 正規経路への依存が維持されている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
