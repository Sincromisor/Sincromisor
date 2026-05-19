# TASK-260519234121 frontend app shell directory migration

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

React app shell を `src/app/shell` に移し、ページ entry から起動されるアプリ共通 UI の所在地を明確にする。

## スコープ

- `src/react/appShell/**` の `src/app/shell/**` への移動
- app shell を参照する page entry の import 更新
- shell が dialog / header / chat / telop / settings / debug を束ねる責務であることの確認

## 非対象

- AppController の移動
- settings / debug / dialog component の再配置
- UI レイアウト変更

## 完了条件

- app shell の import 元が `src/app/shell` に統一されている
- ページ起動時の React mount が維持されている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
