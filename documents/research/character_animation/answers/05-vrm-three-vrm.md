# 調査レポート: VRM / three-vrm / AvatarMotionProfile 実装規約

調査日: **2026-06-14**
対象: `sincromisor-frontend` / VRM 1.0 / Three.js / `@pixiv/three-vrm` / VRoid Studio 系モデル

## 0. 結論

`05-vrm-three-vrm.md` の方針は妥当です。`sincro` モードの three-vrm 層は、MediaPipe や IK の不確実性を解く場所ではなく、**motion solver が確定した最終上半身姿勢を VRM 1.0 humanoid runtime へ安全に適用する薄い実行層**として設計するべきです。調査依頼でも、対象は MediaPipe / IK 詳細ではなく、最終的に決まった上半身姿勢を three-vrm runtime へ安全に適用する層とされています。

最終方針は次です。

```text
Camera / MediaPipe
  -> Reliability / Temporal / Canonical / Motion Solver
  -> VrmPoseComposer
  -> VrmPoseApplier
  -> vrm.humanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
  -> renderer.render()
```

`@pixiv/three-vrm` の公式ドキュメント上、`VRMPose` は `VRMHumanBoneName` をキーにした pose 表現であり、全 VRM モデルが全 bone を持つとは限らないことが前提化されています。また `setNormalizedPose()` は normalized rest/T-pose からの local transform を指定する API です。したがって、glTF node 名・raw bone・world rotation 直接 copy を通常経路に置くべきではありません。([Pixiv][1])

リポジトリ側では、`sincromisor-frontend/package.json` に `@pixiv/three-vrm`、`three`、`@mediapipe/tasks-vision` が依存として入っており、`src` 直下には `character`、`features`、`pages` が分かれています。`src/character` には `ik`、`retargeting`、`vrmCharacter` など、`src/features/gaze` には `poseTracking`、`trackingRuntime` など、`src/pages` には `motionDebug` が確認できます。([GitHub][2])
ただし、今回の調査では GitHub 上の構成と公開ドキュメントを確認したもので、ローカル clone・ビルド・実行検証までは行っていません。

---

## 1. three-vrm pose 適用規約

### 1.1 採用する規約

| 項目                | 採用規約                                                   |
| ------------------- | ---------------------------------------------------------- |
| bone 識別子         | `VRMHumanBoneName` のみを使う                              |
| pose 形式           | `VRMPose`                                                  |
| 回転表現            | quaternion `[x, y, z, w]`                                  |
| 適用 API            | `vrm.humanoid.setNormalizedPose(finalPose)`                |
| 更新順序            | 全 pose 合成後に `vrm.update(delta)` を 1 回               |
| partial pose        | 原則禁止。所有 bone は毎フレーム全て書く                   |
| rest pose           | `normalizedRestPose` を `setNormalizedPose()` 入力にしない |
| raw bone            | debug 用に限定。通常制御では使わない                       |
| world rotation copy | 禁止に近い扱い                                             |

`normalizedRestPose` は `setNormalizedPose()` / `getNormalizedPose()` と互換ではないと公式ドキュメントに明記されています。`resetNormalizedPose()` は normalized humanoid を rest pose に戻す API であり、開発時の reset には使えますが、毎フレームの final pose 構築では identity quaternion を neutral とする自前 buffer を持つ方が安全です。([Pixiv][3])

標準フレームループは次の形に固定します。

```ts
function updateFrame(delta: number) {
    const observation = perception.readLatest();

    const trackingPose = motionSolver.solve(observation, delta);

    const finalPose = poseComposer.compose({
        trackingPose,
        semanticPose: semanticClipLayer.getPose(delta),
        style: avatarStyle,
    });

    vrm.humanoid.setNormalizedPose(finalPose);
    vrm.update(delta);

    renderer.render(scene, camera);
}
```

この形は既存 three-vrm レポートでも推奨されており、同一フレーム内で AnimationMixer、IK solver、semantic clip が同一 bone を直接書く構成は、最後に実行された処理が勝つ実行順依存の破綻要因として整理されています。

### 1.2 禁止事項

