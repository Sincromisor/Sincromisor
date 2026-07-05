# Connect gesture observations to reliability map

## 背景 / 目的

roadmap は `ReliabilityMap.gesture` が placeholder のままで、Gesture Recognizer の実観測 label / confidence を reliability component として合成する接続が未実装だと整理している。現行 production runtime は Gesture snapshot を `GestureIntentObservation` へ正規化して MotionIntent へ渡せるが、`ReliabilityMap.gesture` は `source: "neutral"` のまま維持されている。

本タスクでは Gesture Recognizer の normalized observation を `ReliabilityMap.gesture` へ接続し、MotionIntent の gesture gate と debug / replay が同じ gesture reliability を読める状態にする。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/reliability/gestureReliabilityEstimator.ts` を追加し、`createGestureReliability(input)` を exportする。入力は `gesture?: GestureIntentObservation`、`hand?: SincroHandMotionSnapshot`、`previous?: ReliabilityMap["gesture"]`、`cameraQuality?: CameraQualityScore`、`mediaTimeMs: number` に限定する。
- [ ] `GestureReliability` の `source` は、観測ありなら `"gesture"`、Gesture optional pass が skip / lost なら `"neutral"` にする。unknown raw label でも観測自体が valid なら `source: "gesture"` とし、semantic intent 昇格とは分ける。
- [ ] `components.tracking` は左右 top label confidence の最大値、`components.side` は Hand side assignment と gesture side の整合、`components.roi` は Hand snapshot の ROI warning / source、`components.cameraQuality` は既存 camera component から計算する。未入力 component は score `0`、reason `no_observation` とする。
- [ ] `stableDurationMs` は同じ side + label が連続した時間だけ加算し、label change、side missing、confidence threshold 未満、media time 逆行で `0` に reset する。dt は `0..1000ms` に clamp する。
- [ ] `finalWeight` は `tracking`、`side`、`roi`、`cameraQuality` の最小値を base とし、`stableDurationMs < 160` の場合は `0.5` を上限にする。値は常に `0..1` に clamp する。
- [ ] `createPoseReliabilityMap()` は optional `gesture` input を受け取り、未指定時だけ従来の `createUnavailableGesture(cameraQuality)` placeholder を返す。
- [ ] `SincroMotionObserveOnlyPipeline.updateGesture()` は latest gesture observation を保存し、次回 `updatePose()` / reliability 更新時に `createPoseReliabilityMap()` へ渡す。Gesture callback 単独では Pose / canonical / temporal を再計算しない。
- [ ] `MotionIntentEstimator` の gesture gate は、利用可能な場合 `ReliabilityMap.gesture.finalWeight` と該当 hand / finger reliability を使う。ReliabilityMap が欠損する legacy / test 入力では現行の hand side confidence fallback を維持する。
- [ ] debug / replay viewer の reliability layer は `gesture.source`、`finalWeight`、`confidence`、`stableDurationMs`、warnings を表示・保存できる。MediaPipe raw category list や raw handedness object は表示 / 保存しない。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも gesture reliability estimator、stability duration、MotionIntent gate、observe-only update ordering、raw label 非保存境界を含める。
- [ ] comment audit 記録だけでは完了扱いにしない。新規 public export、schema/parser、MediaPipe / Worker / debug boundary、heuristic threshold、fallback decision に必要な JSDoc/TSDoc の追加・更新、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- Gesture reliability は `character/reliability/gestureReliabilityEstimator.ts` に分離する。`poseReliabilityEstimator.ts` に大きな gesture logic を埋め込む案は、Pose / Hand / Face reliability と semantic label stability の責務が混ざるため採用しない。
- `ReliabilityMap` の schemaVersion は維持する。`gesture` slot は既に contract に存在するため、placeholder から実値へ変えるだけなら optional slot 追加ではない。
- Gesture callback 単独で canonical / temporal を更新しない。Pose frame と異なる cadence の optional pass が上半身 state を別 timestamp で押し出すと replay 再現性が落ちるため。
- raw label は reliability の debug reason と stability 判定に使うが、raw category list は保存しない。既存 Gesture task の「圧縮 snapshot」境界を維持する。
- 公開 WebRTC / backend 契約、DataChannel payload、server code は変更しない。

## スコープ境界

- 本タスクでやること: Gesture reliability estimator、`createPoseReliabilityMap` input 拡張、observe-only pipeline 接続、MotionIntent gate の reliability 利用、debug / replay 表示、tests、docs sync。
- 本タスクでやらないこと: Gesture Recognizer runtime の新規導入、semantic / finger layer の新規 motion、authored animation clip、ReliabilityMap schemaVersion の major 更新、backend / WebRTC 契約変更。
- 依存タスクとの境界: `task-260705181009-production-gesture-recognizer-optional-pass` が Gesture optional pass と `GestureIntentObservation` 正規化を提供済み。本タスクはその観測値を reliability へ接続する。

## 実装方針（既存コード整合: file:line）

- `ReliabilityMap` は既に `gesture: GestureReliability` を必須 field として持つ（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:166`、`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:175`）。
- default map の gesture は `state: "lost"`、`source: "neutral"`、`confidence: 0`、`stableDurationMs: 0` の placeholder である（`sincromisor-frontend/src/character/reliability/reliabilityMap.ts:458`）。
- `createPoseReliabilityMap()` は現在 `gesture: createUnavailableGesture(cameraQuality)` を固定で返す（`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:56`、`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:78`）。
- Gesture callback export は snapshot を受け取り、MotionIntentEstimator へ渡す値は caller が `input.gesture` に入れたものだけを使う（`sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts:405`）。
- 設計文書も現状では `ReliabilityMap.gesture` を placeholder と明記している（`documents/design/frontend/character/motion.md:348`）。

## テスト

- `cd sincromisor-frontend && npm run test -- gestureReliabilityEstimator poseReliabilityEstimator reliabilityMap`
- `cd sincromisor-frontend && npm run test -- sincroMotionObserveOnlyPipeline motionIntentEstimator motionDebugViewerModel`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な reliability contract と MotionIntent gate が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に Gesture reliability の入力、cadence 境界、placeholder 廃止条件、debug / replay 表示を同期する。公開 WebRTC / backend 契約は変更しない。
