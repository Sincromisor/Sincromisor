# character animation 3.0 phase 7 debug replay docs integration

## 背景 / 目的

Phase 7 で追加する `AvatarMotionProfile`、initial calibration、online calibration は、replay / debug log で見えなければモデル差分や calibration 失敗を比較できない。Phase 6 では solver / finalPose snapshot が motion-debug に接続済みなので、Phase 7 の profile / calibration も同じ層別 viewer に載せる。

このタスクでは、Phase 7 の保存 schema、motion-debug live snapshot / recording / replay viewer、設計文書同期を行う。profile や calibration のアルゴリズム本体は依存タスクの責務とし、本タスクでは接続と検証に集中する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase7Snapshot.ts` を追加し、`MOTION_DEBUG_PHASE7_SCHEMA_VERSION = "sincro.phase7-profile-calibration.v1"`、`MotionDebugPhase7Snapshot`、`parseMotionDebugPhase7Snapshot()`、`createMotionDebugPhase7Snapshot()` を export する。
- [ ] `MotionDebugPhase7Snapshot` は `profile`、`initialCalibration`、`onlineCalibration`、`activeCanonicalCalibration`、`warnings` を持つ。各 field は JSON 保存可能な plain object に限定し、runtime object を保存しない。
- [ ] `SincroMotionDebugFrame.solver` 直下に `phase7` slot を追加し、recording 時に `frame.solver.phase7` として保存する。top-level `profile` / `calibration` slot は追加しない。
- [ ] replay viewer の `solver` layer は `phase6` と `phase7` を分けて表示できる。旧 log に `phase7` がない場合は `not_recorded`、schema 違反は `invalid` とし、log load 自体は失敗させない。
- [ ] `viewer.layers.solver.value` は `{ phase6: SolverSubLayerValue; phase7: SolverSubLayerValue }` に固定する。`phase6` が valid で `phase7` missing / invalid の場合も外側 `viewer.layers.solver.status` は `available` とし、substatus だけを `not_recorded` / `invalid` にする。
- [ ] live snapshot では `poseRetargetRuntime.avatarMotionProfile` の完成版 profile、`MotionDebugRecordingController` params から受け取る initial calibration session / online calibration state、`latestCanonical.calibration` 由来の active canonical calibration id/source を確認できる。
- [ ] 未実行時の live Phase 7 snapshot は `profile` があれば保存し、`initialCalibration` / `onlineCalibration` は省略、`activeCanonicalCalibration` は `latestCanonical?.calibration` がある場合だけ保存する。未実行を default session で埋めない。
- [ ] `MotionDebugRecorder` の manifest / frame validation は `phase7` を unknown object として許容し、Phase 7 parser が layer 境界で厳密検証する。既存 `phase6` parser は変更しない。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` または新規 test で、valid phase7、missing phase7、invalid phase7、live phase7、旧 log 互換を検証する。
- [ ] `documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md` に Phase 7 profile/calibration の debug / replay 保存先、schema、旧 log 互換、通常 UI と debug UI の情報境界を同期する。

## 設計判断（着手前に確定済み）

- 保存先は `frame.solver.phase7` に固定する。top-level `profile` / `calibration` を追加する案は、Phase 1 の frame layer が増えすぎ、solver / profile / calibration の文脈が分散するため採用しない。
- `MotionDebugPhase7Snapshot` の最小 schema は次に固定する。

```ts
export type MotionDebugPhase7Snapshot = {
    schemaVersion: "sincro.phase7-profile-calibration.v1";
    profile?: AvatarMotionProfile;
    initialCalibration?: InitialSincroCalibrationSession;
    onlineCalibration?: OnlineSincroCalibrationState;
    activeCanonicalCalibration?: CanonicalCalibrationSnapshot;
    warnings: string[];
};
```

- parser は Phase 6 と同じ parse result union にする。unknown schema、invalid state、out-of-range を error code として返し、例外 throw しない。
- solver layer の viewer value は次に固定する。

```ts
type SolverSubLayerValue =
    | { status: "available"; value: unknown }
    | { status: "not_recorded"; value?: undefined }
    | {
          status: "invalid";
          value: { parseStatus: "invalid"; errors: unknown[]; raw: unknown };
      };

type SolverLayerValue = {
    phase6: SolverSubLayerValue;
    phase7: SolverSubLayerValue;
};
```

