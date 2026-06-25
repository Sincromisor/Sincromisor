# character animation 3.0 phase 6 vrm pose composer

## 背景 / 目的

Phase 6 は `VrmPoseComposer` を追加し、tracking / fallback / semantic / idle / style / limit を 1 つの `VRMPose` へ合成し、同一 frame で複数層が同じ bone を直接上書きしないことを求めている。

現行の本番経路では `HeadBoneController`、`ArmBoneController`、`LegBoneController`、`CharacterMotionOrchestrator` がそれぞれ normalized bone node を更新し、最後に `vrm.update(delta)` を呼ぶ。Phase 6 の理想形へ一度に移行すると blast radius が大きいため、このタスクでは腕 IK / pose retarget を対象にした `VrmPoseComposer` v1 を導入し、final pose の contract と optional bone fallback を固める。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/vrmPose/vrmPoseTypes.ts` を追加し、`VrmNormalizedLocalPose`、`VrmPoseLayer`、`VrmPoseComposerInput`、`VrmPoseComposerResult` を export する。
- [ ] `VrmNormalizedLocalPose` は `Partial<Record<VRMHumanBoneName, { x: number; y: number; z: number; w: number }>>` 相当の plain object とし、`Quaternion` instance は保存しない。
- [ ] `sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts` を追加し、`composeVrmPose(input)` が `fallback -> tracking -> idle -> style -> limit` の deterministic order で合成する。
- [ ] v1 の所有 bone は腕周辺に限定し、`leftUpperArm`、`leftLowerArm`、`leftHand`、`rightUpperArm`、`rightLowerArm`、`rightHand`、存在する場合の shoulder / finger fallback capability を扱う。head / torso / leg / expression は本タスクでは composer へ移さない。
- [ ] `composeVrmPose()` は tracking layer の IK quaternion を優先し、同じ腕で IK active の場合は idle / speech gesture の同 bone additive を weight `0` にする。IK inactive の腕は既存 idle / speech gesture 相当の layer を合成できるようにする。
- [ ] optional bone fallback は `MinimalAvatarMotionProfile.optionalBones` を読み、存在しない `leftHand` / `rightHand` / finger bone への pose を出力しない。存在しない shoulder bone への補正は upperArm へ damping 済みで分配する。
- [ ] final clamp は quaternion normalize と angular velocity clamp hook を持つ。v1 では angular velocity clamp の default limit を `720deg/sec` とし、前 frame が無い場合は clamp しない。
- [ ] `VrmPoseComposerResult` は `finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を持つ。各 item schema と ordering は設計判断の最小 schema に従い、debug / replay 保存に使える plain object / array / number / string に限定する。
- [ ] 本タスクでは `vrm.humanoid.setNormalizedPose(finalPose)` への本番全面切替はしない。接続方針は developer-only path に固定し、`ArmBoneController` の本番 bone 書き込みは変更しない。`SincroPoseRetargeter` または motion-debug 用 helper から同じ input で `composeVrmPose()` を呼べる状態までに留める。
- [ ] `sincromisor-frontend/src/character/vrmPose/__tests__/vrmPoseComposer.test.ts` を追加し、IK active で idle/speech が抑制される、missing hand bone が出力されない、quaternion normalize、angular velocity clamp、ownedBones の重複なしを検証する。
- [ ] `documents/design/frontend/character/motion.md` に `VrmPoseComposer` v1 の対象 bone、全面移行しない判断、`setNormalizedPose` への移行ゲートを同期する。

## 設計判断（着手前に確定済み）

- 新規 module は `src/character/vrmPose/` に置く。`vrmCharacter/` へ置く案は、composer が controller 実装ではなく final normalized pose contract であり、将来 motionDebug / replay / staging clip からも使うため採用しない。
- v1 は腕 pose composer に限定する。head / torso を含む complete upper body pose へ一気に移行する案は、既存 controller の責務が広く実機確認コストが高いため採用しない。
- `VRMHumanBoneName` keyed pose を採用する。raw bone node 参照や glTF node 名 keyed pose は採用しない。
- 合成順は `fallback -> tracking -> idle -> style -> limit` に固定する。ただし tracking が bone を所有している場合、同じ bone の idle / speech additive は suppress する。
- `VrmPoseLayer` / `VrmPoseComposerInput` / `VrmPoseComposerResult` の最小 schema は次に固定する。

