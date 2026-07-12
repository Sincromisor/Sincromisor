# character animation 3.0 phase 8 ROI cadence fallback docs

## 背景 / 目的

Pose-seeded Hand / Face ROI は品質改善に効く一方、Pose / Hand / Face を同一 frame で常時実行すると端末負荷が上がる。roadmap は Hand / Face / Gesture を lower fps / event-driven にできるようにし、ROI 失敗時は full-frame / Pose-only fallback へ落とすことを Phase 8 の完了条件に含めている（`documents/research/character_animation/roadmap.md:460`、`documents/research/character_animation/roadmap.md:466`）。性能調査も PerceptionWorker 内で Pose full-frame、Hand lower fps ROI、Face ROI fallback を扱う構成を推奨している（`documents/research/character_animation/answers/06-web-realtime-performance.md:12`）。

このタスクでは、Phase 8 の最後に Hand / Face ROI の cadence、fallback、performance budget report、設計文書を整える。新しい tracker を追加する前段タスクとは分け、ここでは端末負荷が上がってもキャラクター全体が固まらない運用面を固める。

## 完了条件（受け入れ条件）

- [ ] このタスクは依存タスク `task-260627141812-character-animation-3-phase-8-pose-seeded-hand-roi-tracking` が提供する `SincroHandMotionSnapshot`、`TrackerRuntimePoseOptions.hand`、`SincroTrackerWorkerResultMessage.hand`、`SincroTrackerWorkerStats.effectiveHandFps` と、依存タスク `task-260627141812-character-animation-3-phase-8-pose-seeded-face-roi-tracking` が提供する `SincroFaceMotionSnapshot.roi/source/warnings` を前提にする。これらが HEAD に存在しない場合は実装せず、依存未充足として止める。
- [ ] `trackerRuntimeCadence.ts` を拡張し、`shouldRunTrackerFaceRoiInference()` を追加する。Hand cadence は依存 Hand task の `lastHandInferenceAtMs` / `targetHandInferenceFps` を維持し、本タスクでは over-budget pause と skip reason だけを追加する。初期 target は Face ROI `6fps`、full-frame Face `DEFAULT_TARGET_INFERENCE_FPS` を維持する。
- [ ] `TrackerRuntimePoseOptions` に `faceRoi?: { enabled?: boolean; targetInferenceFps?: number }` を追加する。`TrackerRuntimePerceptionOptions` は作らない。未指定時は `faceRoi.enabled = false` とし、既存 Face/Pose/Hand 動作と互換にする。
- [ ] Face ROI の last inference timestamp は full-frame Face / Pose / Hand inference timestamp とは別に `lastFaceRoiInferenceAtMs` として持つ。Pose が lower fps になっても full-frame Face が既存 cadence で継続し、Hand / Face ROI は Pose snapshot が stale の場合 `pose_stale_for_roi` reason で skip する。stale 判定は `mediaTimeMs - latestPose.lastUpdatedAtMs > 250` に固定する。
- [ ] Worker stats に optional `effectiveFaceRoiFps?: number` と optional `roi: SincroTrackerRoiStats` を追加する。既存 `effectiveFaceFps` / `effectivePoseFps` / `effectiveHandFps` は名前や意味を変えない。
- [ ] `SincroTrackerRoiStats` の最小 schema は次に固定する。数値は tracker runtime start 以降の累積で、`stopFaceTracking()` / restart で 0 に reset する。左右 Hand は分けず、Hand ROI 全体として集計する。

```ts
export type SincroTrackerRoiReasonCode =
    | "hand_roi_skipped"
    | "face_roi_skipped"
    | "roi_fallback_full_frame"
    | "roi_inference_over_budget"
    | "pose_stale_for_roi"
    | "hand_roi_paused"
    | "face_roi_paused";

export type SincroTrackerRoiPauseState =
    | "active"
    | "hand-paused"
    | "face-paused"
    | "all-paused";

export type SincroTrackerRoiStats = {
    pauseState: SincroTrackerRoiPauseState;
    fallbackCount: number;
    skippedFrames: number;
    consecutiveOverBudgetFrames: number;
    reasonCodes: SincroTrackerRoiReasonCode[];
};
```

