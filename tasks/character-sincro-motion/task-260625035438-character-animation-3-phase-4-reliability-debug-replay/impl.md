# Implementation Log: task-260625035438-character-animation-3-phase-4-reliability-debug-replay

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md は APPROVED のため実装を進めた。
- `ReliabilityMap` の生成責務は task.md の設計判断どおり `motion-debug` page 側に置いた。`TrackerRuntime` / worker には recording、viewer、DOM、replay の責務を追加していない。
- live pose callback では camera quality 更新後、recording 前に `createPoseReliabilityMap()` を呼ぶ形にした。`mediaTimeMs` は `TrackerVideoFrameTiming.mediaTimeMs`、`pose.lastUpdatedAtMs`、`0` の順で解決する。
- recording frame では `frame.reliability` を必ず保存する。呼び出し側で reliability が渡されない場合は `createDefaultReliabilityMap(mediaTimeMs)` を保存する fallback にした。
- replay / viewer は live snapshot reliability、saved `frame.reliability`、旧 log の `poseSnapshot` 再計算の順に解決する。saved reliability が invalid でも replay failure にはせず、`parseStatus: "invalid"` / errors / raw を reliability layer の available value として表示する。
- live camera / fixture 停止、replay load、recording stop/reset で canonical と同じ境界で reliability previous を reset するようにした。
- review.md 申し送りの `latestCameraQuality` は reliability 生成前に更新する順序で固定した。旧 log fallback の `mediaTimeMs` / `video` サイズは viewer model test で固定した。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に、`frame.reliability` 保存、replay 解決順、invalid parse の扱い、旧 log fallback / `not_recorded` 条件を同期した。
- 公開 WebRTC / backend 契約は変更していないため、contract 文書や compose/env の同期は不要と判断した。

### 確認

- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel motionDebugRecorder`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `npm run gate`: PASS (`lint` / `build` / `test`, 16 files / 126 tests)

### 残リスク / 未確認

- Playwright / browser smoke は未実行。今回の変更は window API の値解決と log/replay model が中心で、unit test と build/gate で受け入れ条件を確認した。
- ReliabilityMap の downstream canonical / IK weight 反映は task.md のスコープ外として未実装。

### post-commit

- 実装コミット: `6ad5f96`
- clean HEAD `6ad5f96` で `npm run gate`: PASS (`lint` / `build` / `test`, 16 files / 126 tests)