```ts
export type VrmPoseLayerKind = "fallback" | "tracking" | "idle" | "style";
export type VrmPoseBlendMode = "override" | "additive";

export type VrmPoseLayer = {
    id: string;
    kind: VrmPoseLayerKind;
    blendMode: VrmPoseBlendMode;
    weight: number;
    pose: VrmNormalizedLocalPose;
    ownedBones: VRMHumanBoneName[];
};

export type VrmPoseComposerInput = {
    layers: VrmPoseLayer[];
    profile: MinimalAvatarMotionProfile;
    previousFinalPose?: VrmNormalizedLocalPose;
    deltaSeconds?: number;
    angularVelocityLimitDegPerSec?: number;
};

export type VrmPoseComposerResult = {
    finalPose: VrmNormalizedLocalPose;
    ownedBones: VRMHumanBoneName[];
    suppressedLayers: Array<{
        id: string;
        kind: VrmPoseLayerKind;
        bone: VRMHumanBoneName;
        reason: "tracking_owns_bone" | "missing_optional_bone" | "zero_weight";
    }>;
    clampedBones: Array<{
        bone: VRMHumanBoneName;
        reason: "quaternion_normalized" | "angular_velocity";
        before?: { x: number; y: number; z: number; w: number };
        after: { x: number; y: number; z: number; w: number };
    }>;
    warnings: string[];
};
```

- `ownedBones` は `VRMHumanBoneName` 値をそのまま保存し、composer order で first-seen unique にする。重複所有は `warnings` に `owned_bone_conflict:<bone>` を追加し、tracking layer を優先する。
- `suppressedLayers` と `clampedBones` は上記 order の配列で返す。object key order へ依存しない。
- angular velocity clamp は `previousFinalPose` と `deltaSeconds` が両方あり、`deltaSeconds > 0` のときだけ実行する。`angularVelocityLimitDegPerSec` 未指定時は `720` を使う。
- `MinimalAvatarMotionProfile` は依存タスク `task-260625231715-character-animation-3-phase-6-minimal-avatar-motion-profile` が `sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts` に追加する型を import する。
- `AnimationMixer` を本番 VRM の主制御器にしない。Phase 9 の semantic clip は pose delta として composer に渡す方針に残す。
- 外部境界は three-vrm normalized pose API である。本タスクでは `setNormalizedPose` を本番で 1 回呼ぶところまでは必須にしないが、result shape はそのまま渡せる形にする。

## スコープ境界

- 本タスクでやること:
    - `VrmNormalizedLocalPose` / layer / composer result の contract。
    - 腕 IK / idle / fallback の deterministic 合成。
    - optional bone fallback と final normalize / angular velocity clamp hook。
    - composer の単体テストと設計文書同期。
- 本タスクでやらないこと:
    - Head / torso / leg controller の composer 移行。
    - 本番経路の `setNormalizedPose(finalPose)` 全面切替。
    - semantic clip、finger curl、MotionIntent。
    - VRM Animation / AnimationMixer staging。
- 依存タスクとの境界:
    - `temporal arm solver bridge` と `arm pole constraints` は tracking layer の solver 入力 / solver result を提供する。
    - `solver debug metrics docs` は composer result を motion-debug / metrics / documentation gate へ接続する。

## 実装方針（既存コード整合: file:line）

- `VRMCharacterManager.update()` は現在 retarget 後に各 controller を更新し、最後に `this.vrm?.update(deltaSeconds)` を呼んでいる（`sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:185`, `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:193`, `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:210`, `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:216`）。本タスクではこの update order を壊さない。
- `ArmBoneController.update()` は pose IK active の腕で speech gesture を抑制し、idle scale を落としてから bone rotation / hand pose を適用している（`sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:31`, `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:35`, `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:45`, `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:48`, `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:65`）。composer v1 はこの suppress policy を contract 化する。
- `SincroPoseRetargetFrame` は IK quaternion を arm field に持つ（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargetFrame.ts:113`, `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetFrame.ts:124`, `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetFrame.ts:125`）。tracking layer はこの quaternion を input にできる。
- roadmap は `VrmPoseComposer` を final pose の唯一の書き手にし、同一 frame で複数層が同じ bone を直接上書きしないことを求めている（`documents/research/character_animation/roadmap.md:417`, `documents/research/character_animation/roadmap.md:424`）。v1 は腕だけでこの制約を満たす。
- three-vrm 層の設計方針は `setNormalizedPose(finalPose)` 後に `vrm.update(delta)` を 1 回呼ぶことである（`documents/research/character_animation/roadmap.md:128`）。本タスクでは result contract を合わせ、全面適用は次タスクへ残す。

## テスト

- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`
- `cd sincromisor-frontend && npm run test -- sincroPoseRetargeter`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、VRM pose 適用の developer-visible な責務境界が変わるため、`documents/design/frontend/character/motion.md` に composer v1 の対象 bone、合成順、owned bone policy、全面切替を後続 task に残す判断を同期する。
