# Implementation Log: task-260706031110-motion-debug-viewer-model-size-split

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- `review.md` は APPROVED、Critical / High 指摘なし。申し送りどおり
  `./motionDebugViewerModel` の import path は維持し、`createMotionDebugViewerSnapshot`、
  `MOTION_DEBUG_LAYER_KEYS`、`MOTION_DEBUG_VIEWER_MODES` を facade から公開した。
- production は `motionDebugViewerCatalog.ts`、`motionDebugViewerLayerSnapshots.ts`、
  `motionDebugViewerLayerResolvers.ts`、`motionDebugViewerSolverLayer.ts`、
  `motionDebugViewerMetricsLayer.ts` へ責務分割した。各 production file は 300 行以下。
- parser error の status は task.md の受け入れ条件に合わせ、canonical / temporal / reliability も
  `{ parseStatus: "invalid", errors, raw }` を `status: "invalid"` として表示するようにした。
  既存 test 名に残っていた "available parse error summary" は public API 経由の invalid 期待へ更新した。
- tests は fixture を `motionDebugViewerTestFixtures.ts` へ移し、app API / metrics / solver /
  parsed layers / reliability + camera の domain 別 test file に分割した。production internal helper は
  テスト都合では export していない。
- `npm run gate` 初回は既存 Markdown 3 件の Prettier 不一致で lint 段が失敗した。gate を clean commit で
  通すため、implementation worktree 内の `documents/research/character_animation/roadmap.md` と当該
  `task.md` / `review.md` に Prettier-only 整形を別コミットで追加した。文言変更は意図していない。
- ドキュメント同期: 公開 API、通信契約、公開 URL、`MotionDebugApi`、recording log schema、metrics schema は
  変更していないため設計文書本文の同期は不要。上記 Markdown 整形は gate 前提の既存 format 修正であり、
  仕様同期ではない。

### Verification

- `cd sincromisor-frontend && npm run test -- --run src/pages/motionDebug`:
  PASS（9 files / 48 tests）
- `cd sincromisor-frontend && npm run build`: PASS
- `cd sincromisor-frontend && npm run test`: PASS（69 files / 481 tests）
- `npm run tasks:check`: PASS
- `npm run gate`: PASS at `48652eb`（lint / build / test）

### Not Run / 残リスク

- `npm run tasks:check:frontend-structure` は FAIL。原因は `git diff main --name-only -- sincromisor-frontend/src`
  がこの worktree の基点差分を大量に拾い、今回触っていない既存 300 行超 production files を strict target
  として扱うため。今回変更した production files はすべて 300 行以下、単一 test/helper file はすべて 800 行以下。

### Comment Audit