| 禁止事項                                                             | 理由                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------ |
| `vrm.scene.getObjectByName("J_Bip_L_UpperArm")` のような node 名依存 | VRoid 以外や export 差分で壊れる                             |
| `bone.quaternion.copy(worldQuaternion)`                              | rest rotation / parent transform / normalized rig を無視する |
| `setRawPose()` を通常制御に使う                                      | `autoUpdateHumanBones` と競合しやすい                        |
| `normalizedRestPose` を final pose の seed にする                    | `setNormalizedPose()` 互換形式ではない                       |
| partial pose を継続上書き                                            | 前フレームの姿勢が残る                                       |
| AnimationMixer と tracking が同じ bone を直接所有                    | 実行順依存になる                                             |
| VRM rest rotation offset を online calibration で変更                | モデル全体が崩れる                                           |

---

## 2. `vrm.update(delta)` と runtime 干渉

`VRM.update(delta)` は毎フレーム呼ぶべき更新関数で、VRM コンポーネントを更新します。three-vrm の実装では、`VRM.update()` が `super.update(delta)` を呼んだ後、node constraint、spring bone、material update を順に処理します。([GitHub][4])
`VRMCore.update(delta)` 側では humanoid update、lookAt update、expressionManager update が行われます。([GitHub][5])

したがって、姿勢適用の意味論は次です。

```text
setNormalizedPose(finalPose)
  -> vrm.update(delta)
      -> humanoid.update()
      -> lookAt.update(delta)
      -> expressionManager.update()
      -> nodeConstraintManager.update()
      -> springBoneManager.update(delta)
      -> material.update(delta)
```

この順序から、motion 適用層では次を規約にします。

1. **身体 pose は `vrm.update(delta)` より前に確定させる。**
   `vrm.update()` 後に raw bone を再度上書きすると、constraint / spring / expression との整合が崩れます。

2. **spring bone は motion の結果に追従する後段要素として扱う。**
   肩、上腕、胸、頭の角速度が大きいと、髪・袖・装飾が過剰に揺れます。肩補正、手振り、急な fallback 復帰では quaternion angular velocity clamp を入れるべきです。

3. **lookAt / expression と head motion の所有権を分離する。**
   head / neck rotation は body motion 側、eye target は lookAt 側、facial morph は expression 側に分けます。Face Landmarker の transformation matrix を head rotation に使う場合でも、expressionManager が扱う blendshape とは別契約にします。

4. **node constraint が対象 bone を動かすモデルでは、constraint 影響を profile に記録する。**
   constraint が肩・髪・アクセサリだけでなく humanoid 近傍 node にかかっている場合、final pose と見た目の pose が乖離するため、debug で raw / normalized / post-update を比較します。

---

## 3. 推奨モジュール責務

既存資料では、現在の足場として `features/gaze/trackingRuntime`、`features/gaze/poseTracking`、`character/retargeting`、`character/ik`、`pages/motionDebug` を活かし、中間層を追加する方針が示されています。これは GitHub 上の `src/character`、`src/features/gaze`、`src/pages/motionDebug` の構成とも整合します。 ([GitHub][6])

推奨ディレクトリは次です。

```text
src/character/vrm/
  VrmRuntime.ts
  VrmHumanoidRig.ts
  VrmPoseBuffer.ts
  VrmPoseComposer.ts
  VrmPoseApplier.ts
  VrmClipPoseLayer.ts
  VrmDebugInspector.ts
  AvatarMotionProfile.ts
```

| モジュール          | 責務                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `VrmRuntime`        | VRM インスタンス、update 順序、optional staging mixer を所有する                            |
| `VrmHumanoidRig`    | `VRMHumanBoneName` による bone 存在確認、normalized bone node 取得、bone metrics 計測       |
| `VrmPoseBuffer`     | 所有 bone を毎フレーム完全に埋める pose buffer                                              |
| `VrmPoseComposer`   | tracking / fallback / semantic / idle / breathing / style を 1 つの `VRMPose` に合成        |
| `VrmPoseApplier`    | quaternion 正規化、bone limit、optional fallback 適用、`setNormalizedPose()` 呼び出し       |
| `VrmClipPoseLayer`  | semantic clip / VRM Animation / additive clip を pose delta として供給                      |
| `VrmDebugInspector` | normalized pose、raw pose、post-update pose、missing bone fallback、clip ownership を可視化 |

既存レポートでも、`VrmRuntime`、`VrmHumanoidRig`、`VrmPoseBuffer`、`VrmPoseComposer` の責務案と、所有 bone を毎フレーム埋める方針が示されています。

---

## 4. `VrmPoseComposer` 設計

### 4.1 レイヤー分類

