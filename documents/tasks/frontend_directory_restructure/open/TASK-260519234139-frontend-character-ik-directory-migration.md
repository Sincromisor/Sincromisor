# TASK-260519234139 frontend character ik directory migration

- 作成日: 2026-05-19
- ステータス: Open
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
