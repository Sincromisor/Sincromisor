# Evaluation: task-260623221635-character-animation-3-mediapipe-raw-replay-player

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts` が追加され、`MotionReplayPlayer`、`MotionReplayMode`、`MotionReplayFrameResult` を export している。根拠: `motionReplayPlayer.ts:9`, `motionReplayPlayer.ts:19`, `motionReplayPlayer.ts:62`。
- [✓] `MotionReplayMode` は `"pose-snapshot" | "final-pose-playback" | "mediapipe-raw-result"` に固定され、loaded recording に対する `"mediapipe-raw-result"` は `unsupported_mode` を返す。根拠: `motionReplayPlayer.ts:9`, `motionReplayPlayer.ts:160-167`, `motionReplayPlayer.test.ts:199-203`。
- [✓] `"pose-snapshot"` mode は `frame.poseSnapshot` を `SincroPoseMotionSnapshot` として parse し、page 側で `CharacterBehaviorState.applyPoseMotion()` 相当の入口へ渡して同一 call 内で `VRMCharacterManager.update()` / retarget を進める。欠落時は `missing_pose_snapshot`。根拠: `motionReplayPlayer.ts:187-222`, `motionDebugApp.ts:452-461`, `vrmScene.ts:176-180`, `motionReplayPlayer.test.ts:204-207`。
- [✓] `"final-pose-playback"` mode は `frame.finalPose` 欠落時に deterministic な `missing_final_pose` を返し、page 側では retarget / solver を再実行する処理を追加していない。根拠: `motionReplayPlayer.ts:225-250`, `motionReplayPlayer.test.ts:208-211`。
- [✓] `MotionReplayFrameResult` と window API の最小 schema は discriminated union / signature に沿っており、`parse_error`、`frame_index_out_of_range`、`unsupported_mode`、`missing_pose_snapshot`、`missing_final_pose`、`no_recording_loaded` が固定実装されている。根拠: `motionReplayPlayer.ts:11-45`, `types.ts:57-77`, `motionReplayPlayer.test.ts:187-239`。
- [✓] `MotionDebugApp` の window API に `loadRecording(fileOrText)`、`startReplay(options)`、`stepReplay(frameIndex)`、`stopReplay()`、`getReplayState()` が追加されている。`loadRecording()` は plain NDJSON `string` / `File` のみ受け付け、成功時と replay 開始時に live runtime / tracks を停止する。根拠: `motionDebugApp.ts:284-327`, `motionDebugApp.ts:385-419`, `motionDebugApp.ts:521-542`, `types.ts:72-77`。
- [✓] replay は `timestamp.mediaTimeMs` を正本時刻として使い、manual step は指定 `frameIndex` の結果だけを返す。autoplay delay も隣接 frame の `mediaTimeMs` 差分から計算している。根拠: `motionReplayPlayer.ts:144-145`, `motionReplayPlayer.ts:212-221`, `motionDebugApp.ts:464-484`。
- [✓] 同一 log を 2 回 replay したとき、同一 `poseRetarget` snapshot JSON が得られることをユニットテストで検証している。根拠: `motionReplayPlayer.test.ts:153-185`。
- [✓] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に replay mode の責務、`frame.poseSnapshot` replay、raw mode 予約、window API 公開範囲が同期されている。根拠: `motion.md:52-57`, `motion.md:106-107`, `tracking.md:59-61`, `tracking.md:94`。

## テスト結果

- `npm run gate`（評価用 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-88e2f94cbd77-q41icR`, HEAD `88e2f94`, clean）: PASS。
- gate 内訳:
    - `gate:lint`: PASS。`cd sincromisor-frontend && npm run check`、Biome 355 files checked、Markdown Prettier check PASS。
    - `gate:build`: PASS。`cd sincromisor-frontend && npm run build`、`tsc -p tsconfig.modern.json && vite build` PASS。
    - `gate:test`: PASS。`cd sincromisor-frontend && npm run test`、Vitest 4 files / 29 tests passed。
- カバレッジ評価: replay core の mode union、error code、parse error、missing slot、out-of-range、no recording、retarget determinism はユニットテストで直接確認されている。window API のブラウザ実行テストはないが、型・build と実装照合により File/string 限定、runtime 停止、`mediaTimeMs` 基準 scheduling まで確認できており、本タスクの受け入れ条件に対して十分。

## ドキュメント整合性

- 公開挙動の変更あり: `motion-debug` developer-only window API に replay 操作が追加され、motion debug log replay の mode / slot / error behavior が増えた。
- 同期状況: 同期済み。`documents/design/frontend/character/motion.md` に window API、mode 責務、`frame.poseSnapshot`、raw mode 予約、`mediaTimeMs` 正本時刻が追記され、`documents/design/frontend/character/tracking.md` に replay 境界、live tracker を起動しないこと、raw serializer 未実装時の `unsupported_mode`、window API 公開範囲が追記されている。
- 生成物: API schema / 型生成物の更新対象は見当たらない。

## 残課題（FAIL の場合）

- なし。
