# Implementation Log: task-260623221635-character-animation-3-mediapipe-raw-replay-player

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

Review は APPROVED のため実装した。Phase 1 replay は normalized `frame.poseSnapshot` を正本にし、MediaPipe raw replay は API と mode だけ予約して `unsupported_mode` に固定した。

主な判断:

- replay core は DOM 非依存の `MotionReplayPlayer` とし、`motion-debug` page 側で File 読み込み、live runtime 停止、autoplay timer、VRM scene の同期更新を担当させた。
- `poseSnapshot` は log schema 上 `unknown` なので、replay 境界で `SincroPoseMotionSnapshot` の Zod schema を通してから `CharacterBehaviorState.applyPoseMotion()` 相当の経路へ渡す。欠落は `missing_pose_snapshot`、shape 不正は `parse_error` に分けた。
- `final-pose-playback` は retarget / solver を再実行しない mode とし、v1 の `finalPose` 欠落では `missing_final_pose` を返す skeleton に留めた。
- replay frame の順序と autoplay delay は `frame.timestamp.mediaTimeMs` の差分だけを使う。`performance.now()` は replay frame 選択に使わない。
- 即時 window API result の `poseRetarget` が前フレームにならないよう、`VRMScene.renderOnce(nowMs)` と `VRMCharacterManager.update(nowMs)` を追加し、replay pose 適用後に同一 call 内で retarget を進める。

review.md 申し送りへの対応:

- mode union は `"pose-snapshot" | "final-pose-playback" | "mediapipe-raw-result"` に固定した。
- normalized pose の読み取り slot は `frame.poseSnapshot` だけにした。
- `loadRecording()` は plain NDJSON `string` または `File` のみ受け付け、Blob / その他は `unsupported_input` を返す。
- `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に replay mode、raw mode 予約、window API 公開範囲を同期した。

確認:

- `cd sincromisor-frontend && npm run test -- motionReplayPlayer`: PASS。
- `cd sincromisor-frontend && npm run check`: PASS。
- `cd sincromisor-frontend && npm run build`: PASS。
- `npm run tasks:check`: root `node_modules` がない worktree では `yaml` 解決で失敗。main checkout の root `node_modules` へ一時 symlink を張った状態では PASS（164 tasks）。symlink は commit 対象外のため削除済み。
- `npm run gate`: PASS（lint / build / test）。

残リスク:

- autoplay は `mediaTimeMs` 差分で `setTimeout` 予約する最小実装。長時間 replay の pause / seek UI は未実装。
- `final-pose-playback` は `finalPose` slot が存在する場合に snapshot を返せる skeleton で、VRM normalized pose composer は後続 Phase に残した。
