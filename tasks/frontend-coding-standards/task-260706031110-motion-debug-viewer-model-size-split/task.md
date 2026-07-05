# motion-debug viewer model size split

<!--
  起票の入口は /new-task（起票 + 独立レビューを一括）。既存 task.md を後から再レビューする
  場合は /review-task <task-dir> を使う。いずれも APPROVED を得てから /run-task に渡す。
  各節は tasks/AUTHORING-CHECKLIST.md（task-reviewer 評価観点の正本）に対応する。
  初回 NEEDS_REVISION の最頻出根拠は「設計判断の未確定」と「ドキュメント同期要否の未記載」。
-->

## 背景 / 目的

`sincromisor-frontend/src` の TypeScript 行数上位を確認したところ、
`src/pages/motionDebug/motionDebugViewerModel.ts` が 621 行、
`src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` が 2342 行まで肥大化している。
同じ上位一覧には gaze / motionEvaluation / avatarProfile も含まれるが、それらは別ドメインであり、
同時に分割すると差分と確認範囲が大きくなりすぎる。

このタスクでは第一段階として、最大のテスト肥大と production hard 閾値超過が同時に発生している
motion-debug viewer model に絞り、公開挙動を変えずに layer catalog、layer value resolver、
solver sublayer、metrics layer、test fixture を責務別ファイルへ分割する。

参照する正本:

- `documents/rules/code-structure.md`
- `documents/rules/coding-ts.md`
- `documents/design/frontend/pages.md`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts` は
      `MotionDebugViewerContext`、`createMotionDebugViewerSnapshot()`、既存公開 constants の re-export /
      facade に寄せ、物理 300 行以下にする。既存 import 元
      `./motionDebugViewerModel` からの
      `createMotionDebugViewerSnapshot`、`MOTION_DEBUG_LAYER_KEYS`、
      `MOTION_DEBUG_VIEWER_MODES` は変更しない。
- [ ] `motionDebugViewerModel.ts` から、少なくとも次の production module を新設または同等責務名で分割する。
    - `motionDebugViewerCatalog.ts`: viewer mode / layer key / label / phase1 reserved layer の正本。
    - `motionDebugViewerLayerSnapshots.ts`: `available` / `invalid` / `not_recorded` /
      `not_implemented` / `not_calculated` への layer status 変換と `hasRecordedValue`。
    - `motionDebugViewerLayerResolvers.ts`: camera、reliability、canonical、temporal、intent、
      postProcessing、finalPose の live / replay fallback と parser error 包装。
    - `motionDebugViewerSolverLayer.ts`: Phase 6 / Phase 7 / Phase 9 solver sublayer の live / replay
      解決、`not_recorded` / `invalid` / `available` 変換。
    - `motionDebugViewerMetricsLayer.ts`: calculated summary と replay frame 保存済み metrics JSON の表示値作成。
- [ ] 新設 production module はそれぞれ物理 300 行以下にする。300 行超の例外コメント
      `// reason: structure-threshold-exception ...` は本タスクでは追加しない。
