# Run Gesture Recognizer as production optional pass

## 背景 / 目的

roadmap は `MotionIntentEstimator` が optional gesture input を受け取れる一方、MediaPipe `GestureRecognizer` の実行接続が未実装であると整理している（`documents/research/character_animation/roadmap.md:80`、`documents/research/character_animation/roadmap.md:95`、`documents/research/character_animation/roadmap.md:221`）。既存設計も Phase 8 では gesture label を流さず、Gesture Recognizer の runtime 接続を後続へ残すとしている（`documents/design/frontend/character/tracking.md:120`、`documents/design/frontend/character/motion.md:340`）。

本タスクでは Gesture Recognizer を production `sincro` の optional lower-fps pass として実行し、raw label を `GestureIntentObservation` へ正規化して observe-only `MotionIntentEstimator` に渡す。Gesture は主制御器ではなく MotionIntent の補助入力に留める。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/gestureTracking/` を追加し、`SincroGestureMotionSnapshot`、`SincroGestureSideSnapshot`、`SincroGestureTracker` を定義する。
- [ ] Gesture Recognizer model asset path は `/3rd_party/gesture_recognizer.task` に固定する。delegate は既存 Hand / Face tracker と同じ runtime policy を使い、GPU unavailable / init failure では lost snapshot + warning に落とす。
- [ ] `SincroGestureMotionSnapshot` は JSON 保存可能な `{ trackingEnabled; source; left?; right?; warnings; inferenceTimeMs; inferenceFps; lastUpdatedAtMs?; fallbackReason? }` に固定し、MediaPipe raw landmark、crop object、ImageBitmap、VideoFrame、class instance を含めない。
- [ ] side snapshot は `{ label: string; confidence: number; handedness?: "left" | "right" | "unknown"; source: "gesture-recognizer" | "lost"; warnings: string[] }` に固定し、confidence は `0..1` clamp、label は MediaPipe raw label を説明用として保持するだけにする。
- [ ] 1 hand に複数 category が返る場合は、finite score が最大の category を top label として採用する。同 score tie は `categoryName` の昇順で deterministic に選ぶ。category が空または non-finite だけの場合は side を lost とする。
- [ ] Gesture handedness と既存 Hand side assignment が食い違う場合、既存 Hand side assignment を優先し、side snapshot に warning `handedness_mismatch` を残す。Gesture handedness だけで left / right を入れ替えない。
- [ ] `TrackerRuntimeCallbacks` に optional `onGestureMotion` を追加し、`TrackerRuntimePoseOptions.gesture?: { enabled?: boolean; targetInferenceFps?: number }` を追加する。既定 cadence は performance profile の `gestureFps`、指定範囲は `1..8fps` に clamp する。
- [ ] Gesture optional pass は Pose が enabled かつ Hand tracking が enabled のときだけ起動する。Pose disabled / Hand disabled / `roi-hand-paused` / face-only / comfortable-idle では lost snapshot または skip summary を出し、Face / Pose / Hand 経路を止めない。
- [ ] Gesture Recognizer の input は Hand ROI / full-frame hand の最新低次元 snapshot と同じ frame cadence に合わせる。腕 IK target、finger curl source、Hand snapshot contract は上書きしない。
- [ ] `SincroMotionObserveOnlyPipelineInput` に optional `gesture?: GestureIntentObservation` を追加し、`MotionIntentEstimator.update({ gesture })` へ渡す。`ReliabilityMap.gesture` は本 task では placeholder のまま維持し、実 reliability 接続は後続 task に残す。
- [ ] mapping は既存 `MotionIntentEstimator` の方針に従い、`"Open_Palm"`、`"Pointing_Up"`、`"Thumb_Up"`、`"Victory"`、`"Closed_Fist"` 以外の raw label は semantic intent へ昇格しない。`"None"` や unknown label は `sourceGestureLabel` には残り得るが intent の代替値にはしない。
- [ ] Debug Console summary は full snapshot ではなく圧縮 summary に固定する。最小 field は `availability`、side ごとの `label`、`confidence`、`source`、`warnings`、`inferenceFps` とし、MediaPipe raw category list や handedness raw object は表示 / 保存しない。
- [ ] Worker 経路と main-thread fallback の両方で、Gesture Recognizer 初期化失敗 / 推論例外が lost gesture snapshot と warning に落ち、tracker runtime 全体の停止にならないことを test で確認する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期し、gesture optional pass の cadence、degradation、MotionIntent への補助入力、ReliabilityMap placeholder 維持を明記する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも gesture snapshot contract、raw label 境界、optional pass cadence、Worker/main fallback、lost snapshot fallback、MotionIntent への正規化、ReliabilityMap placeholder 維持を含める。
- [ ] comment audit 記録だけでは完了扱いにしない。新規 public export、MediaPipe boundary、Worker / main-thread lifecycle、degradation cadence、raw label normalization、Debug Console summary、observe-only input boundary について、必要な JSDoc/TSDoc の追加・更新、コメント省略理由、弱い既存コメントの rewrite / delete、stale comment の更新・削除を実コードと `impl.md` の両方で確認できること。TODO を追加または変更する場合は、理由、削除条件、canonical task ID、期限または判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- Gesture は Hand snapshot へ混ぜず、`features/gaze/gestureTracking` の独立 snapshot と callback にする。Phase 8 の Hand snapshot は palm / finger reliability の材料であり gesture label を流さないという既存境界を維持するため。
- Gesture side assignment は existing Hand side assignment を正本にする。GestureRecognizer handedness で左右を再割当てする案は、Hand ROI の Pose wrist / temporal continuity に基づく side decision と競合し、MotionIntent の side swap を増やすため採用しない。
- observe-only pipeline へ渡す型は `GestureIntentObservation` に正規化済みの `{ left?: { label; confidence }; right?: ... }` に固定する。MediaPipe result 型や GestureRecognizer instance を `character/motionIntent` へ渡さない。
- `ReliabilityMap.gesture` は本 task では placeholder のまま維持する。実 gesture reliability component を同時に変えると、runtime 接続、intent 変化、reliability schema 変化が一 task に混ざるため採用しない。
- Gesture optional pass の production 起動は `SincroCharacterGazeController.startSincroFaceTracking()` の pose options で明示する。通常設定 UI、env var、backend API は追加しない。
- `gesture-reduced-fps` degradation stage は既存 policy の cadence 値を実 pass に反映する。stage 名や degradation enum の rename はしない。

## スコープ境界

- 本タスクでやること: GestureRecognizer tracker / snapshot、TrackerRuntime callback / options、Worker / main fallback 接続、observe-only MotionIntent input、Debug Console summary、tests、docs sync。
- 本タスクでやらないこと: Gesture reliability 実観測接続、semantic / finger composer layer の新規挙動追加、authored animation clip、user-facing gesture setting UI、motion-debug recording schema の major 変更、WebRTC / backend 契約変更。
- 依存タスクとの境界: `task-260627180718-character-animation-3-0-phase-9-gesture-intent-estimator-hys` が optional gesture observation を読む estimator を提供し、`task-260629225931-production-sincro-hand-face-roi-observations` が production Hand / Face ROI 観測を提供する。本タスクは GestureRecognizer 実行と estimator への受け渡しだけを担う。

## 実装方針（既存コード整合: file:line）

- `TrackerRuntimeCallbacks` は現状 Face / Hand / Pose / stats / error callback だけを持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:39`）。
- `TrackerRuntimePoseOptions` は Hand / Face ROI option を持つが Gesture option は持たない（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:48`）。
- performance profile には `gestureFps` が既に存在する（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePerformanceProfile.ts:32`）。
- ordered degradation policy は `gesture-reduced-fps` を先頭 stage として持つが、現設計では実 Gesture runtime は未起動扱いである（`documents/design/frontend/character/tracking.md:83`、`documents/design/frontend/character/tracking.md:85`）。
- `MotionIntentEstimator` は optional `gesture` input を読む（`documents/design/frontend/character/motion.md:340`）。
- raw label mapping は設計文書で固定されている（`documents/design/frontend/character/motion.md:341`）。
- production `startSincroFaceTracking()` は Hand / Face ROI を pose options で有効化しているため、Gesture option も同じ境界へ追加する（`sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts:290`）。

## テスト

- `sincromisor-frontend/src/features/gaze/gestureTracking/__tests__/sincroGestureTracker.test.ts` を追加し、detected label、unknown label、confidence clamp、lost fallback、initialization failure を検証する。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntime.test.ts` または Worker 近傍 test を拡張し、gesture cadence、degradation stage による fps 低下、Hand / Pose disabled 時の skip / lost を検証する。
- `sincromisor-frontend/src/character/runtime/__tests__/sincroMotionObserveOnlyPipeline.test.ts` を拡張し、gesture observation が `MotionIntentEstimator` に渡り、`ReliabilityMap.gesture` は placeholder のままであることを検証する。
- `cd sincromisor-frontend && npm run test -- sincroGesture trackerRuntime sincroMotionObserveOnlyPipeline motionIntentEstimator`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な tracker optional pass と production MotionIntent 入力が増えるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期する。公開 WebRTC / backend 契約は変更しない。
