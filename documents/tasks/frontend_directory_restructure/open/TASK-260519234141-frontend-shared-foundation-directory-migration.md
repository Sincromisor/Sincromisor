# TASK-260519234141 frontend shared foundation directory migration

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: Medium
- 種別: Task

## 目的

logging、横断型、共通 browser adapter、共通 styles を `src/shared` に整理し、feature 固有でない基盤コードの置き場所を明確にする。

## スコープ

- `src/ts/logging` の移動
- `src/types` の配置確認
- 共通 DOM / browser adapter の移動候補確認
- `src/styles` の shared 配下移動可否確認と必要な import 更新

## 非対象

- feature 固有 helper の shared 化
- CSS デザイン変更
- path alias 導入

## 完了条件

- shared に置くものと置かないものの基準が明確になっている
- feature 固有ロジックが `shared` に混入していない
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
