# TASK-260519234138 frontend character retargeting directory migration

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

face / pose retargeting 処理を `src/character/retargeting` に集約し、tracking 結果から VRM motion への変換処理を追いやすくする。

## スコープ

- `sincroFaceRetarget*` 系ファイルの移動
- `sincroPoseRetarget*` 系ファイルの移動
- retarget frame / targets / types の配置整理
- VRM character manager からの import 更新

## 非対象

- IK solver の移動
- tracking runtime の移動
- retargeting 数式や補正値の変更

## 完了条件

- retargeting 関連が `src/character/retargeting` にまとまっている
- tracking runtime と VRM bone application の中間層として読める
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
