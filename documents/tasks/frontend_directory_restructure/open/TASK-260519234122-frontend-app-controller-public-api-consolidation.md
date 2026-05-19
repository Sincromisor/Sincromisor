# TASK-260519234122 frontend app controller public api consolidation

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

`SincroAppController` 本体と公開型を `src/app/controller` に移し、React UI と runtime orchestration の正規入口を明確にする。

## スコープ

- `SincroAppController` 本体の移動
- `SincroController` の `src/app/controller` への移動検討と実施
- React 側から参照する公開型の import 更新
- 旧 path 参照の解消

## 非対象

- AppController API の全面再設計
- bridge / event / settings helper の分割
- manager singleton の削除

## 完了条件

- React 側の AppController 参照先が新 path へ統一されている
- 公開 API の挙動が変わっていない
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
