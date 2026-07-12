# Implementation Log: task-260627141813-character-animation-3-phase-8-roi-reliability-debug-replay

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md は APPROVED。申し送りどおり Face ROI component は `face.roi.confidence` を正本にし、Face center consistency は再計算しない方針で実装した。
- Hand ROI component は `calculateRoiConsistency({ expected: hand.roi.referencePoint, observed: hand.fullFrameWrist })` のみで算出した。`referencePoint` / `fullFrameWrist` / `roi` 欠損は旧 snapshot / 旧 replay log 互換として `not_available_in_pose_snapshot` に落としている。
- `createPoseReliabilityMap()` は optional `hand` / `face` property が省略された場合は従来 placeholder を維持する。motion-debug では hand callback が来る前は hand property 自体を渡さず、snapshot 受信後だけ reliability に接続する。
- `side_inconsistent` hand は side component を `0.35` にし、最終 weight を `0.45` 以下へ cap した。Gesture reliability は Phase 9 まで neutral placeholder のままにした。
- replay viewer は saved `frame.reliability` を正本にし、invalid reliability は raw value 付きの `parseStatus: "invalid"` として表示する既存方針を維持した。旧 log fallback は pose-only placeholder に限定し、保存されていない Hand / Face 観測は再構成しない。
- motion-debug recording には optional `frame.hand` を追加したが、reliability 生成責務は `MotionDebugApp.updatePoseReliability()` に維持し、`MotionDebugRecordingController` へは移していない。
- `npm run check` が既存 task 文書 2 件の Markdown formatting で落ちたため、gate を clean checkout で通す目的で該当 `review.md` / `eval.md` だけ Prettier 整形した。内容変更は見出し後の空行追加のみ。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md`、`motion.md`、`overview.md` を同期した。
- 同期内容は Phase 8 の Hand / Face / ROI reliability、ROI reason 境界、旧 log fallback、`MotionDebugSnapshot.hand` / `frame.hand`、Gesture を Phase 9 に残す境界。
- WebRTC / backend 契約変更はなし。

### 確認

- `cd sincromisor-frontend && npm run test -- poseReliabilityEstimator`: PASS
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`: PASS
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS at `2b2c9f7bb252df2808235e8d198d316d40565838`（lint / build / test、33 files / 270 tests）

### 未実行 / 注意

- `npm run tasks:check` は実行したが、root package `yaml` がこの worktree に入っておらず `ERR_MODULE_NOT_FOUND` で開始前に失敗した。gate の対象ではないため、最終確認は `npm run gate` の PASS を正本にした。
- `npx prettier` は network へ取りに行き `ENOTFOUND registry.npmjs.org` で失敗したため、frontend の local Prettier binary を直接使った。

### コミット

- `2b2c9f7bb252df2808235e8d198d316d40565838` — `feat(character): connect ROI reliability to motion debug replay`
