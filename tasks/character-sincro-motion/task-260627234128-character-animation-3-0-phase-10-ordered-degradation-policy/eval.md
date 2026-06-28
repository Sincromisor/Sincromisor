# Evaluation: task-260627234128-character-animation-3-0-phase-10-ordered-degradation-policy

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `trackerRuntimeDegradationPolicy.ts` 追加と指定 export — `TrackerRuntimeDegradationPolicyController` と関連 type が追加されている（`173537d`）。
- [✓] 詳細 degradation stage 固定、既存 `TrackerRuntimeDegradationState` 維持、`SincroTrackerWorkerStats.degradationPolicy` 追加 — 既存 union は `"main-thread-low-fps"` を維持し、詳細 stage は optional stats slot に分離されている。
- [✓] degradation order と 1 段進行、counter reset — `TrackerRuntimeDegradationPolicyController` と `trackerRuntimeDegradationPolicy.test.ts` が `full -> gesture-reduced-fps -> optional-pass-reduced-fps -> roi-hand-paused -> pose-reduced-fps -> face-only -> comfortable-idle` を検証している。
- [✓] recovery 逆順と欠損値扱い — `isWithinBudgetFrame()` は `budgetStatus === "ok"` に加えて `roi !== undefined` と `roi.consecutiveOverBudgetFrames === 0` を要求し、`roi` 欠損時に recovery counter が進まない focused test が追加されている。
- [✓] `face-only` recovery 条件 — `canRecoverFromCurrentStage()` は `face-only -> pose-reduced-fps` に `poseDetected === true` と profile 由来 pose budget 以下の `poseInferenceTimeMs` を要求する。
- [✓] `gesture-reduced-fps` の `effectiveGestureFps` — decision / snapshot に `max(1, floor(profile.cadence.gestureFps / 2))` が出る。Gesture runtime は起動していない。
- [✓] `optional-pass-reduced-fps` / `roi-hand-paused` — Hand / Face ROI cadence 半減、policy 由来 `hand-paused` 合成、`hand_roi_paused` reason code が実装されている。
- [✓] `pose-reduced-fps` — Pose fps 半減、Face full-frame cadence 維持が実装されている。
- [✓] `face-only` / `comfortable-idle` — 既存 `degradePoseToFaceOnly()` 経路と comfortable idle の Pose fallback / Hand lost snapshot 出力が接続されている。
- [✓] runtime recovery 実挙動 — policy-owned `face-only` / `comfortable-idle` では Pose recovery probe が許可され、healthy probe 後に `poseDegradedToFaceOnly` / `comfortableIdleActive` を解除して Pose / Face ROI / Hand が順に再開することを `trackerRuntime.test.ts` が検証している。
- [✓] `SincroTrackerWorkerStats.degradationPolicy` shape — schemaVersion / stage / previousStage / reasonCodes / sinceMediaTimeMs / effectiveCadence / recovering を持つ snapshot が追加されている。
- [✓] `TrackerRuntime` への policy 接続と main-thread clamp — `withBudget()` 入力、decision cadence 反映、main-thread clamp 上限維持が実装されている。
- [✓] ROI budget controller の policy pause 合成 — policy pause と budget pause の reason code merge、`fallbackCount` / `skippedFrames` 非増加が test されている。
- [✓] `ignorePerformanceFallback` 境界 — reduced fps / ROI pause / pose-reduced まで進め、`face-only` / `comfortable-idle` 自動遷移を抑制する単体 test がある。
- [✓] required tests 追加 / 更新 — degradation policy、ROI budget、runtime recovery、motion debug viewer model の test が追加 / 更新されている。
- [✓] 文書同期 — `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に ordered degradation policy v1、stage、recovery 条件、`ignorePerformanceFallback`、comfortable-idle 責務境界、metrics layer が同期されている。

## テスト結果

- `npm run gate`（evaluation worktree: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-173537dfb864-SO4Xd6`, SHA `173537dfb86442f21eac7bbaec216e2161b8a25a`）: PASS
  - gate:lint CACHE HIT — frontend lint / format / Markdown check passed at `173537d (clean)`.
  - gate:build CACHE HIT — frontend type check / build passed at `173537d (clean)`.
  - gate:test CACHE HIT — frontend tests passed, 353 tests passed at `173537d (clean)`.
- カバレッジ評価: 受け入れ条件に対して十分。前回 FAIL 1 の `budgetStatus: "ok"` かつ `roi === undefined` は focused unit test で固定済み。前回 FAIL 2 の runtime 実復帰は policy-owned `face-only` / `comfortable-idle` 到達後、healthy Pose probe で `pose-reduced-fps` へ戻り、Face ROI と Hand inference が再開する integration test で固定済み。

## ドキュメント整合性

- 契約 / 公開挙動変更: `SincroTrackerWorkerStats.degradationPolicy`、motion-debug metrics layer、developer-visible degraded mode が追加されている。既存 `TrackerRuntimeDegradationState` enum は維持されている。
- 同期状況: 同期済み。`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に ordered degradation policy v1、stage 一覧、recovery 条件、`ignorePerformanceFallback`、comfortable-idle 責務境界、metrics layer 表示が反映されている。

## 残課題（FAIL の場合）

- なし。