- [ ] performance budget report に ROI reason code `hand_roi_skipped`、`face_roi_skipped`、`roi_fallback_full_frame`、`roi_inference_over_budget`、`pose_stale_for_roi`、`hand_roi_paused`、`face_roi_paused` を追加し、motion-debug tracker metrics で確認できる。budget の `target` / `observed` shape は変えず、ROI の詳細は `SincroTrackerWorkerStats.roi` に閉じる。
- [ ] main-thread fallback では Hand ROI `<= 2fps`、Face ROI `<= 3fps` に clamp し、full-frame Face は既存 `<= 8fps`、Pose は既存 `<= 4fps` の上限を維持する。
- [ ] ROI over-budget 判定は `handInferenceTimeMs + faceRoiInferenceTimeMs > 1000 / max(1, targetPoseInferenceFps) * 0.55` に固定する。片方が未実行の frame は実行した ROI inference time だけで判定する。over-budget が 5 ROI 実行 frame 連続したら pause state を 1 段進め、budget 内 frame が 30 frame 連続したら 1 段戻す。
- [ ] pause order は `"active" -> "hand-paused" -> "face-paused" -> "all-paused"` に固定する。`hand-paused` は Hand ROI だけを skip し Face ROI は継続、`face-paused` は Hand ROI と Face ROI を skip し full-frame Face は継続、`all-paused` は ROI pass を全て skip して既存 Pose face-only fallback 判定へ委譲する。いきなり camera / full-frame Face 全体を止めない。
- [ ] ROI pause 中でも latest Hand / Face snapshot は `fallbackReason` / warning 付きで更新される。Hand は `source = "lost"`、warning `hand_roi_paused` 相当を `fallbackReason` に残す。Face は full-frame Face snapshot を継続し、ROI metadata には warning `face_roi_paused` 相当を残す。motion-debug / reliability が stale と lost を区別できる。
- [ ] `motion-debug` の live snapshot / recording metrics は worker stats の ROI fields を保存し、`viewer.layers.metrics` または tracker JSON から ROI fallback / skip reason を確認できる。
- [ ] `trackerRuntimeCadence` / performance budget / motion-debug viewer tests で、Hand fps clamp、Face ROI fps clamp、Pose stale skip、ROI over-budget degradation、main-thread fallback clamp、existing Face/Pose cadence 互換を検証する。
- [ ] `documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/overview.md` に Phase 8 の cadence、fallback order、degradation reason、debug / replay 観測点を同期する。

## 設計判断（着手前に確定済み）

- Hand ROI は既定 off、Face ROI も既定 off とする。既存 `sincro` 動作へ暗黙に負荷を追加しないため、導入 task 完了直後は motion-debug / 明示 option から有効化する。
- Face full-frame cadence は既存 `DEFAULT_TARGET_INFERENCE_FPS = 15` を維持する。Face ROI は補助 pass であり、Pose cadence や ROI failure によって既存 face tracking を止めない。
- Degradation order は Hand ROI pause -> Face ROI pause -> Pose face-only fallback に固定する。Hand / Face ROI は Phase 8 の optional 品質改善であり、Pose / full-frame Face より先に落とす。
- stats は既存 `SincroTrackerWorkerStats` に optional field を追加する。新しい stats object を別に作る案は Debug Console / motion-debug の表示接続が分散するため採用しない。
- ROI cadence は `mediaTimeMs` 基準に固定する。`performance.now()` は worker round trip / inference cost の計測だけに使い、replay 決定性が必要な cadence 判定には使わない。

## スコープ境界

- 本タスクでやること:
    - Hand / Face ROI cadence と options。
    - Worker stats / performance budget / degradation reason。
    - main-thread fallback clamp。
    - motion-debug metrics 保存。
    - Phase 8 設計文書同期。
- 本タスクでやらないこと:
    - Hand / Face tracker の feature 実装。
    - ReliabilityMap の hand / face 統合。
    - Gesture Recognizer / MotionIntent。
    - 端末クラス別 profile 全体の導入。Phase 10 の責務に残す。
    - UI 設定画面への Hand / Face ROI toggle 追加。motion-debug / internal option に留める。
- 依存タスクとの境界:
    - Hand / Face task が ROI tracking の動作本体を提供する。
    - Reliability/debug task が ROI reliability と replay viewer を提供する。
    - 本タスクはそれらの負荷制御と設計同期を行う。

## 実装方針（既存コード整合: file:line）

- 既存 cadence utility は Face と Pose の判定だけを持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeCadence.ts:15`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeCadence.ts:22`）。Hand / Face ROI cadence はここへ pure function として追加する。
- `TrackerRuntime` は `targetInferenceFps` と `targetPoseInferenceFps`、`lastInferenceAtMs` と `lastPoseInferenceAtMs` を別々に持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:47`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:49`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:249`）。Hand / Face ROI も同じ pattern で別 timestamp を持つ。
- main-thread fallback は Face `<= 8fps`、Pose `<= 4fps` に clamp している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:32`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:33`）。ROI fallback clamp はこの制約を上書きせず追加する。
- Worker stats は effective fps、round trip、fallbackReason、budget を集約する型である（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:15`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:22`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:27`）。ROI stats は optional field として追加する。
- motion-debug recording は tracker stats を `frame.metrics.tracker` に保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:195`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:197`）。ROI stats は同じ metrics slot に入れる。
- performance 調査は Hand / Face / Gesture を lower fps / event-driven にする構成を推奨している（`documents/research/character_animation/answers/06-web-realtime-performance.md:12`、`documents/research/character_animation/answers/06-web-realtime-performance.md:128`）。本タスクは Phase 8 の lower fps 部分だけを実装し、端末 profile 全体は Phase 10 に残す。

## テスト

- `cd sincromisor-frontend && npm run test -- trackerRuntimeCadence`
- `cd sincromisor-frontend && npm run test -- trackerRuntimePerformanceBudget`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible tracking runtime options、worker stats、degradation policy、debug metrics を変更するため、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/overview.md` に Phase 8 cadence / fallback / degradation / observation points を同期する。
