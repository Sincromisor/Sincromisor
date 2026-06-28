# character animation 3.0 phase 11 replay failure mining

## 背景 / 目的

Phase 11 は「まず rule-based pipeline の限界を replay log で確認する」ことを前提に、軽量 constrained optimization、temporal MLP / TCN、gesture classifier、anomaly detector を候補にしている（`documents/research/character_animation/roadmap.md:516`、`documents/research/character_animation/roadmap.md:522`、`documents/research/character_animation/roadmap.md:529`）。Phase 10 では QA regression が replay log と metrics を比較できるようになったが、どの失敗を Phase 11 のどの候補へ回すべきかを機械的に分類する layer はまだない。

このタスクでは、replay log / QA regression result から optimization candidate report を作る pure helper と motion-debug API を追加する。モデル学習や補正適用は行わず、候補抽出と evidence の保存に限定する。

依存:

- `task-260628161547-character-animation-3-0-phase-11-post-processing-contract`

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionPostProcessing/motionOptimizationCandidateReport.ts` を追加し、`MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION = "sincro.motion-optimization-candidates.v1"`、`MotionOptimizationCandidateReportInput`、`MotionOptimizationCandidateReport`、`MotionOptimizationCandidate`、`analyzeMotionOptimizationCandidates(input)` を export する。
- [ ] input は `{ qaResult: MotionQaRegressionResult; framesByFixtureId?: Partial<Record<MotionP0FixtureId, readonly SincroMotionDebugFrame[]>>; generatedAtIso: string }` に固定する。`generatedAtIso` は caller 必須で、helper 内で `Date.now()` / `new Date()` を呼ばない。
- [ ] result schema は次に固定する。

```ts
export type MotionOptimizationCandidateTarget =
    | "constrained_ik_refinement"
    | "temporal_correction"
    | "gesture_sequence_classifier"
    | "anomaly_detector"
    | "performance_policy"
    | "do_not_optimize";

export type MotionOptimizationCandidate = {
    candidateId: string;
    fixtureId: MotionP0FixtureId | string;
    target: MotionOptimizationCandidateTarget;
    severity: "warn" | "fail";
    metricKeys: MotionMetricKey[];
    frameRange?: { startFrameIndex: number; endFrameIndex: number };
    evidence: Array<{
        metricKey: MotionMetricKey;
        value: number | null;
        status: MotionMetricStatus;
        message: string;
    }>;
    requiresHumanLabel: boolean;
    notes: string[];
};

