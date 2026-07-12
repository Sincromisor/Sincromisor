# Evaluation: task-260628161551-character-animation-3-0-phase-11-replay-failure-mining

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] candidate report helper / schema / input が追加されている — `motionOptimizationCandidateReport.ts` で `MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION`、input/report/candidate types、`analyzeMotionOptimizationCandidates(input)` を export。`generatedAtIso` は input から返却され、helper 内で現在時刻を読んでいない。
- [✓] metric key to target mapping が固定仕様どおり — IK、temporal、gesture、anomaly、performance、do_not_optimize の分類が task.md の一覧と一致し、candidate target order も固定配列で実装されている。
- [✓] candidate 生成対象 / skip warning が仕様どおり — `warn` / `fail` fixture のみ candidate 化し、`pass` / `invalid_fixture` などは `fixture_skipped:${fixtureId}:${status}`、errors ありなら `:${errors.join("|")}` を付けて warnings に残す。
- [✓] candidate order / id / metric grouping が deterministic — fixture order に従い、fixture 内は target order、candidate index は fixture 内 0-based、`fixtureId:target:index`。同一 target の metric は `MOTION_METRIC_KEYS` order で集約される。
- [✓] evidence filtering / message が仕様どおり — evidence は metric status `warn` / `fail` または comparison `regressed` に限定され、message は `${metricKey}: status=${status}, value=${valueText}`、regressed では `, comparison=regressed` が付く。
- [✓] severity / requiresHumanLabel / notes が固定仕様どおり — fail metric または fixture fail 条件、human label 対象、target ごとの notes が task.md と一致。
- [✓] `not_available` だけの warn fixture が `do_not_optimize` になる — unit test で `neutral-10s:do_not_optimize:0`、empty evidence、human label false を確認。
- [✓] frameRange scan が仕様どおり — `gestureFlickerCount` は valid intent の side-local previous semantic intent / stableDurationMs < 150 / tracking or different semantic intent 条件、`sideSwapCount` は reliability / intent warnings の最初の event を range にする。range 不明時 warning も実装されている。
- [✓] `MotionDebugApi.analyzeOptimizationCandidates(config)` が追加されている — 既存 `runQaRegression(config)` を先に呼び、失敗時は既存 `no_recording_loaded` / `fixture_id_required` をそのまま返し、成功時に candidate report を返す。
- [✓] テストが追加 / 更新されている — candidate helper test は IK / temporal / gesture / anomaly / performance / pass skip / invalid warning / deterministic order-id / not_available を検証。viewer model test は loaded recording からの report 取得と fixture id 未指定エラーを検証。
- [✓] design doc が同期されている — `documents/design/frontend/character/motion.md` に Phase 11 candidate report v1、metric-to-target rule、performance_policy の非 ML 方針、補正適用 / 学習を行わない方針、motion-debug API が追記されている。

## テスト結果

- `cd sincromisor-frontend && npm run test -- motionOptimizationCandidateReport` — passed: 1 file / 5 tests.
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel` — passed: 1 file / 38 tests.
- `npm run gate` — PASS。`gate:lint` / `gate:build` / `gate:test` は commit `4b4f28c` clean tree の cache hit。test summary は 385 passed。
- 追加確認として `npm run tasks:check` も試行したが、評価 worktree root 側で `yaml` package が解決できず `ERR_MODULE_NOT_FOUND` で失敗。`package.json` の `gateSteps` 正本には含まれないため、合否判定の必須ゲートからは除外した。
- カバレッジ評価: 受け入れ条件の主要な分類・順序・ID・evidence・not_available・frameRange・API error surface は unit / viewer model test とコード照合で十分確認されている。未検証の実ブラウザ手動操作は developer API 追加に対する残リスクとして軽微。

## ドキュメント整合性

- 公開 WebRTC / backend 契約の変更はなし。
- developer-visible な `window.__SINCRO_MOTION_DEBUG__.analyzeOptimizationCandidates(config)` と Phase 11 candidate report artifact が追加されたためドキュメント同期が必要。`documents/design/frontend/character/motion.md` に schema version、input の時刻方針、metric-to-target rule、`performance_policy` 非 ML 方針、補正 / 学習 / telemetry を行わないこと、API error semantics が同期済み。

## 残課題（FAIL の場合）

- なし。

## 評価メモ

- 評価 worktree: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-4b4f28cc9c21-n9PkUO`
- 実装 commit: `4b4f28cc9c21e46d7341af81bd2a19c49d8b3662`
- 評価終了時の評価 worktree は clean。
