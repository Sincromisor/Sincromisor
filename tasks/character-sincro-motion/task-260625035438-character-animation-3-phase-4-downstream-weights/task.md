# character animation 3.0 phase 4 canonical reliability propagation

## 背景 / 目的

Phase 4 の完了条件は、悪い観測値を即破棄せず低 weight として下流へ渡し、後続の TemporalStateEstimator / MotionSolver / MotionIntent が同じ reliability を読める状態にすることである。ただし Phase 5 の TemporalStateEstimator や Phase 9 の MotionIntent はまだ未実装のため、このタスクでは現行 downstream で存在する `CanonicalUpperBodyState` の confidence / source / warnings と motion-debug の developer state にだけ Phase 4 reliability を接続する。

このタスクでは、`motion-debug` で生成された `ReliabilityMap` を `CanonicalUpperBodyState` 生成へ渡し、腕 confidence / source / warnings に反映する。既存 retarget path が canonical ではなく `SincroPoseMotionSnapshot` を読んでいる現状は崩さず、Phase 5 / 6 以降へ進むための `reliability` 付き canonical snapshot / debug state を固定する。

依存:

- `task-260625035438-character-animation-3-phase-4-reliability-contract`
- `task-260625035438-character-animation-3-phase-4-pose-reliability-estimator`
- `task-260625035438-character-animation-3-phase-4-reliability-debug-replay`

## 完了条件（受け入れ条件）

- [ ] `createMotionDebugCanonicalState()` と `createCanonicalUpperBodyState()` の入力に optional `reliability?: ReliabilityMap` を追加する。未指定時は従来どおり pose / torso 由来 confidence を使い、既存 tests の期待値が壊れない。
- [ ] `extractCanonicalArmState()` は reliability がある場合、`leftArm` / `rightArm` の `PartReliability.finalWeight` と shoulder / elbow / wrist joint finalWeight の最小値を使って `CanonicalArmState.confidence` を downweight する。計算式は `poseConfidence * sqrt(partWeight * minJointWeight)` に固定する。
- [ ] low reliability の理由は `CanonicalArmState.warnings` に反映する。`part.finalWeight < 0.35` または `minJointWeight < 0.35` は `low_confidence`、該当 arm の part / joint `components.side.reasonCodes` に `side_inconsistent` があれば `left_right_swap_suspect`、`components.boneLength.reasonCodes` に `bone_length_inconsistent` または `components.bodyScale.reasonCodes` に `body_scale_jump` があれば `out_of_range` を追加する。`ReliabilityWarningCode` ではなく `ReliabilityReasonCode` を読む。
- [ ] reliability が `state: "lost"` の arm は canonical source を `"neutral"` にし、`bodyLocalWrist` / `bodyLocalElbow` は保存してもよいが confidence 0 にする。`state: "suspect"` は source `"pose"` のまま低 confidence 観測として残す。
- [ ] `MotionDebugApp` の live / replay canonical 生成は、その frame の reliability を渡す。saved replay reliability が invalid の場合は reliability 未指定として canonical を生成し、parse error は reliability layer にだけ残す。
- [ ] `MotionDebugSnapshot` に developer-only optional `canonicalReliabilityInput` を追加し、最新 canonical が使った `leftArm.partWeight`、`leftArm.minJointWeight`、`rightArm.partWeight`、`rightArm.minJointWeight`、`schemaVersion`、`mediaTimeMs` を JSON で確認できる。Debug Console への新規 slot 追加は本タスクでは行わない。
- [ ] 既存 `CharacterBehaviorState.applyPoseMotion()` / `SincroPoseRetargeter` の入力 contract は変更しない。現行 character motion の見た目を Phase 4 で大きく変えず、canonical / debug / replay の信頼度伝播を先に確認する。
- [ ] ユニットテストで、reliability 未指定時は旧 confidence、tracked high reliability はほぼ旧 confidence、suspect reliability は downweight、lost reliability は confidence 0 + neutral source、`components.side.reasonCodes` / `components.boneLength.reasonCodes` / `components.bodyScale.reasonCodes` は canonical warnings に反映されることを確認する。
- [ ] `documents/design/frontend/character/motion.md` に、Phase 4 時点では reliability を canonical confidence / debug state に接続し、retarget / IK への完全適用は Phase 5 / 6 の TemporalStateEstimator / MotionSolver で行うことを同期する。

