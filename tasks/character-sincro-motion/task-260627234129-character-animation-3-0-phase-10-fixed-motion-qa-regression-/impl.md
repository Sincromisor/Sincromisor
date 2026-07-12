# Implementation Log: task-260627234129-character-animation-3-0-phase-10-fixed-motion-qa-regression-

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- review.md は APPROVED だったため実装に着手した。
- 申し送りどおり `MotionMetricKey` は追加せず、既存の `parseMotionDebugLogLines()`、`calculateMotionMetricSummary()`、`parseMotionMetricBaseline()`、`compareMotionMetricSummaries()` を組み合わせる harness とした。
- `runMotionQaRegression()` は caller から渡された `generatedAtIso` と optional `fetchLogText` だけを使い、helper 内で `fetch()`、`Date.now()`、`new Date()` は呼ばない実装にした。caller fetcher の reject は helper 全体の reject ではなく fixture-level `errors` に落とす。
- manifest は P0 subset を既定で許容し、`requireAllP0Fixtures: true` の場合だけ missing fixture を補って overall fail にする。loaded recording 1 件の window API では subset 実行できるようにした。
- unknown fixture id は runtime 診断として fixture result に残す必要があるため、`MotionQaFixtureResult.fixtureId` は invalid fixture の raw id も表せる `MotionP0FixtureId | string` にした。既知 fixture の計算結果は P0 fixture id のまま返す。
- window API は `runQaRegression(config)` を追加し、API 自体の failure は `no_recording_loaded` と `fixture_id_required` に限定した。fixture id は config 指定を優先し、loaded recording manifest の `source.fixtureId` が P0 に含まれる場合だけ採用する。`neutral-10s` への暗黙 fallback は入れていない。
- baseline ありの fixture は candidate fail と severityChanged regression を fail、severity unchanged regression を warn にした。旧 baseline の missing key は baseline parser の補完に追従しつつ warning として fixture `errors` に残す。
- subjective checklist は manifest から result へ echo するだけにし、機械判定には使っていない。
- 新規 large video/png/binary artifact は追加していない。テストは小さな synthetic NDJSON log を test helper 内で生成している。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に Motion QA fixture manifest v1、regression 判定規則、subjective checklist の非機械判定方針、window API の fixture id 解決、動画 asset を本タスクで追加しない判断を同期した。

### 確認

- `cd sincromisor-frontend && npm run test -- motionQaRegression` PASS
- `cd sincromisor-frontend && npm run test -- motionMetrics` PASS
- `cd sincromisor-frontend && npm run test -- motionMetricBaselineSchema` PASS
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel` PASS
- `cd sincromisor-frontend && npm run check` PASS
- `cd sincromisor-frontend && npm run build` PASS
- `npm run gate` PASS (`lint` / `build` / `test`: 46 files, 365 tests)

### 残リスク

- regression harness は replay log / synthetic log の機械判定に限定しており、実動画 fixture の再推論 E2E と subjective QA form UI は本タスクの非対象として残している。

### commit

- `55c3c04e355a6a59e212094e250f58376c5fd04f` (`feat(character): add motion QA regression harness`)
