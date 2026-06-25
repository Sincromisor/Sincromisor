# Implementation Log: task-260625231715-character-animation-3-phase-6-minimal-avatar-motion-profile

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- review は APPROVED のため実装した。
- `MinimalAvatarMotionProfile` は VRM / THREE runtime object を保持しない plain object とし、`SincroArmIkSolver` と同じ normalized bone node / world position / minimum fallback 方針で腕長と肩幅を測るようにした。
- Phase 6 では profile を観測可能にするだけに留め、IK / retarget の計算結果、constraint、smoothing、motion metric key は変更しなかった。
- Debug Console / motion-debug は `DebugConsoleSnapshot["sincroMotion"].poseRetargetRuntime` と `MotionDebugSnapshot.poseRetargetRuntime` を共有しているため、`poseRetargetRuntime.avatarMotionProfile` で snapshot 経由に寄せた。
- missing bone warnings は固定 reason code とし、`Set` で重複を排除した。期待値は profile 単体テストで固定した。
- ドキュメント同期は `documents/design/frontend/character/motion.md` に v1 schema、fallback、Phase 6 の非変更範囲、Phase 7 へ残す calibration / 完成版 profile 範囲を追記した。

### 変更コミット

- `e8a60fd7f4a260071b6be34199168346f29ee27a` (`feat(character): add minimal avatar motion profile`)

### 確認

- `npm run test -- minimalAvatarMotionProfile`: PASS
- `npm run test`: PASS
- `npm run check`: PASS after Prettier-only formatting of pre-existing task artifacts in the implementation worktree.
- `npm run build`: PASS
- `npm run gate`: PASS on current HEAD with a dirty worktree containing only the Prettier-only task artifact formatting listed below.

### 残リスク / 詰まり

- clean worktree の `npm run gate` は、今回の実装とは別の既存 task artifact Markdown 整形違反で失敗する。警告対象は `tasks/character-sincro-motion/task-260625194536-character-animation-3-phase-5-temporal-debug-replay-metrics/impl.md`、本タスクの `review.md`、および Phase 6 後続タスク群の `review.md` / 1 件の `task.md`。
- それら 7 ファイルは worktree 上で Prettier-only 整形済みだが、別タスクの `task.md` を含むため、実装者権限ではコミット承認が必要と判断した。実装コミットには含めていない。
- `SincroPoseRetargeter.getAvatarMotionProfile()` は clone を返すが、完成版 `AvatarMotionProfile` / calibration UX / profile を使った solver scale 適用は Phase 7 以降に残した。

### orchestrator 補足

- gate は clean HEAD で独立評価に渡す必要があるため、既存 task artifact の Prettier-only 差分を実装ブランチ上で `4acaf8c6f183fcd717a6afd3fdbb8ccb7307d842` (`chore(tasks): format motion task artifacts`) として分離コミットした。
- その後、clean worktree の `npm run gate` を再実行し PASS した。
