# TASK-260519234125 frontend app settings snapshot split

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

AppController 配下の settings snapshot / apply / startup settings 関連処理を `src/app/settings` に分離し、設定状態生成と lifecycle 制御を分ける。

## スコープ

- `sincroAppSettings*` 系ファイルの移動
- `sincroAppStartupSettings` の移動
- settings related payload cache / snapshot builder の移動
- AppController から settings 詳細処理への依存を整理

## 非対象

- settings UI component の移動
- 設定項目の追加削除
- local storage / env 仕様変更

## 完了条件

- settings snapshot / apply 処理が `src/app/settings` に集約されている
- AppController 本体が設定値の組み立て詳細を直接持たない
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