| path                                                                            | symbol or decision                                                   | kind                      | current comment                        | decision | required maintenance knowledge                                                                                                                      | action                                               | reviewer note                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- | -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts`          | module boundary / facade                                             | boundary                  | 旧 module TSDoc は全責務をまとめて説明 | rewrite  | 既存 import 元を維持し、責務は catalog / resolver / solver / metrics / snapshot status に委譲する                                                   | facade 契約に合わせて module TSDoc を rewrite        | `motionDebugApp.ts` / renderer の import path が変わっていないこと                                                    |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts`          | `MotionDebugViewerContext`                                           | public export             | 入力境界と replay 優先の説明あり       | keep     | replay frame 優先、metrics summary と replay metrics JSON 表示経路が独立していること                                                                | 既存コメントを移設後も保持                           | context の field shape が変わっていないこと                                                                           |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts`          | `createMotionDebugViewerSnapshot`                                    | public export             | parser failure / camera scrub 方針あり | rewrite  | parser 失敗は throw せず layer invalid、camera は frame metrics / manifest / live の順で raw device label を再導入しない、副作用なし                | JSDoc を facade の observable output に合わせて更新  | 返却 shape と recording/replay/metrics fields が維持されていること                                                    |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerCatalog.ts`        | `MOTION_DEBUG_LAYER_KEYS`                                            | public export             | 旧コメントあり                         | rewrite  | selector、snapshot JSON、tests が順序依存。追加削除時は label と assembly も更新する                                                                | catalog module へ移して JSDoc を更新                 | 配列順序が既存と同一であること                                                                                        |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerCatalog.ts`        | `MOTION_DEBUG_VIEWER_MODES`                                          | public export             | 旧コメントあり                         | keep     | `metrics` は runtime 推論 mode ではなく表示 mode                                                                                                    | catalog module へ移して保持                          | renderer selector の import 元 re-export が維持されていること                                                         |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerCatalog.ts`        | `getMotionDebugLayerLabel` / `isMotionDebugPhase1ReservedLayer`      | public export             | 新設                                   | add      | label は UI 表示用で保存 contract ではない。reserved layer は欠損時に `not_implemented` を返す                                                      | JSDoc 追加                                           | status 変換 module 以外で label map を重複させていないこと                                                            |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerSnapshots.ts` | `createLayerSnapshot` / `hasRecordedValue`                           | public export / heuristic | 旧 private helper comment なし         | add      | `undefined` と空 plain object だけ欠損扱い。`null` は旧 JSON 表示の明示値として残す                                                                 | JSDoc 追加                                           | `null` を欠損扱いに広げていないこと                                                                                   |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerSnapshots.ts` | parser error wrapping                                                | boundary                  | 旧 private helper comment なし         | add      | resolver は throw せず `{ parseStatus: "invalid", errors, raw }` を返し、この module が viewer status `invalid` へ変換する                          | `createParsedLayerSnapshot` JSDoc 追加               | canonical / temporal / reliability / intent / postProcessing / finalPose の invalid test が public API 経由であること |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerSnapshots.ts` | solver layer status aggregation                                      | heuristic                 | 旧 private helper comment なし         | add      | sublayer のいずれかが `available` / `invalid` なら layer 全体は `available`。全 sublayer `not_recorded` のみ未記録                                  | `createSolverLayerSnapshot` JSDoc 追加               | invalid sublayer で solver layer が available のままであること                                                        |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerResolvers.ts` | camera privacy decision                                              | boundary / privacy        | 旧 private helper comment なし         | add      | replay frame metrics.cameraQuality、manifest camera、live camera の順。raw device label を含み得る設定を優先復元しない                              | `resolveCameraValue` JSDoc 追加                      | `source: "none"` かつ quality 無しは `not_recorded`                                                                   |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerResolvers.ts` | legacy reliability fallback                                          | fallback / parser         | 旧 inline comment あり                 | rewrite  | 旧 log は reliability slot が無い。parse 可能な poseSnapshot だけ reliability を再計算し、pose 欠損/parse 不能は未記録扱い                          | function JSDoc に統合し stale inline comment を削除  | live reliability 優先、旧 poseSnapshot 再計算、pose 欠損 not_recorded                                                 |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerResolvers.ts` | canonical / temporal / intent / postProcessing / finalPose resolvers | parser / fallback         | 旧 private helper comment なし         | add      | replay frame 選択時に保存 slot を優先し、layer によって live fallback を使わない。parser 失敗は wrapper で返す                                      | 各 resolver に JSDoc 追加                            | replay saved slot 優先と invalid wrapper が維持されていること                                                         |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerSolverLayer.ts`    | `resolveSolverValue`                                                 | public export / parser    | 旧 private helper comment なし         | add      | replay では live fallback せず Phase 6 / 7 / 9 slot を sublayer 単位で strict parse。失敗は sublayer invalid                                        | module TSDoc と function JSDoc 追加                  | Phase 6 / 7 / 9 の available / invalid / not_recorded 変換                                                            |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerMetricsLayer.ts`   | metrics augmentation decision                                        | public export / boundary  | 旧 inline comment あり                 | rewrite  | summary 未計算でも replay frame metrics JSON があれば available。activePerformanceProfile は viewer 表示値だけに補い、frame contract に書き戻さない | module/function JSDoc に統合し inline comment を削除 | replay metrics JSON に activePerformanceProfile が付くが `viewer.metrics` は undefined のまま                         |
| `sincromisor-frontend/src/pages/motionDebug/__tests__/*`                        | fixture / assertion split                                            | test/helper               | production comment audit 対象外        | keep     | tests/helper のみ。production public export / module boundary ではない                                                                              | comment audit 対象外として記録                       | 単一 test/helper file が 800 行以下                                                                                   |

## attempt 2

### 判断 / 申し送り対応

- eval.md の FAIL 指摘どおり、`resolveReliabilityValue()` が live reliability を先に返していたため、
  replay frame に保存済み `reliability` slot がある場合でも saved slot が優先されていなかった。
- `context.replayFrame` がある場合は、まず `frame.reliability` を strict parse し、無ければ legacy
  `poseSnapshot` fallback を試し、pose 欠損/parse 不能なら `undefined` を返す順序に修正した。
  live reliability は replay frame が無い場合だけ返す。
- `createMotionDebugViewerSnapshot()` public API 経由で、live reliability と replay reliability が両方ある
  replay context では replay reliability が採用される test を追加した。production internal helper は
  export / import していない。
- ドキュメント同期: 公開 API、通信契約、公開 URL、`MotionDebugApi`、recording log schema、metrics schema は
  変更していないため不要。

### Verification

- `cd sincromisor-frontend && npm run test -- --run src/pages/motionDebug/__tests__/motionDebugViewerReliabilityCamera.test.ts`:
  PASS（1 file / 9 tests）
- `cd sincromisor-frontend && npm run test -- --run src/pages/motionDebug`: PASS（9 files / 49 tests）
- `npm run gate`: PASS at `0a8c3f0`（lint / build / test、69 files / 482 tests）

### Comment Audit

| path                                                                                              | symbol or decision                          | kind                              | current comment                                                                               | decision | required maintenance knowledge                                                                                                                                            | action                                                 | reviewer note                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerLayerResolvers.ts`                   | `resolveReliabilityValue` replay precedence | public export / fallback / parser | attempt 1 comment は legacy fallback を説明していたが、live/replay 優先順を明示していなかった | rewrite  | replay frame がある場合は saved reliability slot が live snapshot より優先。slot 欠損時だけ legacy poseSnapshot fallback。live reliability は replay frame が無い場合のみ | JSDoc を replay 優先順込みで更新し、実装順序も合わせた | live と replay reliability が両方ある public API test で replay timestamp/source が採用されること |
| `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerReliabilityCamera.test.ts` | replay reliability precedence test          | test                              | production comment audit 対象外                                                               | add      | acceptance coverage gap を埋める black-box test。production helper は export しない                                                                                       | public API 経由の test を追加                          | test/helper file は 800 行以下のまま                                                              |

### 残リスク

- なし。