`VrmPoseComposer` は、最終的に 1 つの `VRMPose` を出す唯一の書き手です。`05-vrm-three-vrm.md` で要求されている通り、override layer と additive layer の合成、slerp / log-space blend、bone limit、partial pose ownership をこの層に集約します。

| layer      | 種別                     | 内容                                 | 例                            |
| ---------- | ------------------------ | ------------------------------------ | ----------------------------- |
| `base`     | full pose                | 所有 bone の identity / comfort pose | neutral upper body            |
| `fallback` | override                 | tracking 欠落時の自然退避            | relaxed arms                  |
| `tracking` | override                 | motion solver 出力                   | torso / head / arms / fingers |
| `semantic` | override または additive | gesture 意図                         | wave / pointing               |
| `idle`     | additive                 | breathing / micro motion             | chest breathing               |
| `style`    | post-process             | model-specific damping / clamp       | cute style                    |
| `limit`    | final clamp              | 可動域・角速度・破綻防止             | shoulder/head/wrist limit     |

### 4.2 合成順序

推奨順序は次です。

```text
1. owned bone set を確定
2. base / comfort full pose を作る
3. tracking override を信頼度 weight 付きで適用
4. fallback override を lost / suspect state に応じて混ぜる
5. semantic override を所有 bone 宣言つきで適用
6. idle / breathing / authored gesture delta を additive 合成
7. optional bone fallback を解決
8. bone limit / angular velocity clamp を最終適用
9. 全 quaternion を normalize
10. final VRMPose を返す
```

override は `slerp(base, target, weight)` を基本にします。additive は小角度なら `identity -> delta` の slerp で十分ですが、複数 additive を同じ bone に合成する場合は log-space で合成する方が安定します。既存資料でも quaternion の単純な成分 lerp は避け、slerp または log-space blend を使い、最終 pose を必ず正規化する方針が示されています。

### 4.3 bone limit の位置

bone limit は **原則として合成後にかける**べきです。理由は、tracking、semantic、idle が個別には範囲内でも、合成結果が範囲外になることがあるためです。ただし、IK solver 内の reach clamp、elbow pole rejection、wrist roll damping のような物理・幾何制約は合成前にも必要です。

整理すると次です。

| limit                                | 適用位置                  | 理由                               |
| ------------------------------------ | ------------------------- | ---------------------------------- |
| IK reach clamp                       | solver 内 / 合成前        | そもそも不可能な target を出さない |
| elbow pole flip rejection            | solver 内 / 合成前        | 反転を pose layer に持ち込まない   |
| wrist roll damping                   | solver 後 / composer 前後 | 手首暴れを抑える                   |
| head / shoulder / finger angle limit | composer 後               | layer 合成後の最終姿勢を保証する   |
| angular velocity clamp               | composer 後               | 表示上の急回転を抑える             |
| optional fallback redistribution     | composer 内               | bone 有無に応じて分配を変える      |

---

## 5. optional bone fallback table

VRM 1.0 仕様では humanoid bone は定義されていますが、`chest`、`upperChest`、`neck`、`leftShoulder` / `rightShoulder`、指 bone の多くはモデルごとに存在差があります。仕様上も、必須 bone と任意 bone、さらに humanoid bone 間に non-humanoid node が存在しうることが示されています。([GitHub][7])
three-vrm 側でも `VRMPose` は全 bone が存在することを前提にしていません。([Pixiv][1])

### 5.1 torso

| 構成                         |                                        分配 |
| ---------------------------- | ------------------------------------------: |
| `spine + chest + upperChest` | `spine 0.25 / chest 0.40 / upperChest 0.35` |
| `spine + chest`              |                   `spine 0.35 / chest 0.65` |
| `spine` only                 |                                `spine 1.00` |

この分配は既存資料でも示されており、人体解剖学的な正確性よりも、VRoid 系キャラクターで肩・胸が破綻しにくいことを優先する値です。

### 5.2 neck / head

| 構成                     | 処理                                                 |
| ------------------------ | ---------------------------------------------------- |
| `neck + head`            | `neck = headDelta * 0.35`, `head = headDelta * 0.65` |
| `head` only              | head に集約し、上限を通常より狭める                  |
| `neck` があり head large | neck は低振幅、head 側をやや大きくする               |

