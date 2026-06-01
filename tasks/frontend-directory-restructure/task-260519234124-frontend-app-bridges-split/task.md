# TASK-260519234124 frontend app bridges split

- 作成日: 2026-05-19
- ステータス: Done
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

## 完了メモ

- 完了日: 2026-05-20
- 実装: frontend を `src/app` / `src/features` / `src/character` / `src/shared` / `src/pages` の責務境界へ再配置した。
- 確認: `cd sincromisor-frontend && npm run build` 成功。
- 確認: `cd sincromisor-frontend && npm run check` 成功。
- 確認: `cd sincromisor-frontend && npm run test` 成功。
- 確認: dev server 上で `/` / `/simple-vrm/` / `/vrm360/` / `/looking-glass-vrm/` / `/motion-debug/` の page entry を Playwright smoke 確認した。backend 未起動のため RTC config 404 は想定内。
