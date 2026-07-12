# Evaluation: task-260627234128-character-animation-3-0-phase-10-runtime-performance-profile

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `trackerRuntimePerformanceProfile.ts` の追加と `TrackerRuntimePerformanceProfileId` / `TrackerRuntimePerformanceProfile` / `resolveTrackerRuntimePerformanceProfile(input?)` export — `85d9f57` で追加済み。
- [✓] resolver 入力 contract と default 解決 — 入力型は `{ performanceProfileId?: string; performanceProfile?: unknown; defaultProfileId?: TrackerRuntimePerformanceProfileId }`、未指定時は `standard-laptop`、motion-debug 呼び出しは `defaultProfileId: "debug"` を渡している。
- [✓] profile id 4 種と未知 id fallback — `"high-end-desktop" | "standard-laptop" | "mobile-safari" | "debug"` に固定され、未知 id は `standard-laptop` と `unknown_profile_id_defaulted` warning へ fallback する。
- [✓] `TrackerRuntimePerformanceProfile` の保存可能 plain object contract — schemaVersion / id / requestedId / camera / cadence / debugLog / degradationBudget / warnings のみを strict schema で扱い、DOM / runtime object / function を保持しない。
- [✓] camera 固定値 — high-end desktop `1280x720 30fps`、standard laptop `960x540 24fps`、mobile Safari `640x480 15fps`、debug `1280x720 30fps` を実装・テスト済み。
- [✓] cadence 固定値 — `15/12/8/10/6`、`12/8/4/6/3`、`8/4/2/3/1`、`15/12/4/6/2` を実装・テスト済み。
- [✓] debugLog 粒度 — `captureFullDumpByDefault: false`、`overlayCaptureFps: 1`、debug の `numericRingBufferFrames = 1800` と他 profile の `600` を実装・テスト済み。
- [✓] degradationBudget 既定値 — `0.9`、`1.25`、`0.55`、`5`、`30` を実装・テスト済み。
- [✓] `TrackerRuntimePoseOptions` の additive field — `performanceProfileId?: TrackerRuntimePerformanceProfileId` と `performanceProfile?: TrackerRuntimePerformanceProfile` を追加し、実体は `performanceProfile` 優先で resolver に渡している。
- [✓] `TrackerRuntime.startFaceTracking()` の cadence default 適用 — profile cadence を Face / Pose / Hand / Face ROI の default に使い、明示 `targetInferenceFps` 系は優先される。`trackerRuntimePerformanceProfile.test.ts` で明示 override を検証済み。
- [✓] `requestMotionDebugCameraStream()` の profile camera constraints — profile 由来の `ideal` / `max` constraints を生成し、既定は debug profile。`motionDebugCameraStream.test.ts` で standard laptop / mobile Safari に `exact` / `min` が無いことを検証済み。
- [✓] `MotionDebugApp.startCamera()` と window API の profile 指定、snapshot canonical path — `startCamera(options?)` が `performanceProfileId` / `performanceProfile` を受け、`getSnapshot().camera.performanceProfile` に active profile を載せる。`tracker.budget` への重複保存は見当たらない。
- [✓] recording manifest への active profile 保存 — `manifest.pipeline.performanceProfile` に保存し、frame ごとの重複保存はしていない。`motionDebugRecordingController.test.ts` で schemaVersion と active profile id を直接検証済み。
- [✓] `trackerRuntimePerformanceProfile.test.ts` 追加 — 4 profile 固定値、未知 id fallback、明示 target fps override、non-finite custom profile reject / default を検証している。
- [✓] `motionDebugCameraStream.test.ts` 追加 — standard laptop / mobile Safari の constraints が `ideal` / `max` のみであることを検証している。
- [✓] `motionDebugRecordingController.test.ts` 更新 — `manifest.pipeline.performanceProfile.schemaVersion === "sincro.tracker-performance-profile.v1"` と active profile id 保存を直接検証している。
- [✓] 設計文書同期 — `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に performance profile v1、端末別 cadence / camera constraints、debug log 粒度、後続 degradation policy との境界が同期されている。
- [✓] review.md の Critical/High 申し送り解消 — resolver contract、debug snapshot canonical path、固定 Pose fps override の除去、manifest profile assert の全てに対応済み。
- [✓] 実装コミット内の task review.md 4 件の Prettier 整形差分 — 見出し直後の空行追加のみで、判定・指摘内容・申し送り文言の変更はなく有害ではない。

## テスト結果

- 実行コマンド: `npm run gate`
- 実行場所: `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-85d9f57bbcba-5UTwyX`
- 対象: `85d9f57bbcbafc8fb1e26aeeca3a965926f68e01` clean tree
- 結果: PASS
    - `gate:lint` CACHE HIT。Prettier / Markdown check は passed。
    - `gate:build` CACHE HIT。frontend type check / build は passed。
    - `gate:test` CACHE HIT。344 tests passed。
- カバレッジ評価: 受け入れ条件の主要 contract、fallback、explicit override、camera constraints、recording manifest 保存を対象テストが直接検証しており十分。追加の独立 acceptance test は不要と判断した。

## ドキュメント整合性

- 契約 / 公開挙動の変更: あり。developer-visible な runtime performance profile、motion-debug window API、debug snapshot `camera.performanceProfile`、recording manifest `pipeline.performanceProfile` が増えている。
- 同期状況: 同期済み。`documents/design/frontend/character/tracking.md` に profile v1 contract / 固定値 / resolver / cadence / degradation budget 境界、`documents/design/frontend/character/motion.md` に snapshot / window API / manifest canonical path / frame 重複禁止 / debug log 粒度が反映されている。

## 残課題（FAIL の場合）

- なし。

## 残リスク

- ordered degradation policy は本タスクの対象外であり、profile の `degradationBudget` は後続タスクが読む入力 contract として保存されるだけで、自動 degraded mode はまだ実装されていない。
