# character animation 3.0 phase 6 arm pole constraints

## 背景 / 目的

Phase 6 は `ArmPoleState` として `Stable`、`Uncertain`、`Extended`、`Lost`、`Recovering` を導入し、measured / previous / fallback pole を状態別に blend することを求めている。

現行 IK は `resolveArmIkPoleDirection()` で candidate pole と previous / bind pole を比較し、flip しそうな場合に fallback する。これは軽量で良いが、temporal state、腕の伸び切り、recovering 中の復帰、debug reason を表す contract が不足している。

このタスクでは既存 2-bone analytic IK を継続しつつ、pole state と constraint snapshot を拡張し、肘反転 / 腕の伸び切り / 手首 roll 暴れを後続 composer と metrics が説明できる形にする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/ik/sincroArmIkPole.ts` に `ArmPoleState` 型を追加する。値は `"stable" | "uncertain" | "extended" | "lost" | "recovering"` に固定する。
- [ ] `resolveArmIkPoleDirection()` は `temporalState?: TemporalPartState`、`elbowFlexionRad?: number`、`recoveringBlendProgress?: number`、`previousPoleDirection?: Vector3`、`targetReachRatio?: number` を受け取れる option を追加し、戻り値に `state`、`reasonCodes`、`blendWeight`、`weightScale` を含める。
- [ ] pole state は次の規則で決める。`lost` input は `"lost"`、`recovering` input は `"recovering"`、`elbowFlexionRad < 0.18` または target reach ratio `> 0.96` は `"extended"`、candidate が previous / bind から hard reject された場合は `"uncertain"`、それ以外は `"stable"`。
- [ ] `stable` は measured candidate を優先、`uncertain` は previous 70% / fallback 30%、`extended` は previous 50% / fallback 50%、`recovering` は previous から measured へ `recoveringBlendProgress` で blend、`lost` は previous 100% とする。previous が無い state では `bindPoleDirection` を previous とみなす。
- [ ] hard reject は candidate と previous projected pole の dot が `poleFlipDotThreshold` 未満の場合に行い、`reasonCodes` に `pole_flip_rejected` を入れる。
- [ ] soft downweight は dot が `poleFlipDotThreshold <= dot < 0.18` の場合に発火し、`reasonCodes` に `pole_uncertain_downweighted` を入れ、resolver 戻り値の `weightScale` を `0.82` にする。hard reject 時は `weightScale` を `0.68` にする。stable / recovering で soft range 外なら `weightScale` は `1` にする。
- [ ] `SincroArmIkConstraintSnapshot` に `poleState?: ArmPoleState`、`reasonCodes?: string[]`、`angularVelocityClamped?: boolean`、`wristRollDamped?: boolean`、`wristRollInfluence?: number` を additive に追加する。既存 `reasons`、`jointLimited`、`poleStabilized`、`collisionAvoided`、`weightScale`、`targetPushDistance` は削除 / rename しない。
- [ ] `SincroArmIkSolver.solve()` は `SincroArmIkTarget` の optional `temporalState`、`elbowFlexionRad`、`recoveringBlendProgress`、`targetReachRatio`、`wristRollInfluence` を pole resolver / constraint snapshot へ渡せるようにする。未指定時は現行挙動と同等にする。
- [ ] wrist roll は本タスクでは quaternion 分配を実装せず、`SincroArmIkTarget.wristRollInfluence?: number` を `0..1` に clamp して `SincroArmIkConstraintSnapshot.wristRollInfluence` へ保存する。実際の forearm / wrist twist 分配は composer task に残す。
- [ ] 既存 IK test に加え、`sincromisor-frontend/src/character/ik/__tests__/sincroArmIkPole.test.ts` または相当 test を追加 / 更新し、stable、uncertain hard reject、extended、lost、recovering blend を検証する。
- [ ] `documents/design/frontend/character/motion.md` に `ArmPoleState` v1、state 判定、wrist roll damping は Phase 6 composer 側で完成させる境界を同期する。

## 設計判断（着手前に確定済み）

- pole state は IK module の責務とする。TemporalStateEstimator に入れる案は、Temporal が VRM quaternion / IK pole を扱わない設計になっているため採用しない。
- `ArmPoleState` の enum は lower-case string で保存する。debug / replay log と揃えるため、class instance や numeric enum は採用しない。
- `SincroArmIkTarget` は additive に optional field を増やす。既存 caller が `{ wrist, elbowPole, weight }` だけで動く互換性を維持する。
- 追加する `SincroArmIkTarget` optional field は次に固定する。

```ts
type SincroArmIkTarget = {
    wrist: Vector3;
    elbowPole: Vector3;
    weight: number;
    temporalState?: TemporalPartState;
    elbowFlexionRad?: number;
    recoveringBlendProgress?: number;
    targetReachRatio?: number;
    wristRollInfluence?: number;
};
```

- `reasonCodes` は新規 field として追加する。既存 `reasons` は UI / metrics で参照されている可能性があるため削除しない。重複期間を許す。
- target reach ratio は `SincroArmIkSolver.prepareTarget()` で clamp 前 `target.wrist.length() / (upperArmLength + lowerArmLength)` を計算し、caller が `targetReachRatio` を渡していない場合はこの値を resolver へ渡す。
- pole `weightScale` は `constraintResolver.constraintWeightScale(...) * elbowPole.weightScale` として乗算する。既存 `poleStabilizedWeightScale` は維持し、hard / soft downweight と重複する場合も乗算する。
- angular velocity clamp の最終 quaternion への適用は `VrmPoseComposer` の責務にする。本タスクでは constraint snapshot に必要 field を用意し、solver 内では pole weight / target constraint までに留める。
- 外部境界はない。入力 validation は finite number と known temporal state のみにする。

## スコープ境界

- 本タスクでやること:
    - `ArmPoleState` と pole resolver の状態化。
    - pole hard reject / soft downweight の reason code 化。
    - IK target / solve result / constraint snapshot の additive 拡張。
    - pole state の単体テストと設計文書同期。
- 本タスクでやらないこと:
    - Temporal arm state から IK target を作る bridge。
    - final pose composer、VRM normalized pose 書き込み。
    - wrist roll の実際の forearm / wrist twist 分配。
    - semantic gesture / finger 制御。
- 依存タスクとの境界:
    - `minimal avatar motion profile` の `wristRollInfluence` は option / snapshot に載せるが、本タスクでは最終適用しない。
    - `temporal arm solver bridge` が optional temporal state を target に載せる。未実装でも既存 caller は動くようにする。

## 実装方針（既存コード整合: file:line）

- 現行 pole resolver は `SincroArmIkElbowPole` に `direction` と `stabilized` だけを返す（`sincromisor-frontend/src/character/ik/sincroArmIkPole.ts:4`）。ここへ state / reason / blend weight を additive に加える。
- `resolveArmIkPoleDirection()` は candidate pole を target direction へ射影し、usable なら `stabilizePoleDirection()` へ渡している（`sincromisor-frontend/src/character/ik/sincroArmIkPole.ts:17`, `sincromisor-frontend/src/character/ik/sincroArmIkPole.ts:24`, `sincromisor-frontend/src/character/ik/sincroArmIkPole.ts:28`）。この流れを保ち、state 判定を追加する。
- 現行 hard reject 相当は candidate dot が threshold 未満のとき fallback を返す処理である（`sincromisor-frontend/src/character/ik/sincroArmIkPole.ts:68`, `sincromisor-frontend/src/character/ik/sincroArmIkPole.ts:71`）。本タスクでは reason code と downweight を追加する。
- `SincroArmIkConstraintSnapshot` は constraint / debug の保存単位である（`sincromisor-frontend/src/character/ik/sincroArmIkConstraint.ts:5`）。additive field として pole state を保存する。
- `SincroArmIkSolver.solve()` は prepared target から constraint result を作り、`weight` に constraint weightScale を掛けて返している（`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:155`, `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:172`, `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:189`）。ここで pole state による weightScale を合成する。

## テスト

- `cd sincromisor-frontend && npm run test -- sincroArmIkPole`
- `cd sincromisor-frontend && npm run test -- sincroArmIkSolver`
- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer-visible な IK constraint snapshot と debug reason が増えるため、`documents/design/frontend/character/motion.md` に `ArmPoleState`、constraint snapshot additive fields、wrist roll 適用を後続 composer へ残す判断を同期する。
