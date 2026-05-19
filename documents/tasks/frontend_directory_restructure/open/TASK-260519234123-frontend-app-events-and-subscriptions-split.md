# TASK-260519234123 frontend app events and subscriptions split

- 作成日: 2026-05-19
- ステータス: Open
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
