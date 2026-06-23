# character animation 3.0 canonical debug replay integration

## 背景 / 目的

Phase 2 の完了条件には、`CanonicalUpperBodyState` を debug snapshot と replay log に保存でき、`motion-debug` で canonical の source、warning、out-of-range、calibration reason を確認できることが含まれる。依存タスクで canonical contract、torso frame、arm feature 抽出は揃うが、現行 `motion-debug` は `frame.canonical` を記録せず、live / replay viewer の canonical layer も値なしの予約枠のままである。

このタスクでは、pose callback / replay step の経路に canonical 生成を接続し、recording、replay、viewer snapshot で `CanonicalUpperBodyState` を確認できるようにする。IK / Temporal / MotionIntent の入力差し替えはまだ行わず、観測と再現性を先に確保する。

## 完了条件（受け入れ条件）

- [ ] `MotionDebugRecordingController.recordPoseFrame()` が `createCanonicalUpperBodyState()` を呼び、`MotionDebugRecorder.recordFrame()` に渡す frame input の `canonical` slot へ `CanonicalUpperBodyState` を保存する。
- [ ] recording 中の canonical 生成は previous canonical state を渡し、torso `bodyFront` の反転抑制が連続 frame で効くようにする。recording 停止、source 停止、replay 読み込み時には previous canonical state を reset する。
- [ ] `MotionDebugSnapshot` に optional `canonical?: CanonicalUpperBodyState` を追加し、live camera / fixture 実行中の latest canonical を `window.__SINCRO_MOTION_DEBUG__.getSnapshot()` から読めるようにする。既存 `status`、`camera`、`pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、`render` の field 名は変更しない。
- [ ] `motionDebugViewerModel` の canonical layer は、replay frame に `frame.canonical` がある場合はそれを優先し、ない場合は live snapshot の `canonical` を表示する。値がある canonical layer は `available`、値なしは既存どおり `not_implemented` または `not_recorded` として表示する。
- [ ] replay `pose-snapshot` mode では `MotionReplayApplyContext.frame.canonical` を parse し、valid な場合は latest canonical と viewer layer に反映する。invalid canonical は replay 自体を失敗させず、canonical layer に parse error summary を表示して `warnings` に相当する情報を確認できるようにする。
- [ ] exported NDJSON を `parseMotionDebugLogLines()` で読み込んだとき、`frame.canonical` は log schema 上の optional slot として保持され、`parseCanonicalUpperBodyState(frame.canonical)` が成功する。
- [ ] `motion-debug` viewer の canonical 表示は、`schemaVersion`、`timestamp.mediaTimeMs`、左右腕の `reach` / `elevationRad` / `openness` / `forwardness` / `elbowFlexionRad` / `classification`、`source`、`warnings`、`outOfRangeFields`、`calibration.id` を少なくとも確認できる。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` または専用 test を更新し、live canonical、replay canonical、invalid canonical の表示境界を検証する。
- [ ] `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionDebugRecorder.test.ts` または `pages/motionDebug` 側 test で、record frame に canonical が含まれることを検証する。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に `frame.canonical` の保存起点、viewer 表示、invalid canonical の扱いを同期する。

## 設計判断（着手前に確定済み）

- canonical 生成の接続点は `MotionDebugRecordingController.recordPoseFrame()` と `MotionDebugApp.applyReplayPoseSnapshot()` にする。TrackerRuntime や worker に canonical の責務を持たせる案は、Phase 2 時点で debug / replay 用の観測 contract を先に検証したいこと、また tracker worker に character/canonical 依存を増やしたくないことから採用しない。
- live snapshot の field 名は `canonical` に固定する。`viewer.layers.canonical.value` だけに埋め込む案は window API 利用者が canonical を直接取り出しにくく、Phase 3 以降の metrics / debug console 接続で再利用しづらいため採用しない。
- replay frame の canonical parse error は replay failure にしない。Phase 1 log schema では `frame.canonical` が `unknown` optional slot であり（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:103`）、古い log や途中生成 log を replay できることを優先するため。
- `motionDebugViewerModel` の layer status union はこのタスクでは増やさない。invalid canonical は layer `value` に `{ parseStatus: "invalid", errors: [...] }` を入れて `available` とし、UI 上で error summary を確認できるようにする。status を増やす変更は viewer 全 layer に影響するため別タスクに残す。
- `frame.canonical` は saved canonical を正本にする。replay 中に pose snapshot から再計算した値は live fallback 用に限り、recorded canonical がある frame では上書きしない。

最小 integration shape:

```ts
type MotionDebugSnapshot = {
    // existing fields are unchanged
    canonical?: CanonicalUpperBodyState | CanonicalLayerParseError;
};

type CanonicalLayerParseError = {
    parseStatus: "invalid";
    errors: CanonicalUpperBodyStateParseError[];
    raw: unknown;
};
```

`CanonicalLayerParseError` は viewer 表示専用で、`frame.canonical` へ保存しない。

## スコープ境界

- 本タスクでやること:
    - `motion-debug` recording frame への `frame.canonical` 保存。
    - live / replay snapshot への canonical 表示。
    - canonical parse error の viewer 表示。
    - debug / replay 文書同期。
- 本タスクでやらないこと:
    - `motionDebugLogSchema.ts` の `frame.canonical` を `unknown` から strict schema へ変更すること。
    - metrics の canonical 入力化。
    - IK / retargeter / behavior state が canonical を主入力として読む変更。
    - TemporalStateEstimator、ReliabilityMap、MotionIntent の実装。
    - UI の大規模 redesign。

## 実装方針（既存コード整合: file:line）

- `MotionDebugRecordingController.recordPoseFrame()` は現在 `poseSnapshot`、`solver`、`metrics` を recorder に渡している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:89`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:100`）。本タスクでは同じ frame input に `canonical` を追加する。
- `MotionDebugApp` は最新 pose snapshot を保持し、pose callback / fallback callback で behavior state、Debug Console、recording、overlay を更新している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:112`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:497`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:505`）。live canonical はこの latest pose と同じ寿命で管理する。
- replay apply context は `frame` を持っており、`applyReplayPoseSnapshot()` へ渡せる（`sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts:47`、`sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts:233`）。本タスクでは replay frame の saved canonical を snapshot へ反映する。
- viewer model は replay frame の `canonical` を canonical layer source としている（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:115`）。本タスクでは live snapshot canonical fallback と parse error summary を追加する。
- `MotionDebugSnapshot` は `types.ts` で定義され、既存 fields と optional `viewer` を持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:85`）。本タスクでは optional `canonical` を追加し、既存 field rename は行わない。
- `motionDebugViewerModel.test.ts` は Phase 1 viewer の layer status を既に検証している（`sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts:167`）。canonical layer の live / replay / invalid ケースはこのテスト群へ追加する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run test -- canonical`
- `cd sincromisor-frontend && npm run build`
- 手動または Playwright で `motion-debug` を開き、camera または fixture から短時間 recording した NDJSON に `frame.canonical.schemaVersion === "sincro.canonical-upper-body.v1"` が含まれることを確認する。Playwright が使えない場合は DOM / window API unit test で代替し、未実行理由を `impl.md` に残す。
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer 向け motion debug log の保存内容と window API snapshot の公開挙動が変わるため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に `frame.canonical` の保存起点、viewer 表示、invalid canonical の扱いを同期する。
