# character animation 3.0 phase 7 torso optional fallback distribution

## 背景 / 目的

Phase 7 は、`upperChest` あり / なし、shoulder bone あり / なしの VRM で肩崩れや胸めり込みを抑える必要がある。Phase 6 の `VrmPoseComposer` は腕周辺 bone と missing shoulder fallback だけを扱うため、torso optional bone fallback はまだ明示的な contract になっていない。

このタスクでは、`AvatarMotionProfile.torso.distribution` を使って torso delta を `spine` / `chest` / `upperChest` へ分配する純粋 helper と composer 入力 layer を追加する。本番の head / torso controller 全面移行は後続に残し、motion-debug / test で同じ分配結果を確認できる状態を作る。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/vrmPose/vrmPoseTorsoFallback.ts` を追加し、`createTorsoFallbackLayer(input)` と `resolveTorsoDistribution(profile)` を export する。
- [ ] `resolveTorsoDistribution(profile)` は `profile.torso.distribution` を正本とし、非 finite / 合計 0 / negative 値がある場合は capability から既定分配へ戻し、warning code を返す。
- [ ] 既定分配は `spine + chest + upperChest = 0.25 / 0.40 / 0.35`、`spine + chest = 0.35 / 0.65 / 0`、`spine only = 1 / 0 / 0` に固定する。
- [ ] `createTorsoFallbackLayer()` は input torso delta quaternion を distribution weight で damp し、存在する bone だけを `ownedBones` に含む `VrmPoseLayer` を返す。存在しない `chest` / `upperChest` への pose は出力しない。
- [ ] `VrmPoseLayerKind` に `tracking` torso layer を追加するだけに留め、`composeVrmPose()` の layer order は Phase 6 と同じ `fallback -> tracking -> idle -> style -> limit` のままにする。
- [ ] `composeVrmPose()` は torso bone (`spine` / `chest` / `upperChest`) を supported owned bone として扱える。ただし head / neck / leg / expression は本タスクでは追加しない。
- [ ] `VrmPoseComposerResult.suppressedLayers` は missing torso optional bone を `reason: "missing_optional_bone"` として記録する。出力しない bone がある場合も throw しない。
- [ ] `sincromisor-frontend/src/character/vrmPose/__tests__/vrmPoseTorsoFallback.test.ts` を追加し、3 構成、invalid distribution fallback、missing optional bone suppression、ownedBones ordering を検証する。
- [ ] `documents/design/frontend/character/motion.md` に Phase 7 torso fallback の distribution と、まだ本番 `CharacterMotionTorsoApplier` を置き換えない判断を同期する。

## 設計判断（着手前に確定済み）

- 新規 helper は `src/character/vrmPose/vrmPoseTorsoFallback.ts` に置く。`vrmCharacter/characterMotionTorsoApplier.ts` に直接入れる案は、本番 controller と replay/debug 用 composer contract が混ざるため採用しない。
- torso delta は `VrmPoseQuaternion` の plain quaternion で受ける。Euler angle や raw bone world rotation は採用しない。
- `resolveTorsoDistribution()` の戻り値は次に固定する。

```ts
export type TorsoDistribution = {
    spine: number;
    chest: number;
    upperChest: number;
};

export type TorsoDistributionResult = {
    distribution: TorsoDistribution;
    source: "profile" | "capability_default";
    warnings: string[];
};
```

- invalid distribution fallback の warning code は `invalid_torso_distribution_profile_defaulted` に固定する。合計誤差、negative、非 finite のいずれも同じ code を使い、詳細は debug value に `source: "capability_default"` として表す。
- `createTorsoFallbackLayer()` の input は次に固定する。

```ts
export type TorsoFallbackLayerInput = {
    id: string;
    profile: AvatarMotionProfile;
    delta: VrmPoseQuaternion;
    weight: number;
    kind?: "fallback" | "tracking" | "idle" | "style";
};
```

- `weight <= 0` または非 finite の場合、layer は返すが `weight: 0` とし、composer 側で既存 zero-weight suppression に任せる。
- shoulder missing fallback のように upperArm へ逃がす処理は本タスクでは追加しない。torso delta の分配だけを扱う。

## スコープ境界

- 本タスクでやること:
    - torso distribution helper。
    - composer が `spine` / `chest` / `upperChest` を扱える最小拡張。
    - unit test と設計文書同期。
- 本タスクでやらないこと:
    - 本番 `CharacterMotionTorsoApplier` の置き換え。
    - `vrm.humanoid.setNormalizedPose(finalPose)` への全面移行。
    - head / neck fallback、arm raise assist、collision safety、semantic motion。
    - UI / calibration / replay viewer 表示。
- 依存タスクとの境界:
    - `AvatarMotionProfile` contract が torso distribution と capability を提供する。
    - Phase 6 composer は layer 合成と optional bone suppression の基盤を提供する。

## 実装方針（既存コード整合: file:line）

- `composeVrmPose()` は現在 `fallback -> tracking -> idle -> style` の deterministic order で layer を適用している（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:28`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:41`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:52`）。本タスクでは order を変えない。
- `createPoseWrites()` は optional bone fallback / suppression を centralized に扱っている（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:100`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:112`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:126`）。torso bone もこの policy に乗せる。
- Phase 6 composer result は `finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を返す（`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:41`、`sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts:42`）。本タスクでは result shape を破壊しない。
- three-vrm 調査では torso optional fallback が `spine/chest/upperChest` の構成別分配として示されている（`documents/research/character_animation/answers/05-vrm-three-vrm.md:202`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:207`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:211`）。
- roadmap Phase 7 は `spine + chest + upperChest`、`spine + chest`、`spine only` で分配を変えることを求めている（`documents/research/character_animation/roadmap.md:436`）。

## テスト

- `cd sincromisor-frontend && npm run test -- vrmPoseTorsoFallback`
- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な VRM pose fallback policy を追加するため、`documents/design/frontend/character/motion.md` に torso distribution、対象 bone、未移行範囲を同期する。
