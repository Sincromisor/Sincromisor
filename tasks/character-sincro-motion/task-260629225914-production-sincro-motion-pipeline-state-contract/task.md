# Define production sincro motion pipeline state contract

## 背景 / 目的

現行 `CharacterBehaviorSnapshot` が本番 VRM 更新へ渡す motion 入力は `faceMotion` と `poseMotion` に限定されている。roadmap で整備済みの `ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalUpperBodyState`、`MotionIntentState`、Hand snapshot を本番で observe-only / dry-run するには、既存 snapshot を肥大化させるか、別 contract として保持するかを先に確定する必要がある。

本タスクでは、本番 `sincro` runtime で使う低次元 motion pipeline state の型と所有境界を定義する。まだ VRM への適用はしない。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/runtime/sincroMotionPipelineState.ts` を追加し、`SincroMotionPipelineState`、`SincroMotionPipelineInputSnapshot`、`createDefaultSincroMotionPipelineState()`、`cloneSincroMotionPipelineState()` を export する。
- [ ] `SincroMotionPipelineState` は `face`、`pose`、optional `hand`、optional `reliability`、optional `canonical`、optional `temporal`、optional `intent`、optional `composerDryRun`、`updatedAtMs` を持つ plain object に固定する。`THREE.*` instance、MediaPipe raw result、DOM / MediaStream / VideoFrame は含めない。
- [ ] `CharacterBehaviorSnapshot` へ直接 `canonical` / `temporal` / `intent` を追加しない。既存 controller の入力契約を広げる案は、旧経路と新経路の責務が混ざるため採用しない。
- [ ] `CharacterBehaviorState` にはこのタスクでは接続しない。接続は後続 observe-only タスクに残す。
- [ ] state clone は保存済み snapshot を shallow reuse せず、配列 / warning / tuple を後続変更から保護する。既存各 snapshot の clone helper がある場合はそれを使う。
- [ ] parser / schemaVersion は本タスクでは追加しない。これは runtime 内部 state であり replay log の保存 contract ではないため。保存境界へ出す場合は既存 `motionDebugLogSchema` 側の slot を使う。
- [ ] production TypeScript comment audit を実施し、追加する public export について目的、入力境界、observable output、失敗条件、非対象を TSDoc または module TSDoc で記録する。名前・型だけで分かる逐語コメントは追加しない。
- [ ] `impl.md` に comment audit table を記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、対象は `SincroMotionPipelineState`、`SincroMotionPipelineInputSnapshot`、`createDefaultSincroMotionPipelineState()`、`cloneSincroMotionPipelineState()`、schemaVersion を持たない判断、`CharacterBehaviorSnapshot` へ追加しない判断を必ず含める。
- [ ] audit の `decision` は `keep` / `rewrite` / `delete` / `add` に限定する。module TSDoc へ集約する場合は、各 public export の入力境界、observable output、失敗条件、副作用、非対象を具体的に覆うことを `reviewer note` に記録する。
- [ ] 弱い既存コメント、実装と矛盾した stale comment、名前・型から分かるだけのコメントは `rewrite` または `delete` にする。コメントを省略する場合は、省略理由を audit に書く。TODO を追加する場合は理由、削除条件、canonical task ID、判断基準を本文に含める。

## 設計判断（着手前に確定済み）

- 新規 module は `src/character/runtime/` に置く。`app/controller` に置く案は tracker / debug / scene から共有しにくく、`character/behavior` に入れる案は既存 `CharacterBehaviorSnapshot` の責務を広げるため採用しない。
- `CharacterBehaviorSnapshot` は既存通り face / pose / VAD / AI speech の集約点として維持する。新 pipeline state は本番 motion pipeline の observe-only / dry-run 専用 state とする。
- `composerDryRun` は `VrmPoseComposerResult` 相当の optional slot とするが、実際の dry-run 計算は後続タスクで行う。

## スコープ境界

- 本タスクでやること: state 型、clone/default helper、コメント品質条件、設計文書同期。
- 本タスクでやらないこと: TrackerRuntime への接続、Hand / ROI 起動、canonical / temporal / intent 計算、VRM 適用。
- 依存タスクとの境界: ownership map は既存書き手を整理する。本タスクはその map を前提に新 state の置き場所だけを定義する。

## 実装方針（既存コード整合: file:line）

- `CharacterBehaviorSnapshot` は現在 `faceMotion` と `poseMotion` だけを持つ（`sincromisor-frontend/src/character/behavior/characterBehaviorTypes.ts:84`）。
- `SincroCharacterMotionEventSink` は tracker callback から `CharacterBehaviorState.applyFaceMotion()` / `applyPoseMotion()` だけを呼ぶ（`sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts:33`、`sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts:46`）。
- `motion-debug` では canonical / reliability / temporal / intent が既に別 slot として扱われている（`documents/design/frontend/character/motion.md:223`、`documents/design/frontend/character/motion.md:241`）。
- `VrmPoseComposerResult` は plain object result として実装済みである（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:48`）。

## テスト

- `cd sincromisor-frontend && npm run test -- sincroMotionPipelineState`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。内部 runtime contract だが本番組み込みの責務境界を増やすため、`documents/design/frontend/character/motion.md` に `SincroMotionPipelineState` の所在、`CharacterBehaviorSnapshot` と分ける判断、まだ適用しない境界を同期する。
