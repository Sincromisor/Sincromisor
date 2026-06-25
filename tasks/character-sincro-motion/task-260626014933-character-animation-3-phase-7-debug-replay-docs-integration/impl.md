# Implementation Log: task-260626014933-character-animation-3-phase-7-debug-replay-docs-integration

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md の申し送り通り、完成版 `AvatarMotionProfile` は Debug Console の `poseRetargetRuntime.avatarMotionProfile` から読まず、`VRMScene.getAvatarMotionProfile()` / `VRMCharacterManager.getAvatarMotionProfile()` から `SincroPoseRetargeter.getAvatarMotionProfile()` の clone を motion-debug 側へ渡す形にした。
- Debug Console と Phase 6 snapshot の `avatarMotionProfile` は `MinimalAvatarMotionProfile` のまま維持した。完成版 profile は `MotionDebugPhase7Snapshot.profile` として `frame.solver.phase7` / live `phase7` にだけ出す。
- `initialCalibration` は既存 module に parser / clone export がないため、Phase 7 snapshot 境界に strict schema と clone を置いた。`onlineCalibration` は既存 parser / clone、`profile` は既存 parser / clone を利用した。
- `activeCanonicalCalibration` は runtime object を保存せず、latest canonical の `calibration` を Phase 7 snapshot 境界で strict schema / clone する形にした。
- replay viewer は `solver.value = { phase6, phase7 }` の substatus 方式に変更した。外側 `solver.status` は両方 `not_recorded` のときだけ `not_recorded`、片方が `available` / `invalid` なら `available` にした。
- 現 HEAD では initial / online calibration owner getter が motion-debug app へまだ接続されていないため、recording params は optional getter とし、未接続時は default session で埋めず省略する判断にした。
- `npm run check` が既存の別タスク `task-260626014928-character-animation-3-phase-7-online-calibration-guard/eval.md` の Markdown formatting で失敗したため、worktree 側の当該 `eval.md` を Prettier 整形した。これは gate を通すための既存 artifact 整形で、本タスク仕様の変更ではない。

### 確認結果

- `cd sincromisor-frontend && npm run test -- motionDebugPhase7Snapshot motionDebugViewerModel motionDebugRecorder`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS at commit `f6e3f99`。lint / build / test すべて PASS、full test は `30 passed`, `243 passed`。

### ドキュメント同期

- `documents/design/frontend/character/motion.md`、`tracking.md`、`overview.md` を同期した。
- 同期内容は Phase 7 snapshot schema、保存先 `frame.solver.phase7`、viewer substatus、旧 log 互換、Debug Console minimal profile と motion-debug Phase 7 profile/calibration の境界。

### 未実行確認

- ブラウザでの motion-debug 手動録画 / replay 操作は未実行。今回の変更は schema / model / recording / viewer の単体テストと build / gate で確認した。

### 残リスク

- initial / online calibration の runtime owner がまだ motion-debug app に公開されていないため、現時点の live / recording では profile と active canonical calibration が主な Phase 7 保存対象になる。owner getter が追加された時点で optional params へ接続する必要がある。
