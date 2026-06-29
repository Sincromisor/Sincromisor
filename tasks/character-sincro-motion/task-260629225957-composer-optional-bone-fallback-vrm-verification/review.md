# Review: task-260629225957-composer-optional-bone-fallback-vrm-verification

## 判定
APPROVED

High / Critical の blocking finding はない。production runtime を変更しない検証タスクとして、capability class、代替 synthetic profile、artifact、非対象、検証方法が定義されている。

## 指摘事項
- なし

## 実装者への申し送り
- `AvatarMotionProfile` 型は現状 `sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts:62` にあり、task.md の `:48` は型定義行ではない。optional bones は同ファイル `:304` 以降で `MinimalAvatarMotionProfile.optionalBones` へ写される。
- missing shoulder fallback は `missingShoulderFallbackBone()` 後に source shoulder を `missing_optional_bone` として suppress し、fallback bone へ damp した quaternion を書く流れである（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:129` 以降）。artifact では「欠損 bone 自体には final pose を出さない」と「upperArm fallback は出る」を区別すること。

## 最終判断
APPROVED。実装へ進めてよい。