通常時の目安は、neck yaw ±25° / pitch ±20° / roll ±15°、head yaw ±35° / pitch ±25° / roll ±20°です。`neck` がない場合は head の yaw を ±25〜30°、pitch ±20°、roll ±15° 程度から始め、首折れ感と頭部過回転を避けます。既存資料では neck/head 分配と制限値が整理されています。

### 5.3 shoulder

| 構成                            | 処理                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| shoulder あり                   | arm elevation に応じて `leftShoulder` / `rightShoulder` を積極的に使う |
| shoulder なし + upperChest あり | 肩補正を `upperChest` と `upperArm` root 側へ逃がす                    |
| shoulder なし + upperChest なし | chest / spine 側の補助を弱く入れ、upperArm の可動域をより保守的にする  |

腕を上げる場合の初期値は次です。

```text
armRaiseAssist = smoothstep(30°, 110°, armElevation)

shoulderLift = armRaiseAssist * 10〜20°
upperChest   = armRaiseAssist * 6〜18°
chest        = armRaiseAssist * 0〜12°
```

肩 bone がないモデルでは、肩を upperArm だけで表現しようとせず、胸郭側に少量逃がして、腕の root 周辺の破綻を抑えます。

### 5.4 fingers

| 構成                             | curl 分配                                              |
| -------------------------------- | ------------------------------------------------------ |
| proximal + intermediate + distal | `50〜60% / 30〜40% / 10〜20%`                          |
| proximal + intermediate          | distal 分を proximal / intermediate に正規化再分配     |
| proximal only                    | curl 全量を proximal に入れるが上限を下げる            |
| 一部 finger chain 欠落           | 指グループ単位で fallback し、存在する bone だけ動かす |

指は各関節 3D rotation を最初から完全再現するのではなく、`curl`、限定的な `spread`、thumb `oppose` の低次元パラメータに落とす方が安定します。`splay` は入れるとしても index / little を中心に ±10〜15° 程度から始めるべきです。

---

## 6. AvatarMotionProfile

### 6.1 VRM load 時に測定する値

`AvatarMotionProfile` は、モデル差分を例外処理ではなく data として扱うための中核です。ロード時に測定する項目は次です。

```ts
type AvatarMotionProfile = {
    model: {
        vrmVersion: "1.0";
        modelName?: string;
        isVRoidLike?: boolean;
    };

    capabilities: {
        hasChest: boolean;
        hasUpperChest: boolean;
        hasNeck: boolean;
        hasLeftShoulder: boolean;
        hasRightShoulder: boolean;
        fingerChains: Record<
            string,
            {
                proximal: boolean;
                intermediate: boolean;
                distal: boolean;
            }
        >;
    };

    restLocalRotation: Partial<
        Record<VRMHumanBoneName, [number, number, number, number]>
    >;

    metrics: {
        height: number;
        shoulderWidth: number;
        torsoLength: number;
        headSize: number;
        upperArmLength: { left: number; right: number };
        lowerArmLength: { left: number; right: number };
        handLength: { left: number; right: number };
    };

    torso: {
        weights: { spine: number; chest: number; upperChest: number };
        chestFollow: number;
    };

    head: {
        neckWeight: number;
        headWeight: number;
        maxYaw: number;
        maxPitch: number;
        maxRoll: number;
    };

    arm: {
        reachScale: number;
        lateralShoulderScale: number;
        verticalArmScale: number;
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
        curlMode: "grouped" | "perFinger" | "perJoint";
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
        springCollisionRisk: number;
        constraintRisk: number;
    };
};
```

ロード時に rest local rotation、bone length、shoulder width、head size、optional bones を計測し、profile に reach scale、depth compression、elbow outward bias、shoulder damping、wrist roll influence を持たせる方針は roadmap にも記載されています。

### 6.2 初期値

VRoid 系標準寄りの初期値は次です。

| 項目                   | 初期値 | 推奨レンジ |
| ---------------------- | -----: | ---------: |
| `reachScale`           |   0.92 | 0.88〜0.96 |
| `lateralShoulderScale` |   0.90 | 0.80〜0.98 |
| `verticalArmScale`     |   0.95 | 0.90〜1.00 |
| `depthCompression`     |   0.60 | 0.45〜0.75 |
| `elbowOutwardBias`     |   0.25 | 0.15〜0.35 |
| `wristRollInfluence`   |   0.40 | 0.25〜0.60 |
| `chestFollow`          |   0.55 | 0.40〜0.70 |
| `shoulderDamping`      |   0.55 | 0.40〜0.70 |

