# Review: task-260625231726-character-animation-3-phase-6-arm-pole-constraints

## 判定
APPROVED

前回 blocking だった target reach ratio の入力経路と soft downweight の条件 / 係数 / 合成規則は task.md で一意に確定された。改訂箇所に、実装を止める新たな Critical / High の破綻は見当たらない。

## 指摘事項
なし

## 実装者への申し送り
- 前回 High の reach ratio 指摘は解消済み。`resolveArmIkPoleDirection()` option に `targetReachRatio?: number` が追加され、未指定時は `SincroArmIkSolver.prepareTarget()` で clamp 前 `target.wrist.length() / (upperArmLength + lowerArmLength)` を計算して渡す方針に確定している。
- 前回 High の soft downweight 指摘は解消済み。`poleFlipDotThreshold <= dot < 0.18`、soft `weightScale = 0.82`、hard reject `weightScale = 0.68`、既存 constraint weight との乗算まで固定されている。
- 前回 Medium の `wristRollInfluence` と previous 欠損時の blend 規則も解消済み。`SincroArmIkTarget.wristRollInfluence?: number` を `0..1` clamp して snapshot に保存し、previous が無い state では `bindPoleDirection` を previous とみなす。
- 実装時は `sincroArmIkPole` の単体テストに soft downweight の境界（`dot === poleFlipDotThreshold`、`dot` が `0.18` 未満 / 以上）も含めると、今回確定した挙動を固定しやすい。
