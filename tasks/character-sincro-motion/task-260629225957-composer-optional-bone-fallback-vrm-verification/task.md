# Verify composer optional bone fallback across VRM models

## 背景 / 目的

roadmap は VRM 個体差を例外扱いせず、profile と fallback で扱うことを要求している。composer dry-run / arm application の前に、`upperChest` あり/なし、shoulder あり/なし、finger chain 欠損を持つ複数 VRM で fallback が破綻しないことを確認する。

## 完了条件（受け入れ条件）

- [ ] `artifacts/optional-bone-fallback-vrm-verification.md` を作成し、検証した VRM profile、optional bone capability、dry-run result、warnings、スクリーンショット有無、残リスクを記録する。
- [ ] 最低 3 capability class を検証する: full upper body、missing upperChest、missing shoulder または reduced finger chain。実モデルが無い場合は test double / synthetic profile で代替し、その旨を明記する。
- [ ] `composeVrmPose()` が missing optional bone へ final pose を出さず、`suppressedLayers.reason = "missing_optional_bone"` を返すことを確認する。
- [ ] missing shoulder fallback が upperArm へ damping される場合、適用対象と warning が artifact で追えることを確認する。
- [ ] 本タスクでは VRM model asset を新規追加しない。既存 asset / local manual model / synthetic profile で検証する。
- [ ] production TypeScript code は原則変更しない。test double が不足する場合のみ test / fixture helper の追加を許可し、production runtime は変えない。

## 設計判断（着手前に確定済み）

- 検証 artifact を正本にし、VRM 実ファイルは repository に追加しない。ライセンス / サイズ / 個人モデル混入のリスクを避けるため。
- 実モデルが揃わない capability は synthetic profile と unit test で補う。実機検証できなかった点は残リスクとして明記する。
- fallback 判定は `MinimalAvatarMotionProfile.optionalBones` と `AvatarMotionProfile.capabilities` を正本にする。

## スコープ境界

- 本タスクでやること: optional bone fallback の検証 artifact、必要な test helper、設計への検証結果追記。
- 本タスクでやらないこと: fallback algorithm の大幅変更、VRM asset 追加、production 適用 flag 変更。
- 依存タスクとの境界: composer dry-run task が live result を出す。本タスクは複数 capability でその result を検証する。

## 実装方針（既存コード整合: file:line）

- `AvatarMotionProfile` は optional bones と finger chains を持つ（`sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:48`）。
- `composeVrmPose()` は `input.profile.optionalBones` を読んで write を作る（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:79`）。
- missing shoulder fallback は `missingShoulderFallbackBone()` 経由で扱われる（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:129`）。
- roadmap Phase 6 は `upperChest` なし、shoulder bone なし、finger bone 一部欠落の VRM でも fallback することを完了条件にしている（`documents/research/character_animation/roadmap.md:425`）。

## テスト

- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`
- `cd sincromisor-frontend && npm run test -- avatarMotionProfile`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。検証結果は今後の本番適用 gate になるため、`documents/design/frontend/character/motion.md` に artifact への導線と検証済み capability / 未検証リスクを同期する。
