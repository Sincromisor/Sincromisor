# Review: task-260626014918-character-animation-3-phase-7-torso-optional-fallback-distri

## 判定

APPROVED

再レビュー範囲は warning code 固定の改訂確認に限定しました。前回 Medium の「warning code 未固定」は `task.md:41` で解消されており、依存タスクの `torso.distribution` 値域（合計 `1.0 ± 0.001`）および既存 `warnings: string[]` contract と矛盾しないため、Blocking となる Critical / High はありません。

## 指摘事項

- [Low] （前回から継続）`VrmPoseLayerKind` には既に `"tracking"` が存在し、`limit` は layer kind ではなく composer 内部の final clamp stage です（`task.md:15`, `sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts:13`, `sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:28`）。新しい kind を増やす意図ではなく、torso layer が既存 kind の `"tracking"` も取れるようにする意味として扱うのが妥当です。

## 実装者への申し送り

- invalid distribution fallback の warning code は `invalid_torso_distribution_profile_defaulted` に固定済みです。合計誤差、negative、非 finite のいずれもこの 1 code とし、詳細分岐用の別 code は増やさないでください。
- `AvatarMotionProfile` は依存タスク `task-260626014911-character-animation-3-phase-7-avatar-motion-profile-contract` の `src/character/avatarProfile/avatarMotionProfile.ts` から import する前提です。依存タスク完了後の実 export 名と schema を先に確認してください。
- default distribution は依存タスクの capability から `spine + chest + upperChest` / `spine + chest` / `spine only` を決定し、`spine`, `chest`, `upperChest` の順で `ownedBones` が安定するようにしてください。
- `composeVrmPose()` の順序は現状どおり `fallback -> tracking -> idle -> style` を維持し、angular velocity / normalization は既存 final clamp stage に任せてください。`VrmPoseComposerResult` の shape は破壊しない方針です。
- `documents/design/frontend/character/motion.md` には、torso fallback distribution だけでなく、本番 `CharacterMotionTorsoApplier` 置き換えと `vrm.humanoid.setNormalizedPose(finalPose)` 全面移行を後続に残す判断も同期してください。