特に `depthCompression` は重要です。単眼カメラ由来の z をそのまま使うと、手を前に出したときに腕が伸び切る、顔や胸にめり込む、手首 roll が暴れる、という問題が出やすくなります。既存資料でも、VRoid 系キャラクターでは reach・肩幅・奥行きを圧縮する初期値が整理されています。

### 6.3 user calibration と混ぜてよい値

| 分類       | 値                                                                    | 方針                                                        |
| ---------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| 混ぜてよい | user shoulder width, neutral yaw, neutral head, camera distance scale | 高信頼度・near-neutral 時だけ低速更新                       |
| 混ぜてよい | hand open/close 基準                                                  | 長期平均で補正                                              |
| 条件付き   | reachScale, depthCompression                                          | user calibration ではなく profile preset + UX slider で調整 |
| 混ぜない   | avatar bone length                                                    | モデル固有値として固定                                      |
| 混ぜない   | rest local rotation                                                   | 動的変更禁止                                                |
| 混ぜない   | optional bone capability                                              | ロード時に固定                                              |
| 混ぜない   | humanoid bone axis / parent relation                                  | 実装規約として固定                                          |
| 混ぜない   | hard joint limit                                                      | user の癖で破綻許容しない                                   |

online calibration は「人間側観測基準」を低速更新するものであり、「アバター側構造」を変更するものではありません。roadmap でも、初期 calibration は T pose ではなく正面自然姿勢 + 軽い A pose を基本にし、online calibration は高信頼度・near-neutral 時だけ肩幅や neutral yaw を低速更新するとされています。

---

## 7. AnimationMixer / VRM Animation / additive clip 採用判断

### 7.1 判断

`AnimationMixer` を本番 VRM の主制御器にしない方針を採用します。理由は、tracking、IK、semantic clip、fallback が同じ bone を書くと、最終姿勢が実行順依存になるためです。既存レポートでも、最も安全な方式は pose composer 方式であり、VRM Animation や既存 clip を使う場合は staging rig で評価してから final pose に合成する方針が示されています。

| 方式                     | 採用判断     | 用途                                        |
| ------------------------ | ------------ | ------------------------------------------- |
| 自前 `VRMPoseDelta` clip | 標準採用     | breathing, idle, small gesture              |
| staging mixer            | 条件付き採用 | VRM Animation / 既存 AnimationClip 活用     |
| 本番 VRM 直接 mixer      | 原則不採用   | bone 所有が完全に分離できる小規模 demo のみ |
| AnimationMixer 主制御    | 不採用       | tracking / IK と競合する                    |
| additive clip            | 採用可       | 小振幅の意味動作・idle に限定               |

three-vrm-animation には、VRM Animation を読み込む `VRMAnimationLoaderPlugin` と、`VRMAnimation` と対象 `VRM` から Three.js `AnimationClip` を作る `createVRMAnimationClip()` が提供されています。([Pixiv][8])

### 7.2 staging mixer の推奨フロー

```text
VRMAnimation
  -> createVRMAnimationClip(vrmAnimation, stagingVrm)
  -> stagingMixer.update(delta)
  -> stagingPose = stagingVrm.humanoid.getNormalizedPose()
  -> clipPoseDelta = stagingPose - stagingNeutral
  -> VrmPoseComposer.compose(trackingPose, clipPoseDelta)
  -> productionVrm.humanoid.setNormalizedPose(finalPose)
  -> productionVrm.update(delta)
```

この構成では、本番 VRM には最後に `finalPose` だけが適用されます。clip がどの bone を動かしているかは `VrmDebugInspector` で `AnimationMixer ownership` として記録します。

---

## 8. spring bone / constraint / expression との干渉対策

### 8.1 spring bone

spring bone は post-update の見た目に関わるため、身体 motion の急な角速度を嫌います。対策は次です。

| 問題                             | 対策                                                  |
| -------------------------------- | ----------------------------------------------------- |
| 手振りで髪・袖が過剰に揺れる     | shoulder / upperChest の angular velocity clamp       |
| fallback 復帰時に装飾が跳ねる    | lost -> recovering の 200〜400ms blend                |
| モデル切替直後に spring が暴れる | 初期数フレームは spring reset または pose stabilize   |
| 腕が髪・胸に近づく               | reach clamp / nearFace state / collision risk profile |

