# Review: task-260629225942-production-retarget-composer-motion-metrics-comparison

## 判定

APPROVED

前回 High の 2 点は、現在の `task.md` で metric 値定義 / 集計 / threshold / severity と
`frame.solver.poseRetargetRuntime` parser 方針が受け入れ条件に固定されており、blocking な未確定事項は解消済み。
残る注意点は実装時に既存 snapshot の意味を取り違えないための申し送りで足りる。

## 指摘事項

なし

## 実装者への申し送り

- 前回 High のうち、5 metric の available 時の値定義・summary 集計・unit / direction / threshold は
  `task.md:21`-`task.md:25` で固定済み。summary severity と unavailable reason の扱いも
  `task.md:26`-`task.md:30` で固定されている。
- 前回 High のうち、retarget replay slot / parser 方針は `task.md:19`-`task.md:20` と
  `task.md:43` で `frame.solver.poseRetargetRuntime` 正本、`frame.solver.poseRetarget` 非参照、
  `NEUTRAL_POSE_FRAME` 補完に固定済み。既存 recording は `poseRetarget` と `poseRetargetRuntime` を
  `solver` slot に保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:234`）。
- `poseRetargetRuntime` は `DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"]` で
  `active`、`confidence`、`ikMode`、`fallbackReason`、`solverProbe`、`anchor`、`leftArm`、`rightArm`
  だけを持ち、`upperBody` を持たない（`sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts:80`）。
  task 指定どおり、補完した `upperBody` を angle delta の対象にしないこと。
- 既存の motion-debug `finalPose` layer は `sincro.vrm-pose-composer-result.v1` の full composer result snapshot
  を扱うが、production dry-run result の `status !== "available"` では `result` を持たない contract がある
  （`sincromisor-frontend/src/character/runtime/sincroVrmPoseComposerDryRun.ts:21`）。旧 log / dry-run 欠損を
  暗黙 pass にせず、`not_available` / warn 以上へ落とす条件を優先すること。
- TypeScript production code 変更に対する comment audit schema、対象 symbol / decision、弱い既存コメントや
  stale comment の rewrite / delete 条件は `task.md:33`-`task.md:35` に明記済み。実装時は
  public helper、input / result type、summary schema、threshold / severity、parser、fallback reason を audit
  table で追跡すること。
