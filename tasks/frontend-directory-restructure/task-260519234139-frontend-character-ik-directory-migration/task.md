# TASK-260519234139 frontend character ik directory migration

- 作成日: 2026-05-19
- ステータス: Done
- 優先度: Medium
- 種別: Task

## 目的

arm IK solver / geometry / constraint を `src/character/ik` に分離し、IK アルゴリズムを behavior や manager から物理的に独立させる。

## スコープ

- `sincroArmIk*` 系ファイルの移動
- IK probe / skeleton / solver / constraint / geometry / pole の配置整理
- retargeting から IK を呼ぶ import の更新
- Debug Console motion snapshot との依存確認

## 非対象

- IK アルゴリズム変更
- retargeting 全体の移動
- motion debug UI の変更

## 完了条件

- IK 関連が `src/character/ik` にまとまっている
- IK が UI / RTC に直接依存していない
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
