# Evaluation: task-260627141812-character-animation-3-phase-8-pose-seeded-face-roi-tracking

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `SincroFaceMotionSnapshot` に optional `roi` field を追加し、型を `SincroRoiObservation` に限定している。snapshot には canvas / ImageBitmap / MediaPipe raw result は保存していない（`f6ea4d7`, `sincroFaceMotionSnapshot.ts`, `sincroFaceTrackerNormalizer.ts`）。
- [✓] `source = "roi" | "full-frame" | "full-frame-fallback" | "lost"` と `warnings: string[]` を追加し、既存 field は維持されている。既存 consumer の clone/default も更新済み（`f6ea4d7`, `characterBehaviorSnapshots.ts`, `debugConsoleMotionSnapshot.ts`）。
- [✓] `SincroFaceTracker.detect(videoFrame, timestampMs)` は既存 signature のまま full-frame 推論を行い、`detectWithRoi(videoFrame, poseSnapshot, timestampMs, options?)` が追加されている（`f6ea4d7`, `sincroFaceTracker.ts`）。
- [✓] `detectWithRoi()` の `options` は `Record<never, never>` の optional empty object 予約枠のみで、新しい設定 field は追加されていない（`f6ea4d7`, `sincroFaceTracker.ts`）。
- [✓] ROI crop の result は crop-local result として正規化し、`headPose.matrix` は従来の matrix number array のみを保持する。crop-local face landmark 全点は snapshot に保存しない（`f6ea4d7`, `sincroFaceTrackerNormalizer.ts`）。
- [✓] ROI no-face 時は同一 frame で full-frame fallback を 1 回だけ実行し、fallback でも未検出なら `detected = false`、`source = "lost"`、`fallbackReason = "face_not_detected"`、warning を残す（`sincroFaceMotionSnapshot.test.ts` の `runs one full-frame fallback...` / `marks lost...`）。
- [✓] ROI consistency score 0 では valid ROI result でも `full-frame-fallback` へ切り替え、fallback を使うため `detected = false` にはしない（`sincroFaceMotionSnapshot.test.ts` の `switches to full-frame fallback...`）。
- [✓] `TrackerRuntime` / Worker は Pose 実行 frame だけ Pose -> Face ROI の順で処理し、Pose 未実行 frame / face-only fallback 中は full-frame Face tracking を継続する（`f6ea4d7`, `trackerRuntime.ts`, `sincroTracker.worker.ts`）。
- [✓] `getSnapshot()` と `stop()` は `roi` / `source` / `warnings` を clone / default 初期化している（`sincroFaceMotionSnapshot.test.ts` の `deep clones ROI...`）。
- [✓] 実装者テストは既存 full-frame snapshot 互換、valid ROI、invalid ROI fallback、ROI no-face fallback、stop snapshot default を検証している（`sincroFaceMotionSnapshot.test.ts`）。
- [✓] consistency score 0 の full-frame fallback への切り替えもテスト済み（`sincroFaceMotionSnapshot.test.ts`）。

## テスト結果

- 実行コマンド: `npm run gate`
- 結果: PASS（`f6ea4d7`, clean tree）
    - `gate:lint`: CACHE HIT / PASS
    - `gate:build`: CACHE HIT / PASS（既存の chunk size warning あり）
    - `gate:test`: CACHE HIT / PASS（259 passed）
- 追加の acceptance test: なし。実装者テストが受け入れ条件の ROI 成功、invalid ROI、no-face fallback、lost、consistency score 0、clone/default を直接検証しており十分。

## ドキュメント整合性

- 公開 WebRTC / backend 通信契約の変更はなし。
- developer-visible な `SincroFaceMotionSnapshot` / tracker orchestration の公開挙動は変更あり。
- `documents/design/frontend/character/tracking.md` に `detect()` / `detectWithRoi()`、ROI fallback、snapshot metadata、Pose cadence との関係が同期済み。
- `documents/design/frontend/character/motion.md` に Face ROI metadata、raw landmark 非保存、fallback semantics、reliability / motion-debug viewer 接続を後続 task に残す境界が同期済み。

## 残課題（FAIL の場合）

- なし。
