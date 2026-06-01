# TASK-260519234131 frontend conversation chat telop colocation

- 作成日: 2026-05-19
- ステータス: Done
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

## 完了メモ

- 完了日: 2026-05-20
- 実装: frontend を `src/app` / `src/features` / `src/character` / `src/shared` / `src/pages` の責務境界へ再配置した。
- 確認: `cd sincromisor-frontend && npm run build` 成功。
- 確認: `cd sincromisor-frontend && npm run check` 成功。
- 確認: `cd sincromisor-frontend && npm run test` 成功。
- 確認: dev server 上で `/` / `/simple-vrm/` / `/vrm360/` / `/looking-glass-vrm/` / `/motion-debug/` の page entry を Playwright smoke 確認した。backend 未起動のため RTC config 404 は想定内。
