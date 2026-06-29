# Compare production retarget and composer motion metrics

## 背景 / 目的

composer dry-run が入っても、それが旧 `SincroPoseRetargeter` 経路より良いか悪いかを数値で比較できなければ実適用へ進めない。本タスクでは baseline replay と dry-run result を使い、旧 retarget applied 相当と composer final pose の差分を metrics 化する。

## 完了条件（受け入れ条件）

- [ ] `motionEvaluation` 配下に旧 retarget frame と composer dry-run result を比較する helper を追加し、metric key は `composerAngleDeltaDeg`、`composerAngularVelocitySpike`、`composerOwnedBoneConflictCount`、`composerSuppressionCount`、`composerMissingPoseFrameCount` に固定する。
- [ ] helper の追加先は `sincromisor-frontend/src/character/motionEvaluation/motionComposerComparisonMetrics.ts` に固定し、`calculateComposerComparisonMetrics(input)`、`ComposerComparisonMetricFrameInput`、`ComposerComparisonMetricFrameResult` を export する。既存 facade `motionMetrics.ts` から必要な型 / helper を re-export する。
- [ ] `ComposerComparisonMetricFrameInput` は `{ mediaTimeMs: number; retarget?: SincroPoseRetargetFrame; composerDryRun?: SincroVrmPoseComposerDryRunResult }` に固定し、VRM Object3D / `THREE.Quaternion` instance を含めない。
- [ ] comparison input は replay frame / live snapshot の plain object に限定し、VRM Object3D や `THREE.Quaternion` instance を保存境界に出さない。
- [ ] baseline artifact の 6 fixture について、旧経路と composer dry-run の comparison summary を生成できる。
- [ ] composer dry-run が無い旧 log では `not_available` として warn 以上にし、暗黙に pass にしない。
- [ ] comparison は実適用の合否を自動決定しない。結果は feature flag 適用タスクの判断材料として artifact / Debug Console に出す。
- [ ] production TypeScript comment audit を実施し、metric key の意味、`not_available` の扱い、保存境界の制約を public helper / threshold 近傍に記録する。
- [ ] `impl.md` に comment audit table を記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、対象は `calculateComposerComparisonMetrics()`、input / result type、各 metric key、`not_available` を pass にしない判断、dry-run 欠損 fallback、facade re-export を必ず含める。
- [ ] audit の `decision` は `keep` / `rewrite` / `delete` / `add` に限定する。弱い既存コメント、実装と矛盾した stale comment、名前・型から分かるだけのコメントは `rewrite` または `delete` にする。コメントを省略する場合は省略理由を audit に書く。TODO を追加する場合は理由、削除条件、canonical task ID、判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- 既存 `motionMetrics` に新 metric group を追加する。別 harness を作る案は、QA regression と baseline comparison の経路が分裂するため採用しない。
- metric 計算本体は `motionComposerComparisonMetrics.ts` に分け、`motionMetrics.ts` は facade re-export に留める。巨大 facade に直接実装する案は責務が膨らみやすいため採用しない。
- `not_available` は pass ではなく warn 以上にする。composer dry-run 欠損を見落とすと実適用判断を誤るため。
- 本タスクは比較までで、feature flag を有効にする判断はしない。

## スコープ境界

- 本タスクでやること: metric helper、summary / comparison、fixture 実行手順、artifact 更新。
- 本タスクでやらないこと: composer 適用、dry-run 実装、baseline recording 取得、閾値の大幅調整。
- 依存タスクとの境界: baseline task は入力ログを用意する。dry-run task は composer result を用意する。本タスクは比較だけを行う。

## 実装方針（既存コード整合: file:line）

- `motionMetrics.ts` は metrics 外部 import 互換 facade として使われている（`documents/design/frontend/character/motion.md:140`）。
- `VrmPoseComposerResult` は `finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を持つ（`sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts:43`）。
- `motion-debug` viewer は finalPose layer を `frame.finalPose` として扱う設計である（`documents/design/frontend/character/motion.md:137`）。

## テスト

- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible metrics が増えるため、`documents/design/frontend/character/motion.md` の metrics / motion-debug 節に comparison metric の意味、`not_available` の扱い、feature flag 判断材料であることを同期する。
