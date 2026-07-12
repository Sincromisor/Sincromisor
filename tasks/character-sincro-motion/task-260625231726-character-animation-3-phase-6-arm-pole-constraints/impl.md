# Implementation Log: task-260625231726-character-animation-3-phase-6-arm-pole-constraints

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md は APPROVED で、freshness 申し送りどおり IK / pole resolver / solver / constraint snapshot 本体に競合する変更は無かったため実装へ進んだ。
- `ArmPoleState` は task.md の指定どおり lower-case string union とし、TemporalStateEstimator ではなく IK pole resolver の責務として実装した。
- hard reject / soft downweight は resolver の `reasonCodes` と `weightScale` に集約し、solver では既存 constraint weight と pole weight を乗算した。既存 `reasons` / `poleStabilized` は互換のため維持した。
- `blendWeight` は Vector3 blend の alpha として扱った。`uncertain` は previous から bind fallback へ `0.3`、`extended` は `0.5`、`recovering` は `recoveringBlendProgress`、`lost` は `0`、`stable` は measured 優先の `1`。
- `targetReachRatio` 未指定時は solver の clamp 前 `target.wrist.length() / armLength` を使うようにした。
- `wristRollInfluence` は `0..1` clamp して constraint snapshot に保存するだけに留めた。twist 分配、wrist roll damping、angular velocity clamp の実適用は task.md の境界どおり composer 側に残した。
- `SincroArmIkConstraintSnapshot.reasonCodes` が配列 field になったため、retarget frame の clone helper で配列共有しないよう追従した。
- ドキュメント同期として `documents/design/frontend/character/motion.md` に ArmPoleState v1、state 判定、blend / downweight 規則、snapshot additive fields、wrist roll damping は composer 側に残す境界を反映した。

### 確認

- `npm run test -- sincroArmIkPole`: PASS
- `npm run test -- motionMetrics`: PASS
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run gate`: PASS (`3ecedfc`, clean)

### コミット

- `3ecedfc feat(character): add arm IK pole states`

### 残リスク / 未実行

- `sincroArmIkSolver` 専用の既存 test file は無かったため、solver 接続は TypeScript build と全体 test / gate で確認した。
- Vite build は既存どおり 500 kB 超 chunk warning を出すが、本タスク起因ではない。

## attempt 2

### 判断 / 対応

- 評価 FAIL は、measured candidate が target 軸に平行で unusable になる分岐だけが state 別 blend を通らず、`temporalState: "lost"` でも previous 100% ではなく bind fallback を返す問題だった。
- `resolveArmIkPoleDirection()` で candidate usable / unusable を分岐終了させず、unusable 時も projected previous（なければ bind fallback）を作って同じ `directionForState()` に流すよう修正した。
- hard reject / soft downweight は measured candidate が usable な時だけ評価するようにし、unusable candidate で疑似 fallback との dot による `pole_flip_rejected` が出ないようにした。
- 実装者テストへ acceptance と同じ lost + unusable measured candidate の回帰ケースと、previous 欠損時に bind pole 100% になるケースを追加した。
- 追加希望に対応し、fake VRM source から `SincroArmIkSolver.fromVrm()` を通す solver test を追加した。`poleState`、`reasonCodes`、constraint `weightScale` と solver `weight` の乗算、`wristRollInfluence` clamp、未指定 `targetReachRatio` による `extended` 判定を直接検証している。
- solver test 用に `fromVrm()` / `captureSincroArmIkSkeleton()` の引数型を、実行に必要な最小 surface (`scene.updateMatrixWorld` と `humanoid.getNormalizedBoneNode`) へ広げた。実 VRM caller は構造的に互換で、runtime 処理は変えていない。

### 確認

- `npm run test -- sincroArmIkPole`: PASS
- `npm run test -- sincroArmIkSolver`: PASS
- `npm run test -- sincroArmIkPole sincroArmIkSolver`: PASS
- acceptance `arm-pole-unusable-candidate.test.ts`: PASS
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run gate`: PASS (`4bd863e`, clean)

### コミット

- `4bd863e fix(character): blend unusable arm pole candidates`

### 残リスク / 未実行

- `SincroArmIkSolver.fromVrm()` の引数型を広げたが、実 VRM caller は同じ method surface を持つため runtime 互換と判断した。
- Vite build の 500 kB 超 chunk warning は継続しているが、本修正起因ではない。