- `phase6` と `phase7` の両方が `not_recorded` の場合だけ外側 `viewer.layers.solver.status` を `not_recorded` にする。どちらか片方でも `available` または `invalid` なら外側 status は `available` とし、詳細は substatus で表す。
- live 接続元は `DebugConsoleSnapshot.sincroMotion.poseRetargetRuntime.avatarMotionProfile`、`MotionDebugRecordingController` params の `getInitialCalibrationSession()` / `getOnlineCalibrationState()`、`MotionDebugRecordingController.latestCanonical?.calibration` に固定する。`DebugConsoleSnapshot` へ calibration state を直接持たせる案は、Debug Console が calibration owner ではないため採用しない。
- viewer の selected layer は既存 `solver` のままとし、新しい top-level `calibration` layer は作らない。理由: Phase 7 の主目的は solver/profile/calibration が同じ replay frame で比較できることにあり、UI の layer 増加は Phase 10 QA で再整理する。
- 通常 UI 文言は保存しない。debug/replay には reason code と status を保存し、通常 UI で表示した文言は再計算可能な派生値として扱う。

## スコープ境界

- 本タスクでやること:
    - Phase 7 debug snapshot schema / parser。
    - motion-debug live snapshot、recording、replay viewer への接続。
    - 旧 log 互換の tests。
    - design docs 同期。
- 本タスクでやらないこと:
    - `AvatarMotionProfile` / initial calibration / online calibration のアルゴリズム実装。
    - calibration wizard UI。
    - metrics key の新規追加。
    - `setNormalizedPose` 全面移行。
    - profile 永続化、ユーザー設定保存。
- 依存タスクとの境界:
    - profile contract task が `AvatarMotionProfile` parser / clone を提供する。
    - torso fallback task は `profile.torso.distribution` と capability を実際に使う側であり、本タスクでは Phase 7 snapshot の profile 表示でその値を観測できるようにする。
    - initial / online calibration task が status / state / canonical calibration snapshot を提供する。
    - Phase 6 solver debug task は `frame.solver.phase6` と finalPose viewer の既存基盤を提供する。

## 実装方針（既存コード整合: file:line）

- motion debug log frame schema は `solver` を `z.unknown().optional()` として保存し、layer 側 parser で厳密検証する構造である（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:102`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:113`）。Phase 7 もこの方針を踏襲する。
- recording controller は現在 `phase6` と `finalPose` を作り、`solver.phase6` に保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:162`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:163`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:175`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:178`）。Phase 7 は同じ場所で `phase7` を追加する。
- viewer model は replay frame の `solver.phase6` を読み、missing を `undefined`、invalid を parse error object として扱う（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:148`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:158`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:165`）。Phase 7 viewer も同じ failure semantics を使う。
- `MotionDebugLayerSnapshot` は外側 layer ごとに単一 `status` と `value` を持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:113`、`sincromisor-frontend/src/pages/motionDebug/types.ts:116`）。Phase 7 は外側 schema を変えず、`solver.value` 内の substatus で phase6 / phase7 を分ける。
- Debug Console live snapshot は現状 `poseRetargetRuntime.avatarMotionProfile` だけを持ち、calibration state は持たない（`sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts:61`、`sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts:78`、`sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts:89`）。本タスクでは calibration state を motion-debug recording params から渡す。
- motion-debug live snapshot は `latestCanonical` と `poseRetargetRuntime` を同じ snapshot に持っている（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:289`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:297`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:302`）。active canonical calibration は `latestCanonical?.calibration` から取る。
- Phase 6 snapshot parser は schema version を固定し、profile を minimal shape で検証している（`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:14`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:174`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:226`）。Phase 7 は別 file / 別 schema にして Phase 6 を変更しない。
- motion design doc は motion-debug layer と frame slots を正本化している（`documents/design/frontend/character/motion.md:63`、`documents/design/frontend/character/motion.md:68`、`documents/design/frontend/character/motion.md:74`、`documents/design/frontend/character/motion.md:216`）。Phase 7 slot を同じ文書へ同期する。
- calibration UX 調査は debug UI に calibration status、online gate、freeze reason、AvatarMotionProfile を表示することを求めている（`documents/research/character_animation/answers/08-calibration-ux.md:20`、`documents/research/character_animation/answers/08-calibration-ux.md:21`、`documents/research/character_animation/answers/08-calibration-ux.md:274`、`documents/research/character_animation/answers/08-calibration-ux.md:281`、`documents/research/character_animation/answers/08-calibration-ux.md:282`）。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugPhase7Snapshot`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な replay/debug schema と設計正本を変更するため、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md` に Phase 7 snapshot、保存先、旧 log 互換、通常 UI / debug UI 境界を同期する。
