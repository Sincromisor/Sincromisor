# character animation 3.0 phase 5 temporal debug replay metrics

## 背景 / 目的

Phase 5 の実装は、replay / debug で `tracked` / `suspect` / `predicted` / `lost` / `recovering` を確認できて初めてフェーズゲートを満たす。前段タスクで `TemporalStateEstimator` の contract と prediction / recovery が揃うため、このタスクでは motion-debug の live snapshot、recording、replay viewer、metrics summary へ temporal layer を接続する。

依存:

- `task-260625194536-character-animation-3-phase-5-dropout-prediction-recovery`
- `task-260623221639-character-animation-3-motion-metrics-baseline`
- `task-260623221644-character-animation-3-motion-debug-layered-viewer`

## 完了条件（受け入れ条件）

- [ ] `MotionDebugApp` は live camera / video fixture / replay pose-snapshot の pose callback で `TemporalStateEstimator.update()` を呼び、最新 `TemporalUpperBodyState` を `MotionDebugSnapshot.temporal` に保存する。camera stop、video fixture load、recording load、replay stop、source reset では estimator を `reset()` する。
- [ ] `MotionDebugRecordingController.recordPoseFrame()` は同じ frame の `canonical` / `reliability` 解決後に `temporal` を受け取り、`frame.temporal` optional slot へ保存する。`frame.timestamp.mediaTimeMs` と `temporal.timestamp.mediaTimeMs` が一致しない場合は recording を失敗させず、frontendLogger warning と temporal layer warning に留める。
- [ ] replay viewer は `frame.temporal` がある場合 `parseTemporalUpperBodyState()` で検証して表示し、invalid な場合も replay failure にせず `parseStatus: "invalid"`、parse errors、raw value を `available` layer value として表示する。`frame.temporal` が無い旧 log では `not_recorded`、live snapshot に temporal がある場合は live value を表示する。
- [ ] `MotionDebugSnapshot` と viewer type に `temporal?: TemporalUpperBodyState | TemporalLayerParseError` を追加する。`TemporalLayerParseError` は canonical / reliability と同じ `parseStatus: "invalid"` shape にする。
- [ ] temporal layer の JSON 表示では、左右腕の `state`、`confidence`、`source`、`stateAgeMs`、`observedAgeMs`、`warnings`、`recoveringBlend`、`velocity` が確認できる。UI に新しい説明文や keyboard shortcut 文言は追加しない。
- [ ] motion metrics は既存 `MotionMetricResult.value: number | null` 契約を維持し、複合 object は追加しない。`MotionMetricKey` に `temporalPredictedArmFrameCount`、`temporalRecoveringArmFrameCount`、`temporalLostArmDurationMs`、`temporalMaxRecoveryJumpDegEquivalent`、`temporalNeutralWristJitter` を追加する。
- [ ] `temporalPredictedArmFrameCount` / `temporalRecoveringArmFrameCount` は arm-frame 単位で数える。1 frame で左右両腕が該当 state なら 2、片腕だけなら 1 とする。unit は `count`、direction は `lower_is_better`、threshold は predicted `{ pass: 0, warn: 40, fail: 120 }`、recovering `{ pass: 0, warn: 30, fail: 90 }` に固定する。
- [ ] `temporalLostArmDurationMs` は left / right arm の lost state duration を合算した ms とする。各 frame の `dtMs` は隣接する `frame.timestamp.mediaTimeMs` 差分を `0..250` に clamp し、片腕 lost なら `dtMs`、両腕 lost なら `2 * dtMs` を加算する。unit は `ms`、direction は `lower_is_better`、threshold は `{ pass: 250, warn: 1000, fail: 2500 }` に固定する。
- [ ] `temporalMaxRecoveryJumpDegEquivalent` は recovering 中の arm scalar の連続 frame 差分を deg 相当に換算した最大値とする。`elevationRad` と `elbowFlexionRad` は `abs(delta) * 180 / Math.PI`、`reach` / `forwardness` は `abs(delta) * 90`、`openness` は `abs(delta) * 45` とし、左右腕・全 recovering frame の最大を value にする。unit は `deg`、direction は `lower_is_better`、threshold は `{ pass: 15, warn: 25, fail: 45 }` に固定する。
- [ ] `temporalNeutralWristJitter` は `fixtureId === "neutral-10s"` のときだけ available とし、tracked / suspect の temporal `bodyLocalWrist` 連続差分 RMS を左右合算で計算する。body-local unit の無次元 ratio として扱い、unit は `ratio`、direction は `lower_is_better`、threshold は `{ pass: 0.015, warn: 0.035, fail: 0.06 }` に固定する。neutral fixture 以外、または temporal wrist sample が 2 未満なら `not_available` にする。
- [ ] `MOTION_METRIC_KEYS`、`DEFAULT_MOTION_METRIC_THRESHOLDS`、`METRIC_DEFINITIONS`、`resolveThresholds()`、baseline schema fixture / tests を更新し、全追加 key が existing summary / baseline / comparison の 1 数値 metric として扱われることを確認する。
- [ ] unit test で、live snapshot temporal 表示、saved valid temporal 優先、invalid temporal parse error、旧 log `not_recorded`、recorded frame の `frame.temporal` 保存、metrics の prediction / recovering count と jump threshold を検証する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に、temporal layer の live / recording / replay 解決順、invalid frame の扱い、metrics key を同期する。

