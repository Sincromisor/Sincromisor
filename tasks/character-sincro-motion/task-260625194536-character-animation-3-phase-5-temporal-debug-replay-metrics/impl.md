# Implementation Log: task-260625194536-character-animation-3-phase-5-temporal-debug-replay-metrics

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- review.md は APPROVED で Critical / High 指摘なし。申し送りどおり、temporal metrics は `MotionMetricResult.value: number | null` と `Record<MotionMetricKey, MotionMetricResult>` を維持し、5 key すべてを単一数値 metric として追加した。
- motion-debug の temporal 生成は、既に canonical / reliability を同一 pose callback で解決している `MotionDebugRecordingController.recordPoseFrame()` に接続した。これにより live snapshot と recording frame の temporal が同じ canonical / reliability / mediaTimeMs から生成される。
- replay viewer は saved `frame.temporal` を最優先にした。invalid saved temporal は破棄せず parse error summary と raw を `available` layer value にし、`frame.temporal` 欠損の旧 log は live recompute で隠さず `not_recorded` にする。
- `frame.timestamp.mediaTimeMs` と `temporal.timestamp.mediaTimeMs` の不一致は recording failure にせず、frontend warning と temporal top-level `warnings: ["out_of_range"]` 追加に留めた。timestamp mismatch 専用 warning enum は既存 temporal contract に無いため、既存 enum の範囲で表現した。
- `temporalLostArmDurationMs` は隣接 valid temporal frame の `dtMs` を `0..250` に clamp し、interval 開始側の lost arm 数を合算した。
- `temporalNeutralWristJitter` は `fixtureId === "neutral-10s"` かつ tracked / suspect の `bodyLocalWrist` 連続差分 RMS を左右合算で計算する。invalid temporal は metrics 入力から除外し、viewer でのみ parse error として見せる。
- `npm run check:md` が依存タスク `task-260625194536-character-animation-3-phase-5-dropout-prediction-recovery/eval.md` の既存 Markdown indentation で失敗したため、Prettier の整形差分のみ同コミットに含める。実装仕様の変更ではない。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` を同期した。
- 同期内容は temporal layer の live / recording / replay 解決順、invalid saved temporal の扱い、`frame.temporal` 保存、Phase 5 temporal metrics 5 key。
- WebRTC / backend / compose / env 契約は変更していないため、contracts / infrastructure 文書の同期は不要。

### 確認

- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel motionDebugRecorder motionMetrics motionMetricBaselineSchema`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm install --offline --ignore-scripts`（worktree root の `tasks:check` 用に `yaml` を lockfile から展開）
- `npm run tasks:check`
- `npm run gate`

### 残リスク

- 通常 character runtime の retarget / IK 入力は temporal に差し替えていない。task.md のスコープどおり motion-debug / replay / metrics の接続に限定した。
- timestamp mismatch の warning は既存 temporal warning enum の `out_of_range` に集約している。専用 warning code が必要なら contract 変更タスクで扱う。

## attempt 2

### 判断

- 評価 FAIL は `temporalLostArmDurationMs` の dt 計算が saved temporal timestamp を参照していた一点。recording は timestamp mismatch を warning に留める仕様なので、metrics は task.md 指定どおり frame timestamp を正本にする必要があった。
- `calculateTemporalLostArmDurationMs()` の previous state を `TemporalUpperBodyState` 単体ではなく `{ frameMediaTimeMs, temporal }` として保持し、dt は必ず現在 frame の `frame.timestamp.mediaTimeMs - previous.frameMediaTimeMs` を `0..250` clamp するよう修正した。
- lost arm 数はこれまで通り interval 開始側、つまり previous temporal の left / right arm state を見て合算する。
- regression test として、`frame.timestamp.mediaTimeMs` と `frame.temporal.timestamp.mediaTimeMs` がずれている 2 frame でも、lost duration が frame timestamp 基準で 2 arms * clamp(400ms, 0..250) = 500ms になるケースを追加した。

### ドキュメント同期

- 公開挙動の意図は attempt 1 で同期済みの「frame timestamp 基準」「timestamp mismatch は warning」に含まれるため、今回の追加文書変更は不要。

### 確認

- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `npm run gate`

### 残リスク

- なし。修正範囲は `temporalLostArmDurationMs` の dt source と regression test に限定した。
