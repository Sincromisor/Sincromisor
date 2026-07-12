# Evaluation: task-260624013721-character-animation-3-canonical-debug-replay-integration

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `MotionDebugRecordingController.recordPoseFrame()` が canonical を生成して recorder frame input の `canonical` に保存する — `motionDebugCanonicalState.ts` が `estimateCanonicalTorsoFrame()` と `createCanonicalUpperBodyState()` を接続し、`motionDebugRecordingController.ts:104-128` で `previous` 付き canonical を生成して `recordFrame()` に渡している。
- [✓] recording 中 previous canonical を渡し、stop / source stop / replay load で reset する — `motionDebugRecordingController.ts:104-111`、`motionDebugRecordingController.ts:149-152`、`motionDebugApp.ts:342-345`、`motionDebugApp.ts:459-475` で確認。recording stop は `stop()` 成功時に reset する。
- [✓] `MotionDebugSnapshot.canonical` から live latest canonical を読め、既存 field 名を維持する — `types.ts:95-107` で optional `canonical` を追加し、既存 `status` / `camera` / `pose` / `tracker` / `poseRetarget` / `poseRetargetRuntime` / `render` は維持。`motionDebugApp.ts:245-269` で snapshot へ反映している。
- [✓] viewer canonical layer は replay frame canonical を優先し、なければ live snapshot canonical へ fallback する — `motionDebugViewerModel.ts:120`、`motionDebugViewerModel.ts:134-155` で確認。
- [✓] replay `pose-snapshot` mode で saved `frame.canonical` を parse し、valid / invalid を replay failure にせず latest / viewer layer に反映する — `motionReplayPlayer.ts` は `frame.canonical` を parse failure 条件にせず context へ渡し、`motionDebugApp.ts:541-563` が valid state または `{ parseStatus: "invalid", errors, raw }` を `latestCanonical` に反映している。
- [✓] exported NDJSON parse 後に `frame.canonical` unknown slot が保持され、`parseCanonicalUpperBodyState(frame.canonical)` が成功するテストがある — `motionDebugLogSchema.ts` の `canonical: z.unknown().optional()` と `motionDebugRecorder.test.ts:167-187` で確認。
- [✓] viewer で `schemaVersion`、`timestamp.mediaTimeMs`、左右腕 feature、`source`、`warnings`、`outOfRangeFields`、`calibration.id` を確認できる — canonical layer は parsed canonical を JSON value としてそのまま表示し、`motionDebugViewerModel.test.ts:314-359` が主要 field を検証している。
- [✓] viewer tests が live / replay / invalid canonical 表示境界を検証する — `motionDebugViewerModel.test.ts:314-445` で live fallback、replay 優先、invalid parse summary を検証している。
- [✓] record frame canonical のテストがある — `motionDebugRecorder.test.ts:167-187` が export / parse 後の `frame.canonical` と canonical parser 成功を検証している。
- [✓] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` が同期されている — `motion.md:57`、`motion.md:121-135`、`tracking.md:61-62`、`tracking.md:102-105` に保存起点、viewer 表示、invalid canonical 扱いが追記されている。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-183e27dbd24a-A1nlEL`, commit `183e27dbd24a2c2e0d45d786cdaa018caa6b7c0a`, clean）: passed。
- gate 内訳: `gate:lint` CACHE HIT passed、`gate:build` CACHE HIT passed、`gate:test` CACHE HIT passed。test summary は 64 passed / 0 failed。
- カバレッジ評価: 受け入れ条件の主要境界である live fallback、replay saved canonical 優先、invalid canonical parse summary、NDJSON export / parse 後の canonical 保持を unit test が直接検証している。`recordPoseFrame()` の canonical 生成接続と reset 経路はコードレビューで確認した。
- 手動 / Playwright recording は未実行だが、`impl.md` に未実行理由と unit test 代替が記録されており、本タスクの合否を止める不足とは判定しない。

## ドキュメント整合性

- 公開通信契約の変更はなし。
- developer 向け `motion-debug` log / window snapshot / viewer の公開挙動は変更あり。
- 対応ドキュメントは同期済み。`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に `frame.canonical` の保存起点、viewer 表示、replay saved canonical 優先、invalid canonical 非 failure 表示、unknown optional slot と parser 境界が反映されている。

## 残課題（FAIL の場合）

- なし。