- [ ] `createMotionDebugViewerSnapshot()` の返却構造は既存と同一に保つ。具体的には、次の挙動をすべて維持する。
    - replay frame がある場合、saved slot を live snapshot より優先する。
    - parser 失敗は throw せず、対象 layer の `status: "invalid"` と
      `{ parseStatus: "invalid", errors, raw }` に変換する。
    - legacy log で reliability slot が無い場合、parse 可能な `poseSnapshot` から reliability を再計算する。
      `poseSnapshot` が無い、または parse 不能な場合は `not_recorded` にする。
    - camera layer は replay frame の `metrics.cameraQuality`、manifest camera、live camera の順に解決し、
      live camera source が `"none"` かつ quality が無い場合は `not_recorded` にする。
    - metrics layer は calculated summary が無い場合でも replay frame の保存済み `metrics` があれば
      `activePerformanceProfile` を付与して `available` にする。保存済み metrics が無ければ `not_calculated` にする。
    - solver layer は Phase 6 / 7 / 9 のいずれかが `available` または `invalid` なら layer 全体を
      `available` にし、全 sublayer が `not_recorded` のときだけ `not_recorded` にする。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` は
      test fixture と assertion domain を分割し、単一 test file 800 行以下にする。
      目安として fixture 生成は `motionDebugViewerTestFixtures.ts`、
      solver / reliability / metrics / app API 連携は別 test file に分ける。
- [ ] 分割後の tests は、既存の `createMotionDebugViewerSnapshot()` public API 経由で挙動を確認する。
      production internal helper をテスト都合だけで export しない。
- [ ] TypeScript production code の comment audit を `impl.md` に記録する。
      audit は変更・新設した public export / module boundary / legacy fallback / parser error wrapping /
      camera privacy decision / metrics augmentation decision を symbol or decision 単位で行い、少なくとも
      `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、
      `action`、`reviewer note` を含める。
- [ ] 新設・移動した public export には、`documents/rules/coding-ts.md` のコメント品質基準に沿って、
      目的、入力境界、observable output、失敗時挙動、副作用のうち変更安全性に必要な情報だけを
      JSDoc/TSDoc または module TSDoc で残す。名前・型から分かるだけのコメントは追加しない。

## 設計判断（着手前に確定済み）

- 分割対象は `src/pages/motionDebug/` 配下に閉じる。`motion-debug` は
  `documents/design/frontend/pages.md` 上の developer page であり、page-specific viewer model は
  `src/pages/motionDebug` に置くのが既存境界と一致する。
- `motionDebugViewerModel.ts` は互換 facade として残す。`motionDebugApp.ts` と
  `motionDebugViewerRenderer.ts` の import path を一斉変更する案は採らない。内部整理で公開 import 面を
  変える必要がなく、不要な差分を増やすため。
- layer key / mode の正本は `motionDebugViewerCatalog.ts` へ移すが、
  `motionDebugViewerModel.ts` から re-export する。renderer が使う selector 順序は現在の
  `MOTION_DEBUG_LAYER_KEYS` 順序を維持する。
- parser error の最小スキーマは既存どおり `{ parseStatus: "invalid", errors, raw }` とする。
  `Error` instance や throw へ変更しない。motion-debug replay では一部 layer の破損を recording 全体の失敗に
  しない設計だからである。
- `hasRecordedValue` は「`undefined` と空 plain object は未記録、その他は記録あり」とする既存仕様を維持する。
  `null` を欠損扱いへ広げない。既存 tests と JSON layer 表示では `null` は保存済み値として扱われ得るため。
- tests は production helper の直接 unit test ではなく、public API である
  `createMotionDebugViewerSnapshot()` の black-box test とする。helper を export して細かくテストする案は、
  `documents/rules/code-structure.md` の「テスト都合だけで internal を export しない」に反するため採らない。
- 本タスクで新しい runtime validation ライブラリや schema を導入しない。既存 parser
  (`parseCanonicalUpperBodyState` など) の呼び出し位置を移すだけにする。

## スコープ境界

本タスクでやること:

- `motionDebugViewerModel.ts` の責務別分割。
- `motionDebugViewerModel.test.ts` の fixture / assertion domain 分割。
- 分割に伴う import 更新。
- 変更 production module の comment audit と必要コメントの追加・更新・削除。

本タスクでやらないこと:

- `trackerRuntime.ts`、`sincroHandTrackerHelpers.ts`、`motionComposerComparisonMetrics.ts`、
  `avatarMotionProfile.ts`、motionEvaluation の巨大 test の分割。
- `MotionDebugApi`、`types.ts`、recording log schema、metrics schema、DataChannel / WebRTC 契約の変更。
- motion-debug UI の見た目、selector 順序、表示文言、公開 URL の変更。
- 300 行超の既存例外を全リポジトリから解消する横断作業。

