# Review: task-260712033924-temporal-arm-recovery-qa-fixture

## 判定

- APPROVED

決定的な左右 recovery fixture の入力由来、state sequence、frame 数、metric gate、失敗条件、同期対象が検証可能な形で確定している。依存タスクとの責務境界も明示され、現行コードの estimator、metric、fixture ID validation、Phase 6 snapshot への参照と整合する。実装を止める未確定事項は見当たらない。

## Critical / High 指摘

なし。

## 実装者への申し送り

- production estimator は観測欠損直後に即 `lost` へ移らず、既定 `predictionMaxMs: 700` の期間は `predicted` を経由する（`sincromisor-frontend/src/character/temporal/temporalStateEstimator.ts:48`、`sincromisor-frontend/src/character/temporal/temporalArmStateEstimator.ts:104`）。fixture の期待列は canonical 入力の欠損 frame 数ではなく、生成後の temporal state で tracked 10 frame以上、lost 5 frame以上、recovering 2 frame以上、再 tracked 10 frame以上を満たすこと。
- recovery blend は既定 260ms、設定上 180..400ms に clamp される（`sincromisor-frontend/src/character/temporal/temporalStateEstimator.ts:51`、`:152`）。30fps fixture では総 frame 数を最低45に固定せず、production state machineを通して必要な長さを確保すること。
- recovery jump の既存 threshold は pass 8deg / warn 18deg / fail 35deg だが、本タスクの fixture gate は設計判断どおり `<= 18deg` である（`sincromisor-frontend/src/character/motionEvaluation/motionMetricThresholds.ts:85`）。8deg超18deg以下を通常 PASS と誤記せず、既知 WARN として `impl.md` / baselineへ残すこと。
- 依存タスク `task-260705214026-canonical-temporal-arm-solver-production` は現時点で open である。実装時は同タスクが追加する optional Phase 6 `source` の確定形を使用し、lost 時 `pose-snapshot-fallback`、recovering 開始後 `temporal` を fixture の保存済み出力から検証すること。
- TypeScript production code に変更が波及した場合だけ comment audit が必要という境界は明確である。production codeを変更した場合は指定列を満たす audit と実コードのコメント更新を両方行い、fixture/test/docsのみの場合は対象外理由を `impl.md` に記録すること。
