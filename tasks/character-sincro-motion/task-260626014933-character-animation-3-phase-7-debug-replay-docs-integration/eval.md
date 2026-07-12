# Evaluation: task-260626014933-character-animation-3-phase-7-debug-replay-docs-integration

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `motionDebugPhase7Snapshot.ts` の追加と export — `MOTION_DEBUG_PHASE7_SCHEMA_VERSION = "sincro.phase7-profile-calibration.v1"`、`MotionDebugPhase7Snapshot`、`parseMotionDebugPhase7Snapshot()`、`createMotionDebugPhase7Snapshot()` が追加されている（commit `f6e3f99`）。
- [✓] Phase 7 snapshot field と plain JSON 境界 — `profile` / `initialCalibration` / `onlineCalibration` / `activeCanonicalCalibration` / `warnings` を持ち、profile は `parseAvatarMotionProfile()`、online は `parseOnlineSincroCalibrationState()`、initial / active canonical は Phase 7 境界の strict schema で検証している。clone は runtime object を直接保存しない。
- [✓] 保存先は `frame.solver.phase7` — recording は `solver.phase7` に保存し、top-level `profile` / `calibration` slot は追加していない。`MotionDebugRecorder` / log schema 側は `solver: z.unknown()` のまま。
- [✓] replay viewer の Phase 6 / Phase 7 分離 — `viewer.layers.solver.value` は `{ phase6, phase7 }` substatus 方式になっており、旧 log の missing `phase7` は `not_recorded`、schema 違反は `invalid` として log load を失敗させない。
- [✓] 外側 solver status 条件 — phase6 / phase7 が両方 `not_recorded` の場合だけ外側 `solver.status = "not_recorded"`、片方が `available` / `invalid` なら `available` にしている。
- [✓] live / recording Phase 7 接続 — recording controller は `getAvatarMotionProfile()`、optional `getInitialCalibrationSession()` / `getOnlineCalibrationState()`、同 frame の canonical calibration から Phase 7 snapshot を作る。motion-debug live snapshot は完成版 profile getter と latest canonical calibration だけを保存し、未接続の initial / online は default session で埋めていない。現 HEAD に initial / online owner getter がないため、この省略は受け入れ条件違反ではなく、owner getter 追加時の接続残リスクと判断した。
- [✓] Debug Console / Phase 6 minimal profile 境界 — `DebugConsoleSnapshot` と Phase 6 snapshot は `MinimalAvatarMotionProfile` のままで、`VRMCharacterManager` の既存 Debug Console 更新は `toMinimalAvatarMotionProfile()` を維持している。完成版 profile は `VRMCharacterManager.getAvatarMotionProfile()` / `VRMScene.getAvatarMotionProfile()` 経由で motion-debug 側に渡す。
- [✓] 未実行時の Phase 7 snapshot — `createMotionDebugPhase7Snapshot({})` は `undefined` を返し、profile があれば保存、initial / online は undefined のまま省略、active canonical は latest canonical がある場合だけ保存する。
- [✓] recorder validation 境界 — `MotionDebugRecorder` は `phase7` が壊れていても frame validation では unknown object として許容し、厳密検証は viewer / Phase 7 parser に閉じている。既存 Phase 6 parser は変更されていない。
- [✓] テスト追加 — `motionDebugPhase7Snapshot.test.ts`、`motionDebugViewerModel.test.ts`、`motionDebugRecorder.test.ts` で valid / missing / invalid / live / legacy / recorder unknown phase7 が検証されている。
- [✓] 設計文書同期 — `documents/design/frontend/character/motion.md`、`tracking.md`、`overview.md` に保存先、schema、旧 log 互換、通常 UI と debug UI の境界が同期されている。

## テスト結果

- `npm run gate`（worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-f6e3f9997762-2wiIVI`、commit `f6e3f99` clean）: PASS。`gate:lint` / `gate:build` / `gate:test` はいずれも CACHE HIT。cached test summary は `Tests 243 passed (243)`。
- `cd sincromisor-frontend && npm run test -- motionDebugPhase7Snapshot motionDebugViewerModel motionDebugRecorder`: PASS。`Test Files 3 passed (3)`, `Tests 41 passed (41)`。
- カバレッジ評価: 受け入れ条件の主要分岐は実装者テストで十分に直接検証されている。特に Phase 7 parser の strict validation、viewer の `{ phase6, phase7 }` substatus、旧 log 互換、invalid phase7 の非 fatal 化、recorder validation 境界が揃っているため、追加 acceptance test は不要と判断した。

## ドキュメント整合性

- 公開 WebRTC / backend API 契約、runtime endpoint、通常 UI contract の変更はない。
- developer-visible な motion-debug replay/debug schema は変更されており、対応する `documents/design/frontend/character/motion.md`、`tracking.md`、`overview.md` は同じ commit で同期済み。生成物の再生成対象はなし。
- 別タスク `task-260626014928-character-animation-3-phase-7-online-calibration-guard/eval.md` の Prettier 整形が commit に含まれるが、Markdown formatting のみで、gate lint を clean にするための artifact 修正である。実装コード・テスト・契約を変えていないため close blocker ではない。

## 残課題（FAIL の場合）

- なし。
