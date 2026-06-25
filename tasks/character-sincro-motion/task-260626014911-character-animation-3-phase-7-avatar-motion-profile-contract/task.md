# character animation 3.0 phase 7 avatar motion profile contract

## 背景 / 目的

character-animation-3.0 Phase 7 は、VRM モデル差分を例外処理ではなく profile として扱う段階である。Phase 6 では `MinimalAvatarMotionProfile` が導入され、optional bone、腕長、肩幅、solver default を観測できるようになった。

このタスクでは Phase 6 の minimal profile を壊さず、完成版 `AvatarMotionProfile` v1 の保存 contract、測定値、既定値、互換変換を固定する。solver / composer への本格適用、calibration、UI は後続タスクに分ける。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts` を追加し、`AVATAR_MOTION_PROFILE_SCHEMA_VERSION = "sincro.avatar-motion-profile.v1"`、`AvatarMotionProfile`、`AvatarMotionProfileParseResult`、`createAvatarMotionProfile()`、`cloneAvatarMotionProfile()`、`parseAvatarMotionProfile()`、`toMinimalAvatarMotionProfile()` を export する。
- [ ] `AvatarMotionProfile` は JSON 保存可能な plain object とし、`Object3D`、`VRM` instance、`THREE.Vector3`、`THREE.Quaternion`、function、class instance、`NaN` / `Infinity` を含めない。
- [ ] `createAvatarMotionProfile(vrm)` は `vrm.scene.updateMatrixWorld(true)` 後、`vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName)` だけを使って optional bone capability、rest local rotation、bone length、shoulder width、torso length、head size、hand size を測定する。glTF node 名検索は使わない。
- [ ] 測定不能値は `undefined` にし、warning code を `warnings` に重複なく残す。測定不能でも throw せず、profile 全体は作成できる。
- [ ] `toMinimalAvatarMotionProfile(profile)` は Phase 6 の `MinimalAvatarMotionProfile` と同じ shape を返し、既存 bridge / composer が依存する `optionalBones`、`measurements`、`solverDefaults`、`warnings` を維持する。
- [ ] `SincroPoseRetargeter.attachVrm()` は `createAvatarMotionProfile(vrm)` を作成し、`getAvatarMotionProfile()` は clone 済みの `AvatarMotionProfile` を返す。既存 Phase 6 の呼び出し元が minimal profile を必要とする箇所では `toMinimalAvatarMotionProfile()` を明示して使う。
- [ ] parser は未知 `schemaVersion` を `unknown_schema_version`、構造違反を `invalid_state`、値域違反を `out_of_range` として返す。例外 throw で replay/viewer を落とさない。
- [ ] `parseAvatarMotionProfile()` の返り値は `{ ok: true; profile: AvatarMotionProfile } | { ok: false; errors: AvatarMotionProfileParseError[] }` に固定する。`AvatarMotionProfileParseError` は `{ code: "unknown_schema_version" | "invalid_state" | "out_of_range"; path: string[]; message: string }` とする。
- [ ] `cloneAvatarMotionProfile()` は nested object / tuple / array を deep clone し、返却後に caller が `profile.metrics.upperArmLength.left`、`profile.restLocalRotation.leftUpperArm[0]`、`profile.warnings` を変更しても保持 profile が変わらない。
- [ ] `toMinimalAvatarMotionProfile(profile)` の `solverDefaults` は Phase 6 互換値ではなく完成版 profile 値から写す。`defaultReachScale = profile.arm.reachScale`、`depthCompression = profile.arm.depthCompression`、`lateralScale = profile.arm.lateralScale`、`verticalScale = profile.arm.verticalScale`、`shoulderDamping = profile.arm.shoulderDamping`、`wristRollInfluence = profile.wrist.wristRollInfluence` とする。
- [ ] `sincromisor-frontend/src/character/avatarProfile/__tests__/avatarMotionProfile.test.ts` を追加し、complete rig、`upperChest` 欠損、shoulder 欠損、finger chain 欠損、非 finite 値、unknown enum、extra key、minimal 変換を検証する。
- [ ] `documents/design/frontend/character/motion.md` に `AvatarMotionProfile` v1 の schema、`MinimalAvatarMotionProfile` との関係、online calibration で変更してはいけない avatar 構造値を同期する。

## 設計判断（着手前に確定済み）

- 新規 module は `src/character/avatarProfile/avatarMotionProfile.ts` に置く。既存 `minimalAvatarMotionProfile.ts` を直接巨大化する案は、Phase 6 の完了済み contract と debug schema を不必要に揺らすため採用しない。
- schema version は `sincro.avatar-motion-profile.v1` に固定する。Phase 6 の `sincro.minimal-avatar-motion-profile.v1` は互換出力として残す。
- rest local rotation は `{ x: number; y: number; z: number; w: number }` ではなく `[number, number, number, number]` tuple で保存する。reason: replay/debug で compact に扱え、runtime object と区別しやすい。不採用案の `Quaternion` instance 保存は JSON contract を壊す。
- optional bone capability は Phase 7 用に `spine`、`chest`、`upperChest`、`neck`、`head`、左右 shoulder / hand、左右 5 指の proximal / intermediate / distal まで持つ。Phase 6 minimal へ変換するときは既存 key だけへ落とす。
- 最小 schema は次に固定する。

```ts
export type AvatarMotionProfile = {
    schemaVersion: "sincro.avatar-motion-profile.v1";
    model: {
        vrmVersion: "1.0" | "unknown";
        modelName?: string;
    };
    capabilities: {
        bones: Partial<Record<VRMHumanBoneName, boolean>>;
        fingerChains: Record<
            "left" | "right",
            Record<
                "thumb" | "index" | "middle" | "ring" | "little",
                {
                    proximal: boolean;
                    intermediate: boolean;
                    distal: boolean;
                }
            >
        >;
    };
    restLocalRotation: Partial<
        Record<VRMHumanBoneName, readonly [number, number, number, number]>
    >;
    metrics: {
        shoulderWidth?: number;
        torsoLength?: number;
        headSize?: number;
        upperArmLength: { left?: number; right?: number };
        lowerArmLength: { left?: number; right?: number };
        handSize: { left?: number; right?: number };
    };
    torso: {
        distribution: { spine: number; chest: number; upperChest: number };
        chestFollow: number;
    };
    arm: {
        reachScale: number;
        lateralScale: number;
        verticalScale: number;
        depthCompression: number;
        elbowOutwardBias: number;
        shoulderDamping: number;
    };
    wrist: {
        wristRollInfluence: number;
        lowerArmTwistShare: number;
        handTwistShare: number;
    };
    fingers: {
        curlScale: number;
        curlMode: "grouped" | "perFinger";
        curlDistribution: {
            proximal: number;
            intermediate: number;
            distal: number;
        };
        splayLimitDeg: number;
    };
    risk: {
        smallBodyLargeHead: number;
        missingUpperChest: boolean;
        missingShoulders: boolean;
        constraintRisk: number;
    };
    warnings: string[];
};
```

- 既定値は `answers/05-vrm-three-vrm.md` の推奨値を v1 に採用し、`reachScale: 0.92`、`lateralScale: 0.90`、`verticalScale: 0.95`、`depthCompression: 0.60`、`elbowOutwardBias: 0.25`、`shoulderDamping: 0.55`、`wristRollInfluence: 0.40`、`fingers.curlScale: 0.80`、`torso.chestFollow: 0.55` とする。
- `torso.distribution` は capability から決定する。`spine+chest+upperChest` は `{0.25, 0.40, 0.35}`、`spine+chest` は `{0.35, 0.65, 0}`、`spine only` は `{1, 0, 0}` とする。
- parser 値域は次に固定する。

| field                                               | 値域                                              |
| --------------------------------------------------- | ------------------------------------------------- |
| `metrics.*`                                         | optional。存在する場合は finite number かつ `> 0` |
| `torso.distribution.*`                              | finite `0..1`、3 値合計は `1.0 ± 0.001`           |
| `torso.chestFollow`                                 | finite `0..1`                                     |
| `arm.reachScale`                                    | finite `0.5..1.2`                                 |
| `arm.lateralScale`                                  | finite `0.5..1.2`                                 |
| `arm.verticalScale`                                 | finite `0.5..1.2`                                 |
| `arm.depthCompression`                              | finite `0.2..0.9`                                 |
| `arm.elbowOutwardBias`                              | finite `0..0.6`                                   |
| `arm.shoulderDamping`                               | finite `0..1`                                     |
| `wrist.wristRollInfluence`                          | finite `0..1`                                     |
| `wrist.lowerArmTwistShare` / `wrist.handTwistShare` | finite `0..1`、2 値合計は `1.0 ± 0.001`           |
| `fingers.curlScale`                                 | finite `0..1.2`                                   |
| `fingers.curlDistribution.*`                        | finite `0..1`、3 値合計は `1.0 ± 0.001`           |
| `fingers.splayLimitDeg`                             | finite `0..30`                                    |
| `risk.smallBodyLargeHead` / `risk.constraintRisk`   | finite `0..1`                                     |

- 測定式は次に固定する。全て `vrm.scene.updateMatrixWorld(true)` 後の normalized bone world position distance を使い、非 finite は `undefined` にする。
    - `shoulderWidth`: `leftUpperArm` と `rightUpperArm`、min clamp `0.08`。
    - `upperArmLength.left/right`: `UpperArm` と `LowerArm`、min clamp `0.04`。
    - `lowerArmLength.left/right`: `LowerArm` と `Hand`、min clamp `0.04`。
    - `torsoLength`: `spine` と `chest` があればその距離、なければ `hips` と `chest`、どちらも不可なら `undefined`。min clamp `0.06`。
    - `headSize`: `neck` と `head` の距離を優先し、不可かつ `shoulderWidth` がある場合だけ `shoulderWidth * 0.75`。
    - `handSize.left/right`: `Hand` と `IndexProximal` の距離を優先し、不可なら `Hand` と `MiddleProximal`、どちらも不可なら `undefined`。min clamp `0.02`。
- `restLocalRotation` は `capabilities.bones` に列挙した available bone だけを保存し、`node.quaternion` の local 値を `[x, y, z, w]` tuple にする。missing bone は保存しない。
- warning code は次に固定する。測定不能は `<snake_field>_unmeasured`、推定値は `<snake_field>_estimated_from_<source>`、missing bone は `missing_<VRMHumanBoneName>`、非 finite local rotation は `invalid_rest_rotation:<VRMHumanBoneName>` とする。具体例: `torso_length_unmeasured`、`left_hand_size_unmeasured`、`head_size_estimated_from_shoulder_width`、`missing_upperChest`。
- online calibration はこの task では実装しない。avatar bone length、rest local rotation、humanoid mapping、finger chain capability は Phase 7 後続でも online calibration で変更しない固定値とする。

## スコープ境界

- 本タスクでやること:
    - `AvatarMotionProfile` v1 の型、parser、clone、VRM load 測定、minimal profile 互換変換。
    - `SincroPoseRetargeter` の保持 profile を完成版へ差し替える最小接続。
    - profile contract の unit test と設計文書同期。
- 本タスクでやらないこと:
    - solver / composer の数式を profile 値へ本格切替すること。
    - torso/head/finger pose の実適用。
    - initial / online calibration、通常 UI、motion-debug viewer 表示。
    - profile 永続化、ユーザー編集、モデル別 preset。
- 依存タスクとの境界:
    - Phase 6 minimal profile は既存 solver / composer の互換入力として使い続ける。
    - Phase 7 torso fallback、calibration、debug/replay は本タスクの `AvatarMotionProfile` を読む側であり、schema を変更しない。

## 実装方針（既存コード整合: file:line）

- Phase 6 の `MinimalAvatarMotionProfile` は `optionalBones`、`measurements`、`solverDefaults`、`warnings` だけを持つ（`sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts:17`）。完成版は別 module に置き、互換変換でこの shape を返す。
- optional bone 測定は現在 `getNormalizedBoneNode()` で行われている（`sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts:119`、`sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts:202`）。完成版も同じ three-vrm 境界を使う。
- `SincroPoseRetargeter.attachVrm()` は現在 VRM attach 時に minimal profile を作る（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:82`、`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:83`）。本タスクではこの入口で完成版を作る。
- `SincroPoseRetargeter.getAvatarMotionProfile()` は clone 済み profile を返す（`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:89`、`sincromisor-frontend/src/character/retargeting/sincroPoseRetargeter.ts:91`）。完成版でも caller が内部状態を書き換えられないよう clone を維持する。
- Phase 6 debug snapshot は minimal profile の schema を保存している（`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:50`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:52`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts:174`）。本タスクでは Phase 6 snapshot schema を変更せず、debug/replay 統合は後続タスクに残す。
- research では `AvatarMotionProfile` が rest local rotation、metrics、torso、arm、wrist、fingers、risk を持つ案が示されている（`documents/research/character_animation/answers/05-vrm-three-vrm.md:260`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:267`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:290`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:317`）。
- user calibration と混ぜてはいけない avatar 構造値は research で固定値として整理されている（`documents/research/character_animation/answers/05-vrm-three-vrm.md:371`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:378`、`documents/research/character_animation/answers/05-vrm-three-vrm.md:380`）。

## テスト

- `cd sincromisor-frontend && npm run test -- avatarMotionProfile`
- `cd sincromisor-frontend && npm run test -- minimalAvatarMotionProfile`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開 WebRTC / backend 契約は変えないが、developer-visible な character motion contract を追加するため、`documents/design/frontend/character/motion.md` に `AvatarMotionProfile` v1、`MinimalAvatarMotionProfile` 互換、online calibration で変更しない固定値を同期する。