後続候補:

- gaze tracking runtime の production / test 分割。
- hand tracking helper の assignment / feature snapshot / openness geometry 分割。
- motionEvaluation metrics / recorder tests の fixture 分離。
- avatar motion profile の schema / measurement / clone / parse 分割。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:71` から `:120` に
  layer keys、viewer modes、label、phase1 reserved layer が同居している。ここを
  `motionDebugViewerCatalog.ts` へ移し、`motionDebugViewerModel.ts` は constants を re-export する。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:128` から `:170` に
  `MotionDebugViewerContext` と `createMotionDebugViewerSnapshot()` がある。ここは facade として残し、
  `recording.scrubbedCameraSettings`、`replay`、`metrics`、`metricComparison` の返却 shape は変えない。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:173` から `:197` に
  12 layer の snapshot 組み立てが集中している。分割後も layer key の増減や順序変更はしない。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:199` から `:323` に
  solver sublayer の replay extraction、Phase 6 / 7 / 9 parser wrapping、live fallback がある。
  ここを `motionDebugViewerSolverLayer.ts` へ移す。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:325` から `:487` に
  finalPose、reliability、canonical、temporal、intent、postProcessing の resolver / parser wrapping がある。
  ここを `motionDebugViewerLayerResolvers.ts` へ移す。`reliability` の legacy fallback コメントは、
  移動後も stale にならない形で残す。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:489` から `:507` に
  camera layer の privacy-sensitive な解決順がある。raw device label を再導入しない意図を、
  移動先の comment audit 対象に含める。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:510` から `:559` に
  layer status 変換、`invalid` 判定、solver layer status 集約がある。
  ここを `motionDebugViewerLayerSnapshots.ts` へ移す。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:561` から `:592` に
  metrics summary と replay frame metrics JSON の表示値作成がある。
  ここを `motionDebugViewerMetricsLayer.ts` へ移す。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts:595` から `:621` に
  `hasRecordedValue`、`isRecord`、`isInvalidLayerValue`、solver parse error guard がある。
  utility を新設 module の最小責務へ移し、汎用 `utils.ts` は作らない。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:30` と `:199` から `:207` は
  `createMotionDebugViewerSnapshot()` を既存 path から呼んでいる。import path と呼び出し shape は維持する。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerRenderer.ts:7` と `:54` から `:60` は
  `MOTION_DEBUG_LAYER_KEYS` / `MOTION_DEBUG_VIEWER_MODES` を既存 path から selector へ使っている。
  import path と配列順序は維持する。
- `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts:60` から `:676` は
  fixture factory が 600 行超を占め、`:684` 以降に viewer / app API assertions が連続している。
  fixture factory は test helper module へ移し、assertions は behavior domain ごとの test file に分割する。
- `documents/design/frontend/pages.md:45` から `:50` は `motion-debug` を developer viewer とし、
  公開 window API 名・引数・戻り値は `types.ts` を正本として維持すると定義している。
  本タスクでは `types.ts` の公開 API を変更しない。

## テスト

- `cd sincromisor-frontend && npm run test -- --run src/pages/motionDebug`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check:frontend-structure`
- `npm run tasks:check`

期待するテスト観点:

- layer catalog の順序が既存と同じで、renderer selector の値が変わらない。
- replay / live fallback、parser invalid、legacy reliability fallback、camera 解決順、metrics layer、
  solver sublayer の既存 assertions が分割後も通る。
- `motionDebugViewerModel.ts` と新設 production module が frontend structure guard の strict 対象で
  300 行を超えない。

## ドキュメント同期の要否

不要。公開 API、通信契約、公開 URL、`MotionDebugApi`、recording log schema、metrics schema は変更せず、
motion-debug viewer model の内部 module 分割と test 分割に閉じる。設計正本
`documents/design/frontend/pages.md` の motion-debug 物理境界とも整合しているため、設計文書本文の更新は不要。
