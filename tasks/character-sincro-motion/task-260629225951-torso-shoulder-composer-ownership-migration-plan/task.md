# Plan torso shoulder composer ownership migration

## 背景 / 目的

腕だけ composer 適用しても、肩・胸・spine は `CharacterMotionOrchestrator` / `CharacterMotionTorsoApplier` が直接書いている。roadmap の final pose 集約へ進むには、torso / shoulder の所有権移行計画を先に決める必要がある。

本タスクでは実装ではなく、移行計画と受け入れゲートを設計する。

## 完了条件（受け入れ条件）

- [ ] `artifacts/torso-shoulder-composer-migration-plan.md` を作成し、`spine`、`chest`、`upperChest`、`leftShoulder`、`rightShoulder`、`leftUpperArm`、`rightUpperArm` の現行書き手、移行先、移行順、rollback 条件を記録する。
- [ ] `CharacterMotionTorsoApplier` と `VrmPoseComposer` の責務境界を、`idle`、`tracking`、`fallback`、`semantic`、`style` の layer 単位で定義する。
- [ ] `upperChest` なし、shoulder bone なし、spine only の 3 capability について fallback distribution をどう適用するか記録する。
- [ ] `setNormalizedPose(finalPose)` 全面移行へ進む前の gate として、head / neck / leg / expression の所有境界、motion-debug final pose replay、二重書き込み排除、複数 VRM 検証を明記する。
- [ ] TypeScript production code は変更しない。
- [ ] `documents/design/frontend/character/motion.md` に計画 artifact への導線と、torso / shoulder 移行が腕 flag と別段階であることを同期する。

## 設計判断（着手前に確定済み）

- 本タスクは docs / artifact のみ。torso / shoulder の実装変更はしない。
- `CharacterMotionTorsoApplier` をすぐ削除しない。既存 idle / breathing / AI speech posture の品質を保持するため、まず layer 変換の責務を定義する。
- optional torso distribution は `AvatarMotionProfile.torso.distribution` を正本にする。hard-coded distribution を各 controller に重複させない。

## スコープ境界

- 本タスクでやること: 移行計画、gate、設計同期。
- 本タスクでやらないこと: production code 変更、composer torso layer 実装、`setNormalizedPose()` 全面移行。
- 依存タスクとの境界: ownership map は現状把握。composer dry-run は final pose result の観測。本タスクは torso / shoulder 移行順を決める。

## 実装方針（既存コード整合: file:line）

- `CharacterMotionOrchestrator.update()` は spine / chest / shoulder motion をまとめて適用する（`sincromisor-frontend/src/character/vrmCharacter/characterMotionOrchestrator.ts:38`）。
- `applySpineMotion` / `applyChestMotion` / `applyShoulderMotion` は torso 系 direct write の既存境界である（`sincromisor-frontend/src/character/vrmCharacter/characterMotionOrchestrator.ts:8`）。
- `VrmPoseComposer` は layer order と suppression を持つが、本番適用はまだしない（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:29`）。
- 設計文書は torso applier の置き換えを後続 task に残している（`documents/design/frontend/character/motion.md:173`）。

## テスト

- `npm run tasks:check`
- `npm run tasks:index:check`
- production code を変更しないため frontend build / test は不要。

## ドキュメント同期の要否

要。移行計画そのものが設計判断であり、`documents/design/frontend/character/motion.md` に artifact への導線、移行 gate、腕 flag との責務差を同期する。
