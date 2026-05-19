# TASK-260519234138 frontend character retargeting directory migration

- 作成日: 2026-05-19
- ステータス: Open
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
