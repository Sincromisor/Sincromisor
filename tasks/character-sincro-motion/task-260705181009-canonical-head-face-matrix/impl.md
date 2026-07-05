# Implementation Log: task-260705181009-canonical-head-face-matrix

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md は APPROVED のため実装した。
- canonical head は `src/character/canonical/` に新規 helper として閉じ、Face tracker 側へ canonical contract の責務を戻さない方針にした。
- `headPose.matrix` は 16 要素かつ全要素 finite の場合だけ通常入力として使い、Face normalizer と同じ回転成分抽出式で yaw / pitch / roll radian に変換した。
- matrix 欠損は `face_matrix_missing` + `min(face.confidence, 0.65)`、matrix invalid は `face_matrix_invalid` + `min(face.confidence, 0.5)` で Euler fallback する。Euler も非 finite の場合は head を省略し、previous head は使っていない。
- Face lost / 未検出 / confidence 0 / head reliability lost or weight `< 0.05` では neutral head を捏造しない。dropout / predicted / recovering は TemporalStateEstimator 側に残した。
- ReliabilityMap は `parts.head.finalWeight` と `joints.head.finalWeight` の両方を読み、`matrixOrEulerConfidence * sqrt(parts.head.finalWeight * joints.head.finalWeight)` で final confidence を計算した。
- `SincroMotionObserveOnlyPipeline.updateDownstream()` は latest Face snapshot を canonical 生成へ渡すだけに留め、Face-only callback で stateful temporal / intent を進めない既存境界は維持した。
- `npm run check` の Markdown step が、対象外の既存 `review.md` 3 件の Prettier 空行不足で失敗したため、worktree 側で Prettier-only formatting を同コミットに含めた。内容変更はない。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期した。
- canonical head は Face matrix 主入力、Euler fallback は低 confidence、Pose nose / ears / eyes fallback は現行 snapshot contract に無いため本 task では扱わないことを明記した。
- WebRTC / backend 契約、compose、env の公開契約変更はないため同期不要。

### TypeScript production comment audit

| path                                                                            | symbol or decision                     | kind                            | current comment                                               | decision | required maintenance knowledge                                                                                                            | action                                                              | reviewer note                                                                                        |
| ------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------- | ------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/canonical/canonicalHeadFeatureExtractor.ts` | `CanonicalHeadFeatureInput`            | public export / boundary        | 新規で既存コメントなし                                        | add      | Face snapshot の低次元値だけを入力にし、MediaPipe raw result や landmark fallback を読まないこと。`previous` は fallback 値ではないこと。 | TSDoc を追加                                                        | 入力型が task.md の限定 field と一致し、previous を使っていないこと。                                |
| `sincromisor-frontend/src/character/canonical/canonicalHeadFeatureExtractor.ts` | `extractCanonicalHeadState()`          | public export / heuristic       | 新規で既存コメントなし                                        | add      | matrix の通常条件、Euler fallback、lost face で neutral を作らない条件、Temporal との責務境界。                                           | TSDoc を追加                                                        | invalid matrix + non-finite Euler で `undefined`、previous 不使用を test で確認。                    |
| `sincromisor-frontend/src/character/canonical/canonicalHeadFeatureExtractor.ts` | matrix validation                      | heuristic                       | 新規で既存コメントなし                                        | add      | MediaPipe transformation matrix のうち回転成分だけを Face normalizer と同じ式で読み、matrix / quaternion は保存しないこと。               | 実装 block comment を追加                                           | 16 要素 finite のみ採用し、非 finite / 長さ不正は fallback へ進むこと。                              |
| `sincromisor-frontend/src/character/canonical/canonicalHeadFeatureExtractor.ts` | Euler fallback confidence clamp        | heuristic / fallback            | 新規で既存コメントなし                                        | keep     | clamp 値は task contract で固定。関数名と定数名で条件が読め、詳細は export TSDoc と tests に分散している。                                | 追加コメントは省略。定数名と focused tests で維持                   | `face_matrix_missing` は 0.65、`face_matrix_invalid` は 0.5 に clamp されること。                    |
| `sincromisor-frontend/src/character/canonical/canonicalHeadFeatureExtractor.ts` | lost face で neutral を捏造しない判断  | boundary / fallback             | 新規で既存コメントなし                                        | add      | canonical layer は状態推定を始めず、Temporal の dropout / predicted と責務を混ぜないこと。                                                | export TSDoc に明記                                                 | source `"lost"`、未検出、confidence 0、reliability lost で head が省略されること。                   |
| `sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts`       | `CANONICAL_WARNING_CODE_VALUES`        | parser / saved contract         | 既存コメントなし                                              | add      | warning enum は replay / motion-debug 保存 contract で、Face matrix 欠損と Pose world 欠損を分ける必要があること。                        | TSDoc を追加し `face_matrix_missing` / `face_matrix_invalid` を追加 | 旧 log の head 欠損や warning 空配列は valid のまま、新 warning code だけが追加されていること。      |
| `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts`  | `CanonicalArmFeatureInput`             | public export / boundary        | 既存コメントなし                                              | add      | Face は optional head 入力、previous は torso / Temporal 向け履歴であり canonical head fallback ではないこと。                            | TSDoc を追加し optional `face` を追加                               | `face` field は low-dimensional snapshot に限定されること。                                          |
| `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts`  | `createCanonicalUpperBodyState()`      | public export / module boundary | 既存コメントなし                                              | add      | JSON 保存可能な canonical contract に限定し、matrix 全体 / quaternion / raw landmark を保存しないこと。head lost 時は省略すること。       | TSDoc を追加し head warnings を top-level へ集約                    | `head.warnings` と top-level `warnings` の重複排除が `pushWarning` で維持されること。                |
| `sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts` | `updateDownstream()` Face to canonical | observe-only boundary           | class / method TSDoc は既存で Face / Pose callback 境界を説明 | keep     | updateFace は latest Face 保存と non-stateful recompute だけに留め、Pose callback だけが temporal / intent memory を進めること。          | 既存コメントで境界を覆うため追加なし                                | `createCanonicalUpperBodyState()` に `this.hasFace ? this.state.face : undefined` を渡すだけの変更。 |
| `sincromisor-frontend/src/pages/motionDebug/motionDebugCanonicalState.ts`       | `MotionDebugCanonicalStateInput.face`  | replay / debug boundary         | module TSDoc は保存可能 slot だけを生成する境界を説明         | keep     | motion-debug recording / replay でも production と同じ Face source / warnings を canonical head に渡せること。                            | 型の Pick を拡張。追加コメントは既存 module TSDoc で十分            | replay 時に raw MediaPipe result を再推定しない既存方針を維持。                                      |

- TODO の追加・変更はなし。
- stale comment は `documents/design/frontend/character/motion.md` の「Face matrix 由来 head reliability は後続」記述を更新した。

### 検証

- `npm run test -- canonicalHead canonicalArmFeature sincroMotionPipelineObserveOnly` PASS
- `npm run check` PASS
- `npm run build` PASS
- `npm run gate` PASS at `5e81e010d9ecc5909e780f29be83ec5ef04dfdfb`

### 残リスク / 逸脱

- build 時の Vite chunk size warning は既存の警告で、今回の変更による gate failure ではない。
- Pose nose / ears / eyes fallback は現行 snapshot に head orientation 入力として存在しないため実装していない。
- Markdown gate のため、worktree 側の別タスク `review.md` 2 件と本タスク `review.md` に Prettier-only formatting が入った。