## 設計判断（着手前に確定済み）

- downstream 接続の第一段は canonical confidence と motion-debug snapshot に限定する。現行 retarget path は `CharacterBehaviorState.applyPoseMotion()` から `SincroPoseRetargeter` へ `SincroPoseMotionSnapshot` を渡す構成であり、canonical state を本番 retarget の入力にはしていない。Phase 4 でこの経路を差し替えると Phase 5 / 6 の責務まで膨らむため、まず debug / replay で reliability propagation を確認できる状態にする。
- `SincroPoseMotionSnapshot` の `ikWeight` を ReliabilityMap で直接書き換えない。snapshot は tracker 観測の記録であり（`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseMotionSnapshot.ts:25`）、reliability は別 layer として保存する。既存観測値を mutate すると replay の raw observation と制御判断が混ざる。
- canonical downweight 式は `poseConfidence * sqrt(partWeight * minJointWeight)` に固定する。単純 min だけでは弱すぎ、単純平均では 1 joint の破綻を隠すため、part と最弱 joint を両方反映する。
- canonical warning への変換は `ReliabilityReasonCode` だけを読む。`ReliabilityWarningCode` は map 全体や component 集約の表示用であり、downstream の分岐条件には使わない。
- `suspect` は捨てずに source `"pose"` のまま残す。roadmap Phase 4 の「悪い観測値を即破棄せず、低 weight として TemporalStateEstimator へ渡す」方針に合わせる。
- `predicted` / `recovering` の意味づけは Phase 5 の責務であり、本タスクでは `ReliabilityMap` に存在しても canonical source へ新しい `predicted` 動作を実装しない。

## スコープ境界

- 本タスクでやること:
    - ReliabilityMap を canonical state 生成へ渡す。
    - arm confidence / source / warnings への downweight。
    - motion-debug live / replay canonical 生成で同じ reliability を読む。
    - `MotionDebugSnapshot.canonicalReliabilityInput` で使用 weight を確認できるようにする。
- 本タスクでやらないこと:
    - `SincroPoseRetargeter` / IK solver の重みを reliability で直接変更する。
    - TemporalStateEstimator、filter weight、gesture / semantic trigger の実装。
    - Hand / Face / Gesture reliability の追加。
    - 本番 `sincro` ページの UI 変更。

## 実装方針（既存コード整合: file:line）

- `createMotionDebugCanonicalState()` は motion-debug page 側で pose / face / previous / mediaTimeMs を受けて canonical state を作っている（`sincromisor-frontend/src/pages/motionDebug/motionDebugCanonicalState.ts:7`、`sincromisor-frontend/src/pages/motionDebug/motionDebugCanonicalState.ts:14`）。ここへ optional reliability を追加する。
- `createCanonicalUpperBodyState()` は左右 arm を `extractCanonicalArmState()` で作り、warnings を集約する（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:136`、`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:150`）。reliability による downweight はこの関数群に閉じる。
- 現在の arm confidence は pose arm confidence、world confidence、torso confidence の min で決まる（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:195`）。本タスクでは未指定時の挙動を維持し、reliability 指定時だけ追加 downweight をかける。
- `MotionDebugApp.updateReplayCanonical()` は saved canonical 優先、なければ poseSnapshot から再計算する（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:574`）。再計算時には同じ replay frame の reliability 解決結果を渡す。
- `MotionDebugApp.handlePoseMotion()` / `handlePoseFallback()` は live pose のたびに pose 適用、Debug Console 更新、recording を行う（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:536`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:549`）。reliability 更新後、recording 前に canonical 用 reliability を揃える。

## テスト

- `cd sincromisor-frontend && npm run test -- canonicalArmFeatureExtractor`
- `cd sincromisor-frontend && npm run test -- motionDebugCanonicalState`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

テストでは、reliability 未指定時の既存 fixture を維持しつつ、low / lost / side inconsistent / bone inconsistent の fixture を追加する。

## ドキュメント同期の要否

要。developer-visible な motion pipeline の責務境界が変わるため、`documents/design/frontend/character/motion.md` に Phase 4 downstream 接続範囲、canonical confidence downweight 式、retarget / IK の完全 reliability 対応は Phase 5 / 6 に残すことを同期する。公開 WebRTC / backend 契約は変更しない。