### 8.2 node constraint

node constraint は `vrm.update(delta)` 内で humanoid / lookAt / expression 後に更新されます。constraint が humanoid bone 近傍にあるモデルでは、normalized pose を適用しても post-update の node が追加変換される可能性があります。対策は、constraint の有無を profile に記録し、debug で normalized pose / raw pose / post-update pose を比較することです。

### 8.3 expression / lookAt

表情・視線は今回の主対象外ですが、three-vrm runtime では更新対象です。ownership は次のように分けます。

| 領域                         | owner                                              |
| ---------------------------- | -------------------------------------------------- |
| head / neck rotation         | body motion                                        |
| eye gaze / target            | lookAt                                             |
| blink / mouth / facial morph | expression                                         |
| face matrix from MediaPipe   | head motion の観測入力。ただし expression とは分離 |
| facial blendshape            | expression layer。body pose へ混ぜない             |

---

## 9. VRM モデル差分テスト観点

### 9.1 モデル構成テスト

| モデル                  | 見るべき差分                   |
| ----------------------- | ------------------------------ |
| VRoid 標準体型          | 基準動作                       |
| 小柄 VRoid              | reachScale / head ratio        |
| 大きな頭の VRoid        | head motion / arm nearFace     |
| `upperChest` なし       | torso fallback                 |
| `neck` なし             | head limit                     |
| shoulder なし           | shoulder compensation fallback |
| 指 distal 欠落          | curl redistribution            |
| 一般 VRM 1.0            | rest rotation / node hierarchy |
| spring-heavy モデル     | 肩・頭の角速度影響             |
| constraint-heavy モデル | post-update 差分               |

roadmap でも、小柄 VRoid、頭が大きいモデル、`upperChest` なしモデルで同じ replay log を比較し、profile 差分によって腕の伸び切り、顔めり込み、肩崩れを調整できることが完了条件として挙げられています。

### 9.2 motion replay テスト

| ケース                | 主な観測項目                              |
| --------------------- | ----------------------------------------- |
| neutral 10 秒         | torso/head/wrist jitter                   |
| ゆっくり手を上げる    | shoulder / upperChest / upperArm の連続性 |
| 高速手振り            | angular velocity spike / spring 過揺れ    |
| 手を顔前へ出す        | depth compression / nearFace safety       |
| 片手を画面外へ出す    | lost -> fallback -> recovery              |
| 腕を交差する          | 左右同定 / hand ownership                 |
| 横を向く              | bodyFront 反転 / torso yaw                |
| 手をカメラ方向に出す  | depth ambiguity / reach clamp             |
| gesture clip 同時実行 | tracking と semantic の bone ownership    |
| VRM Animation staging | staging pose delta の正規化               |

### 9.3 debug metrics

| 指標                                  | 用途                         |
| ------------------------------------- | ---------------------------- |
| `applied quaternion angular velocity` | jitter / 急回転検出          |
| `clampedBones`                        | limit に張り付く bone の特定 |
| `missingBoneFallbackCount`            | optional fallback の発生状況 |
| `normalizedPoseBeforeLimit`           | solver 出力の妥当性          |
| `normalizedPoseAfterLimit`            | clamp 後の品質確認           |
| `rawPoseAfterUpdate`                  | normalized -> raw 転送確認   |
| `springJitterAfterMotion`             | spring bone 干渉評価         |
| `AnimationMixer ownership`            | clip が書く bone の確認      |
| `recoveryJumpAngle`                   | dropout 復帰品質             |
| `profileId / calibrationId`           | replay 比較の再現性          |

three-vrm 実装では MediaPipe landmark 可視化だけでは不十分で、`VRMHumanBoneName` ごとの bone 存在、normalized pose、raw pose、limit 前後、AnimationMixer ownership、`vrm.update()` 呼び忘れ検出などを debug に出すべきです。

---

## 10. sincromisor-frontend への実装提案

### 10.1 既存構成を活かす

既存資料は、大きな `src/mocap` へ作り替えるより、既存の責務境界を保ちながら中間層を追加する方針を推奨しています。これは現在の `src/character`、`src/features/gaze`、`src/pages/motionDebug` の構成と整合します。 ([GitHub][6])

実装順は次が安全です。

1. `src/character/vrm/VrmHumanoidRig.ts`
   `VRMHumanBoneName` による bone capabilities と bone metrics を取得する。

