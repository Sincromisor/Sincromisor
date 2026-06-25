# Evaluation: task-260625194536-character-animation-3-phase-5-temporal-debug-replay-metrics

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `MotionDebugApp` / motion-debug runtime の live camera・video fixture・replay pose-snapshot に temporal が接続され、reset 点もある — live/recording 側は `MotionDebugRecordingController.recordPoseFrame()` が canonical / reliability 後に `TemporalStateEstimator.update()` を呼び、`onTemporalStateChange` で `MotionDebugSnapshot.temporal` に反映する（`motionDebugRecordingController.ts:146`-`152`、`207`-`214`、`motionDebugApp.ts:232`-`234`、`287`-`303`）。replay pose-snapshot は `updateReplayTemporal()` で saved temporal または estimator recompute を行う（`motionDebugApp.ts:663`-`685`）。camera stop / video fixture load / recording load / replay stop / source reset は `resetTemporalState()` 経由で reset される（`motionDebugApp.ts:259`-`269`、`342`-`348`、`386`-`392`、`431`-`435`、`507`-`527`、`765`-`768`）。
- [✓] recording frame に `frame.temporal` が保存され、timestamp mismatch は warning に留まる — `motionDebugRecordingController.ts:124`-`168` で同じ frame の canonical / reliability 後に temporal を解決して保存し、`207`-`219` と `298`-`311` で mismatch 時に frontend warning と `out_of_range` warning を付ける。
- [✓] replay viewer は saved valid / invalid / not_recorded / live temporal value を表示できる — `motionDebugViewerModel.ts:206`-`225` と Vitest `uses live snapshot temporal as the temporal layer value`、`prefers saved replay temporal over live snapshot temporal`、`shows invalid replay temporal as an available parse error summary`、`marks replay temporal as not recorded when old logs do not have frame.temporal`。
- [✓] `MotionDebugSnapshot` と viewer type に `temporal?: TemporalUpperBodyState | TemporalLayerParseError` が追加され、parse error shape は canonical / reliability と同じ `parseStatus: "invalid"` — `types.ts:56`-`72`、`132`-`141`。
- [✓] temporal layer の JSON 表示で左右腕の `state`、`confidence`、`source`、`stateAgeMs`、`observedAgeMs`、`warnings`、`recoveringBlend`、`velocity` を確認できる — viewer は layer value をそのまま JSON 表示する既存構造で、test `uses live snapshot temporal as the temporal layer value` が対象 fields を保持している（`motionDebugViewerModel.test.ts:574`-`609`）。UI の新規説明文や shortcut 文言追加はなし。
- [✓] motion metrics は `MotionMetricResult.value: number | null` 契約を維持し、5 key を追加している — `motionMetrics.ts:22`-`64`、`82`-`95`。
- [✓] predicted / recovering count は arm-frame 単位で、unit / direction / thresholds も指定どおり — `motionMetrics.ts:107`-`130`、`835`-`857`、Vitest `calculates temporal arm-frame counts and recovery jump thresholds`。
- [✓] `temporalLostArmDurationMs` は frame timestamp 差分で計算され、left / right lost duration を合算する — attempt 2 で previous state が `{ frameMediaTimeMs, temporal }` になり、dt は `frame.timestamp.mediaTimeMs - previous.frameMediaTimeMs` を `0..250` clamp する実装に修正済み（`motionMetrics.ts:860`-`897`）。前回 FAIL 指摘の「前フレームの temporal timestamp を使う」問題は解消され、timestamp mismatch regression test も追加済み（`motionMetrics.test.ts:435`-`461`）。
- [✓] `temporalMaxRecoveryJumpDegEquivalent` は recovering 中の arm scalar 連続 frame 差分を deg 相当に換算し、unit / direction / thresholds も指定どおり — `motionMetrics.ts:900`-`947`、Vitest `calculates temporal arm-frame counts and recovery jump thresholds`。
- [✓] `temporalNeutralWristJitter` は `neutral-10s` 限定で tracked / suspect の `bodyLocalWrist` 連続差分 RMS を計算し、それ以外や sample 不足を `not_available` にする — `motionMetrics.ts:950`-`1016`、Vitest `calculates temporal lost duration and neutral wrist jitter from temporal samples`。
- [✓] `MOTION_METRIC_KEYS`、`DEFAULT_MOTION_METRIC_THRESHOLDS`、`METRIC_DEFINITIONS`、`resolveThresholds()`、baseline schema / tests は追加 key を 1 数値 metric として扱う — `motionMetrics.ts:82`-`130`、`269`-`308`、`1077`-`1100`、`1162`-`1182`、`motionMetricBaselineSchema.test.ts:26`-`43`。
- [✓] unit test は live snapshot temporal、saved valid 優先、invalid parse error、旧 log `not_recorded`、recorded frame の `frame.temporal` 保存、metrics の prediction / recovering count と jump threshold を検証している — `motionDebugViewerModel.test.ts`、`motionDebugRecorder.test.ts`、`motionMetrics.test.ts`。attempt 2 で frame timestamp 基準の lost duration regression test も追加された。
- [✓] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` は temporal layer の解決順、invalid frame、metrics key と同期済み — `motion.md:68`、`motion.md:178`-`195`、`tracking.md:76`-`79`、`tracking.md:146`、`tracking.md:162`。

## テスト結果

- `npm run gate`（評価用 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-7c9547c9cac4-hB2om2`、commit `7c9547c`、clean）:
    - `gate:lint` CACHE HIT / passed
    - `gate:build` CACHE HIT / passed
    - `gate:test` CACHE HIT / passed、`169 passed (169)`
- カバレッジ評価: viewer / recorder / baseline schema / temporal metrics の主要受け入れ条件を unit test がカバーしている。attempt 2 で前回不足していた timestamp mismatch 時の `temporalLostArmDurationMs` regression test が追加され、受け入れ条件全体に対して十分。

## ドキュメント整合性

- 公開 WebRTC / backend / compose / env 契約の変更はなし。
- developer-visible な motion-debug snapshot / recording / replay / metrics contract の変更あり。`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` は同じ変更で同期済み。

## 残課題（FAIL の場合）

- なし。
