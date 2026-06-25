# Review: task-260625194536-character-animation-3-phase-5-dropout-prediction-recovery

## 判定

APPROVED

Critical / High の blocking 指摘はない。依存タスクが `TemporalStateEstimator` と contract を用意する前提は明示されており、公開挙動に関わる `documents/design/frontend/character/motion.md` 同期も受け入れ条件に入っているため、実装へ進めてよい。

## 指摘事項

- [Medium] `task.md:15` の comfortable pose 指定にある「左右符号は arm side に合わせる」は、どの値へ適用するかがやや曖昧。現行 canonical の `openness` は `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts:80`-`:83` で左右を正規化した scalar なので、`openness: 0.15` 自体は左右で符号反転しない前提で読むのが自然。body-local wrist / elbow tuple を comfortable pose から補完する場合だけ、x 方向の符号を arm side に合わせる解釈に寄せること。
- [Medium] `task.md:13`-`:15` は既定値では `predictionMaxMs` と `comfortableFallbackAfterMs` がどちらも 700ms で一意に読めるが、config override で両者がずれた場合の優先順位は明文化されていない。実装では既定挙動を正本にし、override の衝突は「prediction window 終了後に comfortable fallback」へ倒すなど、テストで解釈を固定すること。
- [Low] `task.md:19` の head v1 は optional 範囲として妥当だが、arm と比べると専用の unit test 条件が薄い。canonical head が存在する fixture を自然に作れる場合は、yaw / pitch / roll が同じ dropout / recovery policy を通る最小テストを追加すると後続 Phase 8 との境界が読みやすい。

## 実装者への申し送り

- 依存タスク `task-260625194536-character-animation-3-phase-5-temporal-state-estimator-filte` が `src/character/temporal/temporalStateEstimator.ts` と `TemporalArmState.velocity` / `recoveringBlend` を用意する前提で進めること。現ワークツリー単体では temporal 実装ファイルはまだ存在しないため、依存解決後の shape に合わせて着手する。
- warnings / source は `TemporalUpperBodyState` contract 側の `prediction_active`、`velocity_damped`、`recovery_blend`、`comfortable`、`mixed` を使い、canonical warning / source enum と混同しないこと。
- `predictionVelocityDampingPerSec` は per-second damping として扱い、frame `dt` に依存した減衰になるよう unit test で固定すること。
- `motion-debug` live / replay 接続は本タスクの範囲外。受け入れ条件どおり estimator の unit test、frontend build、`tasks:check`、`documents/design/frontend/character/motion.md` 同期に閉じること。
