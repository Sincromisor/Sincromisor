# Connect production sincro motion pipeline observe only

## 背景 / 目的

`ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalUpperBodyState`、`MotionIntentState` は実装済みだが、本番 `sincro` の VRM 更新へは入っていない。いきなり適用すると見た目の回帰や二重書き込みが起きるため、まず live runtime で計算だけ行い、Debug Console / snapshot から観測できる observe-only 接続を作る。

## 完了条件（受け入れ条件）

- [ ] `SincroCharacterMotionEventSink` または近接 module に production observe-only pipeline を接続し、`onFaceMotion` / `onPoseMotion` 受信時に `ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalUpperBodyState`、`MotionIntentState` を更新する。
- [ ] 更新結果は依存タスクの `SincroMotionPipelineState` に保存する。`CharacterBehaviorSnapshot` の shape は変更しない。
- [ ] observe-only state は VRM bone / expression / root position を一切変更しない。`VRMCharacterManager.update()` の controller 呼び出し順序も変更しない。
- [ ] Debug Console へ latest state summary を出す。表示は `available` / `not_computed` / `invalid_input` を区別し、巨大 JSON dump を常時描画しない。
- [ ] `TemporalStateEstimator` と `MotionIntentEstimator` は mode 切替、camera refresh、tracking stop で reset される。
- [ ] 旧 pose-only frame でも `ReliabilityMap` 欠損で throw せず、既存 estimator の fallback に従って `not_computed` または pose-only placeholder とする。
- [ ] production TypeScript comment audit を実施し、新規 public export / lifecycle / fallback / reset decision に必要な TSDoc または限定コメントを追加する。単に「observe-only を更新する」という逐語コメントは不可。
- [ ] observe-only service の追加先は `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` に固定し、`SincroMotionObserveOnlyPipeline`、`SincroMotionObserveOnlyPipelineInput`、`SincroMotionObserveOnlyPipelineUpdateResult`、`reset()`、`updateFace()`、`updatePose()` を export する。
- [ ] `impl.md` に comment audit table を記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、対象は observe-only service public export、reset lifecycle、invalid input fallback、`mediaTimeMs` 採用判断、VRM に適用しない不変条件、Debug Console summary 境界を必ず含める。
- [ ] audit の `decision` は `keep` / `rewrite` / `delete` / `add` に限定する。弱い既存コメント、実装と矛盾した stale comment、名前・型から分かるだけのコメントは `rewrite` または `delete` にする。コメントを省略する場合は省略理由を audit に書く。TODO を追加する場合は理由、削除条件、canonical task ID、判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- observe-only 計算は `app/controller` から呼ぶ薄い runtime service とし、`TrackerRuntime` / Worker には入れない。tracker は観測 snapshot の所有者であり、canonical / temporal / intent は後段責務だから。
- observe-only service は `src/character/runtime/sincroMotionObserveOnlyPipeline.ts` に置く。`app/controller` は service を所有して callback から呼ぶだけにし、canonical / temporal / intent の実装詳細を持たない。
- VRM 適用は絶対に行わない。`composerDryRun` も本タスクでは作らず、後続 dry-run task の責務にする。
- `performance.now()` を estimator 内部の時刻正本にしない。tracker timing がある場合は `mediaTimeMs`、無い場合だけ callback 受信時刻を wrapper 側で明示的に渡す。

## スコープ境界

- 本タスクでやること: live observe-only state 更新、reset lifecycle、Debug Console summary、単体テスト。
- 本タスクでやらないこと: Hand / Face ROI 起動、composer dry-run、VRM 適用、recording baseline 取得。
- 依存タスクとの境界: state contract task は保存先を定義する。本タスクはそこへ live 値を入れるだけ。

## 実装方針（既存コード整合: file:line）

- 本番 sincro tracking は `startSincroFaceTracking()` で `TrackerRuntime.startFaceTracking()` を呼び、`onFaceMotion` / `onPoseMotion` を sink へ渡している（`sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts:243`、`sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts:256`）。
- `SincroCharacterMotionEventSink` は現在 face / pose snapshot を `CharacterBehaviorState` と Debug Console に渡すだけである（`sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts:33`、`sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts:46`）。
- `createPoseReliabilityMap()` は production でも使える pure estimator として実装済みである（`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:56`）。
- `createCanonicalUpperBodyState()` は pose / face から canonical state を作る入口である（`sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:146`）。
- `TemporalStateEstimator` と `MotionIntentEstimator` は stateful estimator として実装済みである（`sincromisor-frontend/src/character/temporal/temporalStateEstimator.ts:56`、`sincromisor-frontend/src/character/motionIntent/motionIntentEstimator.ts:38`）。

## テスト

- `cd sincromisor-frontend && npm run test -- sincroMotionPipeline`
- `cd sincromisor-frontend && npm run test -- temporalStateEstimator`
- `cd sincromisor-frontend && npm run test -- motionIntentEstimator`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開挙動は変えないが developer-visible Debug Console state と production observe-only pipeline を追加するため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に接続境界、未適用であること、reset lifecycle を同期する。
