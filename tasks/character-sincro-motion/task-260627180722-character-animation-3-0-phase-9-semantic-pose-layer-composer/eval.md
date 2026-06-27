# Evaluation: task-260627180722-character-animation-3-0-phase-9-semantic-pose-layer-composer

## 判定

PASS

実装 commit `3be817127a4b8c63e34244465f871e755e5d25dc` を指定評価 worktreeで確認した。受け入れ条件、review.md の申し送り、gate、ドキュメント同期に blocking な不一致はない。

## 受け入れ条件チェックリスト

- [✓] 依存 `MotionIntentState` / estimator が HEAD に存在する — `sincromisor-frontend/src/character/motionIntent/motionIntentState.ts` と `motionIntentEstimator.ts` が存在し、semantic layer は `MotionIntentState` を import している。
- [✓] `semanticMotionPoseLayer.ts` と要求 export を追加 — `createSemanticMotionPoseLayer()`、`SemanticMotionPoseLayerInput`、`SemanticMotionPosePresetId`、`SemanticMotionPoseLayerDebugSnapshot`、`SemanticMotionPoseLayerResult` を export 済み。
- [✓] `semantic` kind と composer order を追加 — `VrmPoseLayerKind` は `"semantic"` を含み、`LAYER_ORDER` は `fallback -> tracking -> semantic -> idle -> style` に固定されている。
- [✓] `VrmPoseLayer.metadata` を optional 追加し、composer は semantic confidence だけを読む — `shouldSuppressSemanticConflict()` は `metadata?.semantic?.intentConfidence ?? 0` と固定 `0.65` のみを参照し、`conflictSuppressionThreshold` は判定に使っていない。
- [✓] `semantic_conflict` suppression を追加 — tracking が同じ upperArm / lowerArm / hand bone を所有し、semantic confidence `< 0.65` の場合に bone 単位で suppress する。metadata なし semantic は confidence `0` として扱う。
- [✓] semantic helper の入力境界を限定 — `SemanticMotionPoseLayerInput` は `MotionIntentState`、`AvatarMotionProfile`、optional previous snapshot、optional `deltaSeconds` のみで、Temporal / Hand / raw gesture / MediaPipe raw landmark は import していない。
- [✓] return shape と no-op debug snapshot を固定 — no-op でも `layers: []` と `schemaVersion: "sincro.phase9-semantic-motion.v1"` の debug snapshot を返す。tracking / guarded / 片側 clapLike は unit test で確認されている。
- [✓] semantic preset id を v1 固定 — `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`soft_clap_like`、`lost_to_comfort` のみを型 const にしている。debug には preset id のみを保存し、clip 名や asset path は保存していない。
- [✓] intent -> preset mapping を固定 — switch で task.md 指定どおりに mapping し、`tracking` / `guarded` / 片側 `clapLike` は no-op、両手 `clapLike` だけ `side: "both"` の `soft_clap_like` 1 layer になる。
- [✓] layer weight を part 別に保持 — debug snapshot は `arm` / `wrist` / `fingers` / `layer` を持ち、layer weight は max part weight を `0..1` clamp した値になっている。
- [✓] side ごとの layer 数と layer id を固定 — 片腕 semantic は side ごと最大 1 layer、id は `semantic:<side>:<presetId>`。両手 `clapLike` は左右単独 layer より優先し、metadata の `intentConfidence` は左右 confidence の小さい方。
- [✓] semantic pose の所有範囲を腕に限定 — pose / ownedBones は `leftUpperArm` / `leftLowerArm` / `leftHand` と右側同等だけで、spine / chest / head / expression / finger chain は v1 で触らない。
- [✓] wave / hold pose / comfort pose の範囲を維持 — `wave` は additive の小さな arm arc、hold pose は partial override、`lost` / `fallback` は `semantic` kind の `lost_to_comfort` で torso を上書きしない。
- [✓] composer 既存規則を維持 — semantic も `createPoseWrites()` と final clamp stage を通るため、zero weight、missing optional bone、quaternion normalize、angular velocity clamp は既存 layer と同じ規則で働く。
- [✓] 実装者テストを追加 / 更新 — `semanticMotionPoseLayer.test.ts`、`vrmPoseComposer.test.ts`、`vrmPoseComposerSemantic.test.ts` で semantic order、tracking conflict suppression、zero weight、missing optional hand bone、wave の torso 非所有、lost_to_comfort の full body 非上書きを検証している。
- [✓] docs 同期 — `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に semantic layer、preset id、partial override、AnimationMixer staging 方針が同期されている。
- [✓] 別タスク `eval.md` の混入確認 — `task-260627180718.../eval.md` の差分は Markdown heading 後の blank line 追加のみで、運用データや判定内容の変更はない。Markdown gate 修正として許容範囲。

## テスト結果

- `npm run gate`（cwd: `/private/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-3be817127a4b-PkBBWF`）: PASS。commit `3be8171` clean、3 step すべて cache hit。
- `gate:lint`: PASS / CACHE HIT。frontend lint/format and Markdown check。
- `gate:build`: PASS / CACHE HIT。frontend type check and build。既存の chunk size warning のみ。
- `gate:test`: PASS / CACHE HIT。`317 passed (317)`。
- 追加確認: `git diff --check 3be8171^ 3be8171` は指摘なし。
- カバレッジ評価: task.md が指定した semantic helper / composer の主要分岐は unit test で覆われている。全 preset mapping はコードの switch と型 const を読み取りで照合し、既存テストの抜けが合否を左右するほどの未検証リスクには見えない。

## ドキュメント整合性

- 公開 WebRTC / backend / compose / env 契約の変更はなし。
- developer-visible な `VrmPoseLayerKind`、composer order、semantic preset / partial override contract は変更されており、対応ドキュメント `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` は同一 commit で同期済み。
- 生成物や配布物の再生成対象は確認範囲に見当たらない。

## 残課題（FAIL の場合）

- なし。
