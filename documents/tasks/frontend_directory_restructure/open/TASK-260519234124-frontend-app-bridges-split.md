# TASK-260519234124 frontend app bridges split

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: Medium
- 種別: Task

## 目的

AppController と legacy manager / service 群の接続点を `src/app/bridges` に集約し、UI 依存の境界を読みやすくする。

## スコープ

- `sincroAppBridge*` 系ファイルの移動
- manager subscription facade の移動
- bridge factory と runtime bundle の責務整理
- React から直接 manager singleton を増やさない境界確認

## 非対象

- bridge API の大幅な追加
- legacy manager の削除
- UI component の移動

## 完了条件

- AppController が公開する bridge 型と factory が `src/app/bridges` にまとまっている
- legacy manager への接続箇所が追跡しやすい
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
