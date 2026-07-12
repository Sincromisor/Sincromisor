# Implementation Log: task-260627141812-character-animation-3-phase-8-pose-seeded-face-roi-tracking

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 方針

- review.md の申し送りどおり、`detectWithRoi()` の `options` は v1 の空 object 予約枠に留め、新しい設定 field は追加しなかった。
- `SincroFaceMotionSnapshot` を拡張し、ROI metadata は `SincroRoiObservation`、`source`、`warnings` だけに限定した。crop 用 canvas / ImageBitmap / MediaPipe raw landmark は snapshot に保存していない。
- ROI crop、FaceLandmarker result 正規化、ROI consistency 補助は `SincroFaceTracker` 本体から分離した。`sincroFaceTracker.ts` が規約の 300 行 hard limit を超えたため、実装中に helper module へ分割して 289 行に収めた。
- Worker と main-thread runtime は、Pose を実行する frame だけ Pose -> Face ROI の順にした。Pose 未実行 frame と face-only fallback 中は full-frame Face tracking を継続する。
- consistency score 0 は ROI result が valid でも full-frame fallback に切り替える仕様として実装した。fallback でも未検出なら `source: "lost"` と `fallbackReason: "face_not_detected"` を残す。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` に Face snapshot metadata、`detectWithRoi()`、ROI fallback、Pose cadence との関係を同期した。
- `documents/design/frontend/character/motion.md` に Face ROI metadata の保存境界、raw landmark 非保存、reliability/debug viewer 接続が後続 task であることを同期した。

### 確認

- `cd sincromisor-frontend && npm run test -- sincroFace`: PASS
- `cd sincromisor-frontend && npm run test -- roiCoordinateMapping`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS at `f6ea4d7` (lint/build/test all PASS; full Vitest 32 files / 259 tests)

### コミット

- `f6ea4d7 feat(character): add pose-seeded face ROI tracking`

### 残リスク / 非対象

- Face / ROI 専用 reliability と motion-debug viewer への warning 表示は task.md のスコープ外として後続 task に残した。
- Vite build は既存の chunk size warning を出すが、gate は PASS。今回変更による未解決事項はなし。
