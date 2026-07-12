# Review: task-260626014933-character-animation-3-phase-7-debug-replay-docs-integration

## 判定

APPROVED

前回 blocking だった live Phase 7 profile の接続元矛盾と initial calibration parser/clone 未確定は、task.md 上で実装経路が固定され解消されている。Debug Console / Phase 6 の `MinimalAvatarMotionProfile` 境界も維持する方針になっており、実装者判断に残る blocking ambiguity はない。

## 指摘事項

なし

## 実装者への申し送り

- 完成版 `AvatarMotionProfile` は `DebugConsoleSnapshot.sincroMotion.poseRetargetRuntime.avatarMotionProfile` から読まないこと。task.md の通り `VRMScene.getAvatarMotionProfile()` / `VRMCharacterManager.getAvatarMotionProfile()` を追加し、`SincroPoseRetargeter.getAvatarMotionProfile()` の clone を `MotionDebugRecordingController` params の `getAvatarMotionProfile()` へ渡す。
- Debug Console と Phase 6 snapshot schema の `avatarMotionProfile` は `MinimalAvatarMotionProfile` のまま維持する。`VRMCharacterManager` の既存 Debug Console 更新経路では `toMinimalAvatarMotionProfile()` 変換を残し、完成版 profile は `frame.solver.phase7.profile` 側だけに保存する。
- `initialCalibration` は現行 module に parser / clone export がないため、task.md の通り `motionDebugPhase7Snapshot.ts` 内に local strict schema / clone を置く。`profile` は `parseAvatarMotionProfile()`、`onlineCalibration` は `parseOnlineSincroCalibrationState()` を使い、既存 module の contract を広げない。
- `activeCanonicalCalibration` も runtime object を保存せず、`latestCanonical?.calibration` 由来の plain snapshot として扱う。単体 parser export はないため、Phase 7 snapshot 境界で strict schema / clone を持つか、既存 canonical / online calibration の schema 形状に合わせて検証する。
- `viewer.layers.solver.value` は `{ phase6, phase7 }` の substatus 方式に固定し、外側 `solver.status` は task.md の条件通り判定する。旧 log 互換では `phase7` missing を `not_recorded`、schema 違反を `invalid` にして log load 自体は失敗させない。
- developer-visible な replay/debug schema を変えるため、受け入れ条件通り `documents/design/frontend/character/motion.md`、`tracking.md`、`overview.md` を実装と同時に同期する。