2. `src/character/vrm/AvatarMotionProfile.ts`
   optional bones、rest local rotation、bone length、style 初期値を保持する。

3. `src/character/vrm/VrmPoseBuffer.ts`
   所有 bone を毎フレーム full pose として出す。

4. `src/character/vrm/VrmPoseComposer.ts`
   tracking / fallback / semantic / idle / breathing を合成し、最終 clamp を行う。

5. `src/character/vrm/VrmPoseApplier.ts`
   `setNormalizedPose(finalPose)` と `vrm.update(delta)` を唯一の適用経路にする。

6. `src/character/vrm/VrmDebugInspector.ts`
   normalized / raw / post-update / fallback / mixer ownership を記録する。

7. `src/character/vrm/VrmClipPoseLayer.ts`
   gesture / breathing / optional VRM Animation staging を pose delta として供給する。

### 10.2 package version 注意

`package.json` では `@pixiv/three-vrm` が `^3.5.1` として指定されています。2026-06-14 時点の GitHub release では v3.5.3 が確認できるため、実装設計の対象を v3.5.3 とするのは妥当ですが、実際に使われるバージョンは `package-lock.json` の解決結果も確認してください。([GitHub][2])

three-vrm v3 は WebGPU 対応も含みますが、公式 README では WebGPURenderer 用の MToonNodeMaterial や Three.js r167+ 依存、NodeMaterial 周辺の互換性注意が示されています。モーション実装の安定性を優先する段階では、まず WebGLRenderer + normalized humanoid pose を標準経路にする判断が堅実です。([GitHub][9])

---

## 11. 最終採用判断

| 論点                                    | 判断                                        |
| --------------------------------------- | ------------------------------------------- |
| `setNormalizedPose()` 主経路            | 採用                                        |
| `VRMHumanBoneName` 唯一識別子           | 採用                                        |
| raw bone 通常制御                       | 不採用                                      |
| world rotation direct copy              | 不採用                                      |
| `normalizedRestPose` を pose 入力に使う | 不採用                                      |
| 所有 bone を毎フレーム全書き            | 採用                                        |
| partial pose 継続上書き                 | 不採用                                      |
| `VrmPoseComposer` 一点合成              | 採用                                        |
| bone limit                              | 合成後 clamp を標準、solver 内 clamp も併用 |
| AnimationMixer 直接本番 VRM 適用        | 原則不採用                                  |
| VRM Animation                           | staging 評価なら採用可                      |
| additive clip                           | 小振幅 semantic / idle に限定して採用       |
| optional bone fallback                  | 必須                                        |
| AvatarMotionProfile                     | 必須                                        |
| spring / constraint / expression        | update order と ownership を明示して分離    |

最終的には、**three-vrm に渡す時点で、すでに `VRMHumanBoneName` keyed の normalized local pose として成立している**ことを実装上の合格条件にしてください。three-vrm は「不確実な観測値を解釈する場所」ではなく、VRM 1.0 humanoid 仕様、optional bone、rest rotation、runtime update order を尊重しながら、最終姿勢を安全にモデルへ反映する runtime 境界です。既存レポートの最終アーキテクチャでも、この責務分離が推奨されています。

[1]: https://pixiv.github.io/three-vrm/docs/types/three-vrm.VRMPose.html "VRMPose | @pixiv/three-vrm"
[2]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/package.json "Sincromisor/sincromisor-frontend/package.json at main · Sincromisor/Sincromisor · GitHub"
[3]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[4]: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/src/VRM.ts "three-vrm/packages/three-vrm/src/VRM.ts at release · pixiv/three-vrm · GitHub"
[5]: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm-core/src/VRMCore.ts "three-vrm/packages/three-vrm-core/src/VRMCore.ts at release · pixiv/three-vrm · GitHub"
[6]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character "Sincromisor/sincromisor-frontend/src/character at main · Sincromisor/Sincromisor · GitHub"
[7]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md "vrm-specification/specification/VRMC_vrm-1.0/humanoid.md at master · vrm-c/vrm-specification · GitHub"
[8]: https://pixiv.github.io/three-vrm/docs/functions/three-vrm-animation.createVRMAnimationClip.html "createVRMAnimationClip | @pixiv/three-vrm"
[9]: https://github.com/pixiv/three-vrm "GitHub - pixiv/three-vrm: Use VRM on Three.js · GitHub"