export type MotionOptimizationCandidateReport = {
    schemaVersion: typeof MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION;
    generatedAtIso: string;
    sourceQaOverall: MotionQaRegressionResult["overall"];
    candidates: MotionOptimizationCandidate[];
    warnings: string[];
};
```

- [ ] classification rule は metric key から一意に決める。`elbowFlipCount`、`solverElbowFlipRejectCount`、`solverPoleUncertainFrameCount`、`solverReachClampOccupancy`、`reachClampOccupancy` は `constrained_ik_refinement`。`neutralJitter`、`recoveryJumpAngleDeg`、`temporalMaxRecoveryJumpDegEquivalent`、`temporalNeutralWristJitter`、`trackingLossDurationMs` は `temporal_correction`。`gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount` は `gesture_sequence_classifier`。`sideSwapCount`、`intentInvalidFrameCount` は `anomaly_detector`。`trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` は `performance_policy`。それ以外または `not_available` だけの fixture は `do_not_optimize` にする。
- [ ] candidate は fixture result が `status: "warn" | "fail"` の場合だけ生成する。`pass`、`invalid_fixture`、`unsupported_source`、`missing_fixture` は candidate にせず、report `warnings` に理由を入れる。
- [ ] candidate 配列 order は、`qaResult.fixtures` の順、同一 fixture 内では target order `constrained_ik_refinement -> temporal_correction -> gesture_sequence_classifier -> anomaly_detector -> performance_policy -> do_not_optimize` に固定する。`candidateId` の `index` は同一 fixture 内で生成された candidate の 0-based 連番とし、`fixtureId:target:index` の deterministic string にする。
- [ ] 1 fixture 内で同じ target に複数 metric が該当する場合は 1 candidate にまとめ、`metricKeys` は `MOTION_METRIC_KEYS` の order で並べる。evidence 対象は、該当 target の metric のうち `summary.metrics[key].status` が `"warn"` / `"fail"`、または `comparison?.[key].status === "regressed"` のものだけに限定する。`not_available` だけで warn になった fixture は `do_not_optimize` candidate にまとめる。
- [ ] evidence message は `${metricKey}: status=${status}, value=${valueText}` に固定する。`valueText` は metric value が number の場合 `String(value)`、`null` の場合 `"null"` とする。comparison が `regressed` の場合は末尾に `, comparison=regressed` を追加する。
- [ ] severity は、candidate 内の metric いずれかの `MotionMetricResult.severity` が `"fail"`、または fixture status が `fail` かつ candidate target が `do_not_optimize` ではない場合 `fail`、それ以外は `warn` にする。
- [ ] `requiresHumanLabel` は `constrained_ik_refinement`、`temporal_correction`、`gesture_sequence_classifier`、`anomaly_detector` で `true`、`performance_policy` と `do_not_optimize` で `false` に固定する。
- [ ] `notes` は target ごとに固定する。`constrained_ik_refinement`: `["Review bounded IK refinement before enabling runtime changes."]`、`temporal_correction`: `["Review replay frames before introducing learned temporal correction."]`、`gesture_sequence_classifier`: `["Review gesture labels manually before treating sequence events as intent corrections."]`、`anomaly_detector`: `["Review side assignment and invalid intent frames before automatic rejection."]`、`performance_policy`: `["Performance policy candidates are not learned post-processing targets."]`、`do_not_optimize`: `["No actionable Phase 11 optimization target was identified from available metrics."]`。
- [ ] report `warnings` は skipped fixture ごとに `fixture_skipped:${fixtureId}:${status}` を追加する。fixture errors がある場合は同じ warning の末尾に `:${errors.join("|")}` を付ける。frame scan 対象 metric で range が見つからない場合は `frame_range_not_found:${fixtureId}:${target}` を追加する。
- [ ] `frameRange` は `framesByFixtureId` があり、該当 metric の evidence に frame index を特定できる場合だけ入れる。v1 では `gestureFlickerCount` と `sideSwapCount` だけを frame scan 対象にする。複数 event がある場合は最初に見つかった event の range だけを使う。
- [ ] `gestureFlickerCount` の frame scan は既存 metric と同じ条件に固定する。valid `frame.intent` だけを対象にし、同じ side の previous valid intent が semantic intent かつ `previous.stableDurationMs < 150`、current が `"tracking"` または previous と異なる semantic intent の場合、`frameRange` を `{ startFrameIndex: previous.frameIndex, endFrameIndex: current.frameIndex }` にする。semantic intent は `"wave" | "pointing" | "thumbsUp" | "peace" | "nearFace" | "explain" | "clapLike" | "guarded"` に固定する。
- [ ] `sideSwapCount` の frame scan は、最初に `frame.reliability` が valid `ReliabilityMap` で `warnings`、任意 joint warnings、任意 part warnings のいずれかに `"side_inconsistent"` を含む frame、または valid `frame.intent` の任意 arm warnings に `"left_right_swap_suspect"` を含む frame を対象にし、`frameRange` を `{ startFrameIndex: frame.frameIndex, endFrameIndex: frame.frameIndex }` にする。
- [ ] `MotionDebugApi` に `analyzeOptimizationCandidates(config: MotionDebugQaRegressionConfig)` を追加する。loaded recording 1 件に対して既存 `runQaRegression(config)` を呼び、成功時に `analyzeMotionOptimizationCandidates()` を実行して `{ ok: true; report }` を返す。loaded recording / fixture id 解決失敗は既存 `runQaRegression` と同じ `no_recording_loaded` / `fixture_id_required` を返す。
- [ ] `sincromisor-frontend/src/character/motionPostProcessing/__tests__/motionOptimizationCandidateReport.test.ts` を追加し、IK metrics、temporal metrics、gesture metrics、anomaly metrics、performance metrics、pass fixture 無視、invalid fixture warning、deterministic candidate id / order を検証する。
- [ ] motion-debug API test または viewer model test を更新し、loaded recording から candidate report を取得できること、fixture id 未指定時に `fixture_id_required` になることを検証する。
- [ ] `documents/design/frontend/character/motion.md` に Phase 11 candidate report v1、metric-to-target rule、performance_policy を ML 対象にしない方針、候補抽出が補正適用や学習を行わないことを同期する。

## 設計判断（着手前に確定済み）

- candidate report は `src/character/motionPostProcessing/` に置く。Phase 11 の後処理候補を扱う contract であり、QA runner そのものではないため `motionEvaluation` に閉じない。
- input は `MotionQaRegressionResult` を正本にする。raw log だけから独自判定すると Phase 10 の threshold / baseline comparison とずれるため、QA regression の判定結果を先に使う。
- metric-to-target rule は v1 で固定し、設定可能にしない。最初から user-defined mapping にすると reviewer / evaluator が候補分類の期待値を一意に検証できないため。
- `performance_policy` は Phase 10 degradation の改善対象であり、Phase 11 の learned post-processing 対象にはしない。candidate として残すが `requiresHumanLabel` は false にする。
- candidate report は補正を適用しない。`MotionPostProcessingResult.corrections` を生成するのは後続 classifier / detector / refinement task の責務。
- candidate id は fixture 内 0-based index に固定する。global index 案は QA result の fixture subset 実行で id が変わりやすく、target ごとの index 案は candidate 配列順との対応が分かりにくいため採用しない。
- frame range は最初の event だけを保存する。全 event range を保存する案は v1 schema を重くし、candidate の要約 artifact としての用途を超えるため採用しない。
- 外部境界は motion-debug developer API と replay log だけである。network fetch、LLM、DB、学習 job、外部 telemetry は使わない。

## スコープ境界

- 本タスクでやること:
    - QA regression result から Phase 11 candidate report を作る pure helper。
    - optional frame scan による gesture / side swap の frame range 推定。
    - motion-debug window API 接続。
    - unit test と design doc 同期。
- 本タスクでやらないこと:
    - candidate に基づく自動補正。
    - learned model training / dataset export。
    - threshold の再設計。
    - new metric key の追加。
    - UI panel の作成。
- 依存タスクとの境界:
    - post-processing contract task は保存 slot と no-op processor を追加する。本タスクはその contract を変更せず、候補 report だけを追加する。
    - 後続 constrained IK / sequence classifier task は candidate report を参考にするが、このタスクの helper がそれらの実装を呼び出すことはない。

## 実装方針（既存コード整合: file:line）

- `MotionQaRegressionResult` は fixture ごとに status、summary、comparison、errors を持つ（`sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts:51`、`sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts:60`）。candidate report はこの result を入力にする。
- QA regression は fixture log を parse し、`calculateMotionMetricSummary()` と optional baseline comparison を実行している（`sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts:193`、`sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts:203`、`sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts:230`）。本タスクでは同じ計算を重複実装しない。
- metrics key は `MotionMetricKey` union として固定されている（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:34`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:61`）。classification rule はこの union だけを見る。
- `calculateMotionMetricSummary()` は全 metrics を `Record<MotionMetricKey, MotionMetricResult>` に集約する（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1631`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1636`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1780`）。candidate evidence はここから作る。
- `MotionDebugApi` は developer-only API として QA regression を既に公開している（`sincromisor-frontend/src/pages/motionDebug/types.ts:245`、`sincromisor-frontend/src/pages/motionDebug/types.ts:262`、`sincromisor-frontend/src/pages/motionDebug/types.ts:285`）。新 API はこの隣に additive に追加する。
- `MotionDebugApp.runQaRegression()` は loaded recording 1 件を manifest subset に包んで runner へ渡す（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:513`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:536`）。candidate API はこの結果を再利用する。

## テスト

- `cd sincromisor-frontend && npm run test -- motionOptimizationCandidateReport`
- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な motion-debug optimization candidate API と Phase 11 判断 artifact が増えるため、`documents/design/frontend/character/motion.md` に candidate report v1 と metric-to-target rule を同期する。
