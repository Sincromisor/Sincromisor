# TASK-260519234123 frontend app events and subscriptions split

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

AppController 周辺の event / subscription / active controller registry を `src/app/events` に分離し、controller 本体を lifecycle orchestration に集中させる。

## スコープ

- `sincroAppEvent*` 系ファイルの移動
- `sincroAppControllerSubscriptions` の移動
- `sincroAppActiveControllerRegistry` の移動
- event 型と mapper の参照更新

## 非対象

- event payload の仕様変更
- React subscription hook の feature 化
- manager subscription facade の分割

## 完了条件

- app event / subscription のファイルが `src/app/events` に集約されている
- AppController 本体から event 詳細実装が切り離されている
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
