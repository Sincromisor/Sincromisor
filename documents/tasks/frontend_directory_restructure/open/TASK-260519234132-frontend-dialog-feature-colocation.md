# TASK-260519234132 frontend dialog feature colocation

- 作成日: 2026-05-19
- ステータス: Open
- 優先度: High
- 種別: Task

## 目的

startup dialog の model / service / React component を `src/features/dialog` 配下にまとめ、起動前設定 UI の責務を独立させる。

## スコープ

- `src/ts/ui/dialog*` の `features/dialog/model` への移動
- `src/react/dialog` の `features/dialog/react` への移動
- dialog state store / notification / VRM workflow の import 更新
- AppController bridge との接続維持

## 非対象

- settings field component の移動
- dialog の見た目変更
- 起動設定項目の変更

## 完了条件

- dialog 関連の model と React 表示が `features/dialog` にまとまっている
- startup dialog の開閉と設定反映が維持されている
- `cd sincromisor-frontend && npm run build` が成功する

## 確認

```sh
cd sincromisor-frontend
npm run build
```