## 設計判断（着手前に確定済み）

- runtime 接続は motion-debug page に限定する。通常 `simple-vrm` / `sincro` runtime の retarget 入力を temporal に差し替えると Phase 6 の MotionSolver / IK 責務まで含むため、本タスクでは debug / replay / metrics で挙動を確認できる状態にする。
- `frame.temporal` は `motionDebugLogSchema.ts` の既存 optional unknown slot を使う。log schema の top-level field 名は変更しない。
- replay 解決順は saved `frame.temporal` を最優先、invalid saved temporal は invalid 表示、欠損時だけ live/recomputed temporal を使う。invalid を捨てて再計算すると、壊れた log を検出できないため採用しない。
- metrics key は Phase 5 用に追加する。Phase 3 では metrics key 増加を避けたが、Phase 5 フェーズゲートは jitter / recovery jump を数値確認することなので、このタスクで baseline fixture 更新まで含める。既存 `MotionMetricSummary.metrics` は `Record<MotionMetricKey, MotionMetricResult>` のまま維持し、state duration の複合 object は state 別 numeric key へ分割する。
- temporal timestamp 不一致は warning に留める。古い log や途中生成 log を replay 可能にする既存方針と合わせ、単一 frame の不一致で load 全体を失敗させない。
- 外部 API / backend / WebRTC 契約は変更しない。

## スコープ境界

- 本タスクでやること:
    - motion-debug live snapshot への temporal state 接続。
    - recording `frame.temporal` 保存。
    - replay viewer temporal layer parse / display。
    - Phase 5 metrics key と thresholds。
    - design doc 同期。
- 本タスクでやらないこと:
    - 通常 character runtime の retarget / IK 入力を temporal に差し替える。
    - `VrmPoseComposer`、final quaternion smoothing、IK elbow pole の変更。
    - user-facing settings UI の追加。
    - Hand / Face / Gesture 専用 temporal state。

## 実装方針（既存コード整合: file:line）

- motion debug log frame schema は `temporal` optional slot を既に持つ（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:102`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:111`）。本タスクでは schema slot 名を変えず、保存する値の parser / viewer を追加する。
- viewer layer key には `temporal` が存在し、現状は replay frame の unknown 値をそのまま layer snapshot に渡している（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:31`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:127`）。ここへ `parseTemporalUpperBodyState()` を接続する。
- `MotionDebugSnapshot` は canonical / reliability の parse error shape を持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:52`、`sincromisor-frontend/src/pages/motionDebug/types.ts:58`、`sincromisor-frontend/src/pages/motionDebug/types.ts:122`）。Temporal も同じ型パターンにする。
- live pose / fallback / replay pose の接続点は `MotionDebugApp.handlePoseMotion()`、`handlePoseFallback()`、`applyReplayPoseSnapshot()` である（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:568`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:583`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:597`）。canonical / reliability 更新後に temporal を更新する。
- recording は `MotionDebugApp.recordPoseFrame()` から `MotionDebugRecordingController.recordPoseFrame()` へ pose / timing / cameraQuality / reliability を渡している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:540`）。この経路に temporal を追加し、既存 canonical 保存順と矛盾させない。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な debug / replay / metrics contract が増えるため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に temporal layer の解決順、invalid temporal の扱い、Phase 5 metrics key を同期する。公開 WebRTC / backend 契約は変更しない。
