# Production Composer Degradation Verification

## 目的

production `sincro` の ordered degradation 中に、observe-only pipeline と
VrmPoseComposer dry-run が古い tracking pose を保持し続けないことを確認した。

実機で意図的に端末負荷を上げる再現は行わず、既存の synthetic unit test と runtime
state machine のコード確認を根拠にした。MediaPipe 実推論、実カメラ、実 VRM 表示での
見た目確認は本 artifact の対象外である。

## 検証範囲

- Stage 順序: `full`、`roi-hand-paused`、`pose-reduced-fps`、`face-only`、
  `comfortable-idle`、recovery。
- Observe-only state: Face / Pose / Hand callback からの `reliability`、`canonical`、
  `temporal`、`intent` summary と `updatedAtMs`。
- Composer dry-run: `SincroVrmPoseComposerDryRunService` の `status` と stale result
  非返却。
- 時刻根拠: `mediaTimeMs`、`receivedAtMs`、`lastUpdatedAtMs`、degradation policy の
  `sinceMediaTimeMs`。

## Stage 別確認

| stage              | observe-only state                                                                                                                                                                             | composer dry-run                                                                                                                              | time-based 根拠                                                                                                                                                                                                    | 確認結果                                                                                                                                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full`             | Pose callback で `reliability` / `canonical` / `temporal` / `intent` が `available` になる。Face-only callback 単独では Pose 未到着を `not_computed` にする。                                  | retarget frame と profile が揃う frame だけ `available`。未到着なら `not_ready`。                                                             | `SincroMotionObserveOnlyPipeline` は downstream timestamp に `mediaTimeMs` を使い、`updatedAtMs` には `receivedAtMs` を使う。                                                                                      | `sincroMotionPipelineObserveOnly.test.ts` の `mediaTimeMs: 250` / `receivedAtMs: 9010` ケースで確認。                                                                                                                            |
| `roi-hand-paused`  | Hand ROI は policy pause として止まるが、Face full-frame snapshot は継続する。Hand lost snapshot は observe-only の Hand summary で `source: "lost"` / `detected: false` として扱える。        | Pose retarget frame が継続するため、dry-run は入力が揃う限り `available` を維持できる。                                                       | policy は `hand_roi_paused` reason と `roiPauseState: "hand-paused"` を出し、ROI controller の skipped counter を policy pause だけで増やさない。                                                                  | `trackerRuntimeDegradationPolicy.test.ts` が fixed order と ROI over-budget stage 進行を確認。`trackerRuntime.test.ts` が Face full-frame と ROI 実行の分離を確認。                                                              |
| `pose-reduced-fps` | Pose callback cadence だけが低下し、Face full-frame cadence は維持される。observe-only は到着した Pose frame の `mediaTimeMs` で stateful estimator を進める。                                 | Pose retarget frame が届く間だけ `available`。Pose 未到着 frame で新規 dry-run result を合成しない。                                          | effective cadence は profile の pose fps を `max(2, floor(poseFps / 2))` に落とし、Face fps は変えない。ROI freshness は `mediaTimeMs - lastUpdatedAtMs > 250` で stale 判定する。                                 | `trackerRuntimeDegradationPolicy.test.ts` の cadence clamp と `tracking.md` の ROI stale contract を確認。                                                                                                                       |
| `face-only`        | Tracker runtime が Pose / Hand を停止し、Pose fallback snapshot と Hand lost snapshot を publish する。observe-only は Face callback 単独なら `pose_not_available` / `not_computed` に留まる。 | latest retarget frame が無い場合は `not_ready`。`status !== "available"` では `result` を返さない。                                           | `degradePoseToFaceOnly()` は `latestPoseSnapshot = undefined` に戻す。policy recovery は Pose 検出済みかつ pose inference time が profile budget 以下の `mediaTimeMs` frame でだけ進む。                           | `trackerRuntime.test.ts` が `face-only` 到達、Pose fallback、復帰後の Pose 再開を確認。`sincroVrmPoseComposerDryRun.test.ts` が `not_ready` と stale result 非返却を確認。                                                       |
| `comfortable-idle` | Camera / Face tracking は止めず、Pose / Hand / Face ROI を停止する。Pose fallback と Hand lost snapshot が publish される。Temporal は Pose 欠損継続後に comfortable fallback を出す。         | retarget frame 不在では `not_ready`。comfortable pose blend は tracker ではなく Temporal / MotionSolver / VrmPoseComposer 側の責務。          | `enterComfortableIdle()` は `timing.mediaTimeMs` で Pose / Hand stop snapshot を publish し、`latestPoseSnapshot = undefined` に戻す。                                                                             | `trackerRuntime.test.ts` が `comfortable-idle` 到達と recovery を確認。`temporalStateEstimator.test.ts` が prediction window 後の comfortable fallback を確認。                                                                  |
| recovery           | degradation policy は逆順で 1 stage ずつ戻る。`face-only` からの復帰は healthy Pose が必要。Temporal は `recovering` または fallback 由来の mixed source を通す。                              | `available` result の previous final pose は angular velocity clamp 用にだけ使う。invalid / not-ready では previous final pose を更新しない。 | recovery decision は `budgetStatus: "ok"` と ROI over-budget counter `0` が `recoveryFrames` 続いた frame でだけ進む。Temporal は `mediaTimeMs` 差分から `recoveringBlend.durationMs` と scalar clamp を計算する。 | `trackerRuntimeDegradationPolicy.test.ts` が reverse recovery と face-only recovery gate を確認。`temporalStateEstimator.test.ts` が `state: "recovering"`、`source: "mixed"`、`recovery_blend`、one-frame scalar clamp を確認。 |

## 古い pose を保持しない確認

- Tracker runtime は `face-only` 進入時の `degradePoseToFaceOnly()` と
  `comfortable-idle` 進入時の `enterComfortableIdle()` の両方で
  `latestPoseSnapshot` を `undefined` に戻す。
- Hand / Face ROI は `latestPoseSnapshot` が fresh な場合だけ optional pass に使い、
  freshness は `mediaTimeMs - lastUpdatedAtMs > 250` で判定する。frame count だけには
  依存しない。
- Composer dry-run は retarget frame 未到着を `not_ready` とし、`status !== "available"`
  では `result` を持たない。前回 `available` の `finalPose` は angular velocity clamp
  の内部入力にだけ残し、Debug Console の現在 frame result として返さない。
- Observe-only pipeline は Face-only callback 単独では stateful temporal / intent を進めず、
  Pose callback の `mediaTimeMs` が到着した時だけ downstream estimator を進める。

## ROI pause 中の Face retarget 継続

`roi-hand-paused` は Hand ROI pause に限定される。`face-paused` / `all-paused` でも
full-frame Face tracking は継続する設計であり、`trackerRuntime.test.ts` の
`keeps full-frame Face detect when fresh Pose makes Face ROI due` は同一 frame で
full-frame Face snapshot を publish しつつ Face ROI metadata を付与することを確認している。

## Recovery の snap 抑制

`TemporalStateEstimator` は dropout 中に `predicted`、prediction window 終了後に
`source: "comfortable"` の `lost`、復帰時に `state: "recovering"` / `source: "mixed"` を
通す。復帰 frame では `recoveringBlend` を持ち、reach / elevation / openness /
forwardness / elbow flexion の 1 frame jump を clamp する。これにより recovery で古い
tracking pose へ即時 snap しない。

## 実行した確認

- `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntimeDegradationPolicy.test.ts`
  のコード確認。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntime.test.ts`
  のコード確認。
- `sincromisor-frontend/src/character/runtime/__tests__/sincroMotionPipelineObserveOnly.test.ts`
  のコード確認。
- `sincromisor-frontend/src/character/runtime/__tests__/sincroVrmPoseComposerDryRun.test.ts`
  のコード確認。
- `sincromisor-frontend/src/character/temporal/__tests__/temporalStateEstimator.test.ts`
  のコード確認。

コマンド実行結果は `impl.md` に記録する。
