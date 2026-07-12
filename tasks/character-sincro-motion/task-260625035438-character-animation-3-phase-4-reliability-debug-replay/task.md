# character animation 3.0 phase 4 reliability debug replay integration

## 背景 / 目的

Phase 4 の reliability は、計算するだけではなく、なぜ weight が下がったかを `motion-debug` と replay log で追える必要がある。roadmap の Phase B gate は、Pose / Hand / Face / Gesture の timestamp と confidence 低下理由を debug で追え、悪い観測が低 weight として下流へ渡ることである。

このタスクでは、前段の `ReliabilityMap` contract と pose estimator を `motion-debug` の live snapshot、recording、viewer、replay に接続する。下流の canonical / IK へ weight を反映する作業は後続タスクへ分ける。

依存:

- `task-260625035438-character-animation-3-phase-4-reliability-contract`
- `task-260625035438-character-animation-3-phase-4-pose-reliability-estimator`

## 完了条件（受け入れ条件）

- [ ] `MotionDebugSnapshot` に optional `reliability?: ReliabilityMap | ReliabilityLayerParseError` を追加し、live snapshot の `viewer.layers.reliability` が `not_implemented` ではなく `available` になる。
- [ ] `MotionDebugApp.handlePoseMotion()` と `handlePoseFallback()` で `createPoseReliabilityMap()` を呼び、`latestReliability` を更新する。`mediaTimeMs` は `TrackerVideoFrameTiming.mediaTimeMs` があればそれを使い、なければ pose の `lastUpdatedAtMs`、それもなければ `0` にする。
- [ ] live camera / fixture 停止、replay load、recording reset 時に previous reliability を reset し、別 source の previous map が temporal innovation に混ざらない。
- [ ] `MotionDebugRecordingController.recordPoseFrame()` が frame の `reliability` slot に valid `ReliabilityMap` を保存する。reliability が未計算の frame は slot を省略せず、`createDefaultReliabilityMap(mediaTimeMs)` を保存する。
- [ ] replay frame に `frame.reliability` がある場合は `parseReliabilityMap()` で検証し、valid なら viewer / snapshot に表示する。invalid な場合は replay failure にせず、`parseStatus: "invalid"`、parse errors、raw value を reliability layer の `available` value として表示する。
- [ ] replay frame に `frame.reliability` がない旧 log では、live fallback と同じく `poseSnapshot` から `createPoseReliabilityMap()` を再計算し、replay layer は `available` にする。`poseSnapshot` もない場合だけ `not_recorded` とする。
- [ ] `MotionDebugViewerModel` の reliability layer は live snapshot、replay saved reliability、replay recalculated reliability をこの優先順で解決する。`RESERVED_PHASE_1_LAYERS` から reliability を外す。
- [ ] `motion-debug` window API の `getSnapshot()` / `loadRecording()` / `startReplay()` / `stepReplay()` で reliability layer の status と value を観測できる。
- [ ] ユニットテストで、live reliability fallback、saved replay reliability、invalid replay reliability、旧 log replay recalculation、missing poseSnapshot の各 viewer status を確認する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に、`frame.reliability` の保存 / replay 解決順 / invalid parse の扱いを同期する。

## 設計判断（着手前に確定済み）

- reliability は `motion-debug` page 側で生成する。既存の canonical も `MotionDebugRecordingController.recordPoseFrame()` が pose callback / fallback callback 起点で作る方針になっている（`documents/design/frontend/character/motion.md` 既存記述、実装は `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts`）。TrackerRuntime / Worker には DOM、download、viewer、recording の責務を持たせない。
- invalid saved reliability は replay failure にしない。canonical layer も invalid canonical を replay failure とせず parse error summary として表示する設計である（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:574`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:143`）。Reliability layer も同じ UX に揃える。
- 旧 log に `frame.reliability` がない場合は、`poseSnapshot` から再計算する。Phase 4 導入前の Phase 1 / 2 log を比較対象に残すため、欠損を parse error にしない。
- `frame.reliability` は optional slot として既存 schema にある（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:109`）。本タスクでは log schema version を上げず、slot の中身を ReliabilityMap v1 として viewer 境界で検証する。
- reliability の下流反映は本タスクで行わない。debug / replay の可観測性を先に固定し、後続 downstream task で canonical / IK に接続する。

## スコープ境界

- 本タスクでやること:
    - `motion-debug` live snapshot への ReliabilityMap 追加。
    - recording frame の `frame.reliability` 保存。
    - replay / viewer の reliability parse と fallback recalculation。
    - viewer model と window API のテスト。
- 本タスクでやらないこと:
    - ReliabilityMap schema / estimator 自体の設計変更。
    - CanonicalUpperBodyState confidence や retarget / IK weight への反映。
    - UI の装飾的な表示改善。JSON layer と status が見えれば完了とする。
    - gzip / Brotli import の追加。

## 実装方針（既存コード整合: file:line）

- `MotionDebugSnapshot` は現在 `canonical?: CanonicalUpperBodyState | CanonicalLayerParseError` を持つ（`sincromisor-frontend/src/pages/motionDebug/types.ts:99`）。同じ pattern で `ReliabilityLayerParseError` と `reliability?` を追加する。
- `MotionDebugApp.getSnapshot()` は live snapshot を組み立てて viewer model へ渡す（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:257`）。`latestReliability` はここで `liveSnapshot` に含める。
- live pose callback は `handlePoseMotion()` / `handlePoseFallback()` で camera quality 更新、pose 適用、recording、overlay を行う（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:536`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:549`）。reliability 更新は camera quality 更新後、recording 前に行う。
- `MotionDebugViewerModel` は `"reliability"` layer を既に持つが、現状は replay frame の raw slot しか見ず reserved layer 扱いである（`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:59`、`sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:119`）。ここに parse / fallback 解決を追加する。
- replay canonical は saved frame 優先、なければ poseSnapshot から再計算している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:574`）。reliability も同じ優先順にする。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecordingController`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

必要なら Playwright / browser smoke で `/motion-debug/` を開き、backend 未起動でも `window.__SINCRO_MOTION_DEBUG__.getSnapshot().viewer.layers.reliability.status` が `not_implemented` ではないことを確認する。

## ドキュメント同期の要否

要。developer-visible な motion-debug layer と replay log の解決挙動が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に `frame.reliability`、parse failure、旧 log fallback、viewer layer status を同期する。公開 WebRTC / backend 契約は変更しない。
