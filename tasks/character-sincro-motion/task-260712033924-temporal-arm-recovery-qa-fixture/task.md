# Add deterministic temporal arm recovery QA fixture

<!--
  起票の入口は /new-task（起票 + 独立レビューを一括）。既存 task.md を後から再レビューする
  場合は /review-task <task-dir> を使う。いずれも APPROVED を得てから /run-task に渡す。
  各節は tasks/AUTHORING-CHECKLIST.md（task-reviewer 評価観点の正本）に対応する。
  初回 NEEDS_REVISION の最頻出根拠は「設計判断の未確定」と「ドキュメント同期要否の未記載」。
-->

## 背景 / 目的

`task-260705214026-canonical-temporal-arm-solver-production` の通常動作6 fixtureでは `recovering` sampleが一度も発生せず、recovery jumpが比較不能だった。通常動作中の偶発的なtracking lossへ依存する限り、同じ未評価状態が再発する。

本タスクでは左右それぞれに決定的な `tracked → lost → recovering → tracked` を発生させるQA fixtureを追加し、temporal recoveryとproduction solver出力のjumpを再現可能に評価する。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] P0 fixture IDへ `left-arm-occlusion-recovery` と `right-arm-occlusion-recovery` を追加し、`MotionP0FixtureId`、manifest parser、baseline schema、viewer/APIのfixture選択を同期する。未知IDは従来どおりvalidation errorにする。
- [ ] fixtureはrepository内のdeterministic motion-debug NDJSONとして `sincromisor-frontend/src/character/motionEvaluation/fixtures/` に置く。各fixtureは30fps相当、最低45 frameとし、対象腕について tracked 10 frame以上、lost 5 frame以上、recovering 2 frame以上、再tracked 10 frame以上をこの順で含む。非対象腕は全frame trackedとする。
- [ ] fixture frameはcanonical/reliability入力から `TemporalStateEstimator` とproduction temporal arm input providerを実行して生成可能な入力を持ち、保存済み `frame.temporal` のstateだけを手書きして通過させない。generatorはtest helperとして同fixture directory配下に置き、同一入力からbyte-identical NDJSONを再生成できる。
- [ ] `calculateMotionMetrics()` で `temporalRecoveringArmFrameCount >= 2`、`temporalMaxRecoveryJumpDegEquivalent` と `recoveryJumpAngleDeg` が `available` になる。両fixtureで recovery jump `<= 18deg`、solver elbow flip reject `<= 2`、final pose angular velocity clamp `<= 3`、owned bone conflict `0`を満たす。
- [ ] fixtureのmanifest/frame timestampは単調増加し、欠落・重複・非finite値を含まない。対象armがlost中にtemporal primaryを返さず、Pose fallbackへ落ち、recovering開始後はtemporal primaryへ復帰することをPhase 6 `source`で確認する。
- [ ] fixture生成、parser、metrics、QA regression manifestのfocused testsを追加し、fixtureを削除・短縮してrecovering sampleが0になるとtestがFAILする。
- [ ] `documents/design/frontend/character/motion.md`、`tracking.md`、production baseline manifestへfixture protocol、期待state sequence、metric gateを同期する。
- [ ] TypeScript production codeを変更する場合だけ、指定列のcomment auditを `impl.md` に記録し、recovery state transition、fixture boundary、旧manifest互換に必要なTSDoc/JSDocを実コードで更新する。fixture/test/docsのみならproduction comment audit対象外である理由を記録する。

## 設計判断（着手前に確定済み）

- cameraの偶発occlusionではなくrepository内deterministic fixtureを正本にする。CIと独立評価で必ずrecoveryを再現するためである。
- syntheticなstate完成値を直接並べず、canonical/reliabilityの欠損・復帰系列からproduction estimatorを通す。state machineの破壊を検出できないfixtureを避けるためである。
- recoveryのpass gateは既存thresholdのwarn上限 `18deg` とする。現行pass `8deg`を初回必須にするとfixture追加とsolver tuningが再び混ざるため、18deg超をFAIL、8deg超18deg以下を既知WARNとして記録する。
- 既存6 P0 IDは変更・別名化しない。2 IDの追加により旧manifestは引き続きparseできるが、full suiteでは新fixture欠損を明示的にFAILとする。

## スコープ境界

- 本タスク: deterministic recovery入力、ID/schema、generator、metrics gate、baseline/docs。
- 依存タスク: temporal primary/fallback source snapshotとproduction input providerを提供する。
- スコープ外: `arms-cross` reach/clamp改善、通常6 fixtureの再収録、temporal state machineの閾値チューニング、Pose fallback削除、backend/WebRTC変更。

## 実装方針（既存コード整合: file:line）

- `temporalStateEstimator.ts:44-51` はlost thresholdと既定260ms recovery blendを持ち、`:152`でblendを180..400msへclampする。fixture timingはこのproduction設定を使う。
- `temporalArmStateEstimator.ts:94-104` はlost/recovery遷移入口、`temporalArmDropout.ts:89-126` はrecovering blend進行を実装する。fixtureはこれらを迂回しない。
- `motionMetricTemporalCalculators.ts:105-120` は連続recovering sampleが無い場合jumpをnot_availableにする。focused testでavailable経路を固定する。
- `motionQaRegressionManifest.ts:33-111` と `motionMetricBaselineSchema.ts:193-209` は固定P0 IDをvalidationするため、新2 IDを同じ正本enumから受理させる。
- `motionDebugPhase6Snapshot.ts:21-46` はtemporal stateとsourceを保存する。lost時fallback/recovering時temporal復帰のassertに使う。

## テスト

- generator deterministic test、左右sequence test、timestamp/schema test、production estimator/provider integration test、metrics available/threshold test、full QA manifest testを追加する。
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run test`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visibleなP0 fixture ID、QA manifest、recovery gateを変えるため、`documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md`を同期する。公開WebRTC/backend契約は変更しない。
