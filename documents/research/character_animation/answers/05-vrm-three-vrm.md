# 調査レポート: VRM / three-vrm / AvatarMotionProfile 実装規約

調査日: **2026-06-14**
対象: `sincromisor-frontend` / VRM 1.0 / Three.js / `@pixiv/three-vrm` / VRoid Studio 系モデル

## 0. 結論

`05-vrm-three-vrm.md` の方針は妥当です。`sincro` モードの three-vrm 層は、MediaPipe や IK の不確実性を解く場所ではなく、**動作算出処理が確定した最終上半身姿勢を VRM 1.0 人型骨格実行時へ安全に適用する薄い実行層**として設計するべきです。調査依頼でも、対象は MediaPipe / IK 詳細ではなく、最終的に決まった上半身姿勢を three-vrm 実行時へ安全に適用する層とされています。

最終方針は次です。

```text
カメラ / MediaPipe
  -> 信頼性 / 時系列 / 標準化した / 動作算出処理
  -> VrmPoseComposer
  -> VrmPoseApplier
  -> vrm.humanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
  -> renderer.render()
```

`@pixiv/three-vrm` の公式ドキュメント上、`VRMPose` は `VRMHumanBoneName` をキーにした姿勢表現であり、全 VRM モデルが全ボーンを持つとは限らないことが前提化されています。また `setNormalizedPose()` は正規化済み初期姿勢・Tポーズからのローカル変換を指定する API です。したがって、glTF ノード名・未加工ボーン・ワールド回転直接コピーを通常経路に置くべきではありません。([Pixiv][1])

リポジトリ側では、`sincromisor-frontend/package.json` に `@pixiv/three-vrm`、`three`、`@mediapipe/tasks-vision` が依存として入っており、`src` 直下には `character`、`features`、`pages` が分かれています。`src/character` には `ik`、`retargeting`、`vrmCharacter` など、`src/features/gaze` には `poseTracking`、`trackingRuntime` など、`src/pages` には `motionDebug` が確認できます。([GitHub][2])
ただし、今回の調査では GitHub 上の構成と公開ドキュメントを確認したもので、ローカル複製・ビルド・実行検証までは行っていません。

---

## 1. three-vrm 姿勢適用規約

### 1.1 採用する規約

| 項目                       | 採用規約                                                   |
| -------------------------- | ---------------------------------------------------------- |
| ボーン識別子               | `VRMHumanBoneName` のみを使う                              |
| 姿勢形式                   | `VRMPose`                                                  |
| 回転表現                   | クォータニオン `[x, y, z, w]`                              |
| 適用 API                   | `vrm.humanoid.setNormalizedPose(finalPose)`                |
| 更新順序                   | 全姿勢合成後に `vrm.update(delta)` を 1 回                 |
| 一部のボーンだけを含む姿勢 | 原則禁止。所有ボーンは毎フレーム全て書く                   |
| 初期姿勢                   | `normalizedRestPose` を `setNormalizedPose()` 入力にしない |
| 未加工ボーン               | デバッグ用に限定。通常制御では使わない                     |
| ワールド回転コピー         | 禁止に近い扱い                                             |

`normalizedRestPose` は `setNormalizedPose()` / `getNormalizedPose()` と互換ではないと公式ドキュメントに明記されています。`resetNormalizedPose()` は正規化済み人型骨格を初期姿勢に戻す API であり、開発時の再初期化には使えますが、毎フレームの最終姿勢構築では単位クォータニオンを中立姿勢とする自前バッファを持つ方が安全です。([Pixiv][3])

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

この形は既存 three-vrm レポートでも推奨されており、同一フレーム内で AnimationMixer、IK ソルバー、意味に基づく動作クリップが同一ボーンを直接書く構成は、最後に実行された処理が勝つ実行順依存の破綻要因として整理されています。

### 1.2 禁止事項

| 禁止事項                                                             | 理由                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| `vrm.scene.getObjectByName("J_Bip_L_UpperArm")` のようなノード名依存 | VRoid 以外や公開差分で壊れる                         |
| `bone.quaternion.copy(worldQuaternion)`                              | 初期姿勢の回転 / 親の変換 / 正規化済みリグを無視する |
| `setRawPose()` を通常制御に使う                                      | `autoUpdateHumanBones` と競合しやすい                |
| `normalizedRestPose` を最終姿勢の初期値にする                        | `setNormalizedPose()` 互換形式ではない               |
| 一部のボーンだけを含む姿勢を継続上書き                               | 前フレームの姿勢が残る                               |
| AnimationMixer と追跡が同じボーンを直接所有                          | 実行順依存になる                                     |
| VRM 初期姿勢の回転補正量を継続的なキャリブレーションで変更           | モデル全体が崩れる                                   |

---

## 2. `vrm.update(delta)` と実行時干渉

`VRM.update(delta)` は毎フレーム呼ぶべき更新関数で、VRM コンポーネントを更新します。three-vrm の実装では、`VRM.update()` が `super.update(delta)` を呼んだ後、ノード制約、揺れ物のボーン、材質更新を順に処理します。([GitHub][4])
`VRMCore.update(delta)` 側では人型骨格更新、lookAt 更新、expressionManager 更新が行われます。([GitHub][5])

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

この順序から、動作適用層では次を規約にします。

1. **身体姿勢は `vrm.update(delta)` より前に確定させる。**
   `vrm.update()` 後に未加工ボーンを再度上書きすると、制約 / 揺れ物 / 表情との整合が崩れます。

2. **揺れ物のボーンは動作の結果に追従する後段要素として扱う。**
   肩、上腕、胸、頭の角速度が大きいと、髪・袖・装飾が過剰に揺れます。肩補正、手振り、急な代替処理復帰ではクォータニオン角速度制限を入れるべきです。

3. **lookAt / 表情と頭部動作の所有権を分離する。**
   頭部 / 首回転は身体の動作側、目目標は lookAt 側、顔の形状変化は表情側に分けます。Face Landmarker の変換行列を頭部回転に使う場合でも、expressionManager が扱うブレンドシェイプとは別契約にします。

4. **ノード制約が対象ボーンを動かすモデルでは、制約影響を調整情報に記録する。**
   制約が肩・髪・アクセサリだけでなく人型骨格近傍ノードにかかっている場合、最終姿勢と見た目の姿勢が乖離するため、デバッグで未加工・正規化済み / 更新後を比較します。

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

| モジュール          | 責務                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `VrmRuntime`        | VRM インスタンス、更新順序、任意評価用のミキサーを所有する                                 |
| `VrmHumanoidRig`    | `VRMHumanBoneName` によるボーン存在確認、正規化済みボーンノード取得、骨格の測定値計測      |
| `VrmPoseBuffer`     | 所有ボーンを毎フレーム完全に埋める姿勢バッファ                                             |
| `VrmPoseComposer`   | 追跡 / 代替処理 / 意味に基づく動作 / 待機動作 / 呼吸 / 演出を 1 つの `VRMPose` に合成      |
| `VrmPoseApplier`    | クォータニオン正規化、ボーンの可動域制限、任意代替処理適用、`setNormalizedPose()` 呼び出し |
| `VrmClipPoseLayer`  | 意味に基づく動作クリップ / VRM Animation / 加算クリップを姿勢差分として供給                |
| `VrmDebugInspector` | 正規化済み姿勢、未加工姿勢、更新後姿勢、欠損ボーン代替処理、クリップ所有権を可視化         |

既存レポートでも、`VrmRuntime`、`VrmHumanoidRig`、`VrmPoseBuffer`、`VrmPoseComposer` の責務案と、所有ボーンを毎フレーム埋める方針が示されています。

---

## 4. `VrmPoseComposer` 設計

### 4.1 レイヤー分類

`VrmPoseComposer` は、最終的に 1 つの `VRMPose` を出す唯一の書き手です。`05-vrm-three-vrm.md` で要求されている通り、上書き層と加算層の合成、slerp / 対数空間での合成、ボーンの可動域制限、一部のボーンだけを含む姿勢所有権をこの層に集約します。

| 層         | 種別               | 内容                                      | 例                    |
| ---------- | ------------------ | ----------------------------------------- | --------------------- |
| `base`     | 全ボーンを含む姿勢 | 所有ボーンの識別情報 / 無理のない自然姿勢 | 中立姿勢上半身        |
| `fallback` | 上書き             | 追跡欠落時の自然退避                      | 力を抜いた腕          |
| `tracking` | 上書き             | 動作算出処理出力                          | 体幹 / 頭部 / 腕 / 指 |
| `semantic` | 上書きまたは加算   | ジェスチャー意図                          | 手振り / pointing     |
| `idle`     | 加算               | 呼吸 / 微小な動作                         | 胸呼吸                |
| `style`    | 後処理             | モデル固有の減衰 / 値の制限               | かわいい演出          |
| `limit`    | 最終値の制限       | 可動域・角速度・破綻防止                  | 肩・頭部・手首制限    |

### 4.2 合成順序

推奨順序は次です。

```text
1. 所有するボーン一式を確定
2. 基準 / 無理のない自然姿勢全ボーンを含む姿勢を作る
3. 追跡上書きを信頼度重み付きで適用
4. 代替処理上書きを未検出 / 疑わしい状態に応じて混ぜる
5. 意味に基づく動作上書きを所有ボーン宣言つきで適用
6. 待機動作 / 呼吸 / 手作業で制作したジェスチャー差分を加算合成
7. 任意ボーン代替処理を解決
8. ボーンの可動域制限 / 角速度制限を最終適用
9. 全クォータニオンを正規化
10. 最終 VRMPose を返す
```

上書きは `slerp(base, target, weight)` を基本にします。加算は小角度なら `identity -> delta` の slerp で十分ですが、複数加算を同じボーンに合成する場合は対数空間で合成する方が安定します。既存資料でもクォータニオンの単純な成分 lerp は避け、slerp または対数空間での合成を使い、最終姿勢を必ず正規化する方針が示されています。

### 4.3 ボーンの可動域制限の位置

ボーンの可動域制限は **原則として合成後にかける**べきです。理由は、追跡、意味に基づく動作、待機動作が個別には範囲内でも、合成結果が範囲外になることがあるためです。ただし、IK ソルバー内の到達距離制限、肘の曲がる方向除外、手首ロール減衰のような物理・幾何制約は合成前にも必要です。

整理すると次です。

| 制限                   | 適用位置                      | 理由                             |
| ---------------------- | ----------------------------- | -------------------------------- |
| IK 到達距離制限        | ソルバー内 / 合成前           | そもそも不可能な目標を出さない   |
| 肘の曲がる方向反転除外 | ソルバー内 / 合成前           | 反転を姿勢レイヤーに持ち込まない |
| 手首ロール減衰         | ソルバー後 / 姿勢合成処理前後 | 手首暴れを抑える                 |
| 頭部 / 肩 / 指角度制限 | 姿勢合成処理後                | 層合成後の最終姿勢を保証する     |
| 角速度制限             | 姿勢合成処理後                | 表示上の急回転を抑える           |
| 任意代替処理再分配     | 姿勢合成処理内                | ボーン有無に応じて分配を変える   |

---

## 5. 任意ボーン代替処理表

VRM 1.0 仕様では人型骨格ボーンは定義されていますが、`chest`、`upperChest`、`neck`、`leftShoulder` / `rightShoulder`、指ボーンの多くはモデルごとに存在差があります。仕様上も、必須ボーンと任意ボーン、さらに人型骨格ボーン間に人型骨格に属さないノードが存在しうることが示されています。([GitHub][7])
three-vrm 側でも `VRMPose` は全ボーンが存在することを前提にしていません。([Pixiv][1])

### 5.1 体幹

| 構成                         |                                        分配 |
| ---------------------------- | ------------------------------------------: |
| `spine + chest + upperChest` | `spine 0.25 / chest 0.40 / upperChest 0.35` |
| `spine + chest`              |                   `spine 0.35 / chest 0.65` |
| `spine` のみ                 |                                `spine 1.00` |

この分配は既存資料でも示されており、人体解剖学的な正確性よりも、VRoid 系キャラクターで肩・胸が破綻しにくいことを優先する値です。

### 5.2 首 / 頭部

| 構成                    | 処理                                                 |
| ----------------------- | ---------------------------------------------------- |
| `neck + head`           | `neck = headDelta * 0.35`, `head = headDelta * 0.65` |
| `head` のみ             | 頭部に集約し、上限を通常より狭める                   |
| `neck` があり頭部大きい | 首は低振幅、頭部側をやや大きくする                   |

通常時の目安は、首ヨー ±25° / ピッチ ±20° / ロール ±15°、頭部ヨー ±35° / ピッチ ±25° / ロール ±20°です。`neck` がない場合は頭部のヨーを ±25〜30°、ピッチ ±20°、ロール ±15° 程度から始め、首折れ感と頭部過回転を避けます。既存資料では首・頭部分配と制限値が整理されています。

### 5.3 肩

| 構成                       | 処理                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| 肩あり                     | 腕仰角に応じて `leftShoulder` / `rightShoulder` を積極的に使う     |
| 肩なし + `upperChest` あり | 肩補正を `upperChest` と `upperArm` ルート側へ逃がす               |
| 肩なし + `upperChest` なし | 胸 / 背骨側の補助を弱く入れ、`upperArm` の可動域をより保守的にする |

腕を上げる場合の初期値は次です。

```text
armRaiseAssist = smoothstep(30°, 110°, armElevation)

shoulderLift = armRaiseAssist * 10〜20°
upperChest   = armRaiseAssist * 6〜18°
chest        = armRaiseAssist * 0〜12°
```

肩ボーンがないモデルでは、肩を `upperArm` だけで表現しようとせず、胸郭側に少量逃がして、腕のルート周辺の破綻を抑えます。

### 5.4 指

| 構成                 | 曲げ分配                                             |
| -------------------- | ---------------------------------------------------- |
| 基部 + 中間部 + 末端 | `50〜60% / 30〜40% / 10〜20%`                        |
| 基部 + 中間部        | 末端分を基部 / 中間部に正規化再分配                  |
| 基部のみ             | 曲げ全量を基部に入れるが上限を下げる                 |
| 一部指のボーン列欠落 | 指グループ単位で代替処理し、存在するボーンだけ動かす |

指は各関節 3D 回転を最初から完全再現するのではなく、`curl`、限定的な `spread`、親指 `oppose` の低次元パラメータに落とす方が安定します。`splay` は入れるとしても人差し指 / 小指を中心に ±10〜15° 程度から始めるべきです。

---

## 6. AvatarMotionProfile

### 6.1 VRM 読み込み時に測定する値

`AvatarMotionProfile` は、モデル差分を例外処理ではなくデータとして扱うための中核です。ロード時に測定する項目は次です。

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

ロード時に初期姿勢のローカル回転、骨の長さ、肩幅、頭部大きさ、任意ボーンを計測し、調整情報に到達距離倍率、奥行き圧縮、肘外向き偏りの補正、肩減衰、手首ロール反映率を持たせる方針は取り組み計画にも記載されています。

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

特に `depthCompression` は重要です。単眼カメラ由来の z をそのまま使うと、手を前に出したときに腕が伸び切る、顔や胸にめり込む、手首ロールが暴れる、という問題が出やすくなります。既存資料でも、VRoid 系キャラクターでは到達距離・肩幅・奥行きを圧縮する初期値が整理されています。

### 6.3 ユーザー較正と混ぜてよい値

| 分類       | 値                                                       | 方針                                                         |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 混ぜてよい | ユーザー肩幅, 中立姿勢ヨー, 中立姿勢頭部, カメラ距離倍率 | 高信頼度・中立姿勢に近い時だけ低速更新                       |
| 混ぜてよい | 手開閉基準                                               | 長期平均で補正                                               |
| 条件付き   | reachScale, depthCompression                             | ユーザー較正ではなく調整情報プリセット + UX スライダーで調整 |
| 混ぜない   | アバター骨の長さ                                         | モデル固有値として固定                                       |
| 混ぜない   | 初期姿勢のローカル回転                                   | 動的変更禁止                                                 |
| 混ぜない   | 任意ボーン対応能力                                       | ロード時に固定                                               |
| 混ぜない   | 人型骨格ボーン軸 / 親子関係                              | 実装規約として固定                                           |
| 混ぜない   | 関節可動域の強制制限                                     | ユーザーの癖で破綻許容しない                                 |

継続的なキャリブレーションは「人間側観測基準」を低速更新するものであり、「アバター側構造」を変更するものではありません。取り組み計画でも、初期較正は T 姿勢ではなく正面自然姿勢 + 軽い A 姿勢を基本にし、継続的なキャリブレーションは高信頼度・中立姿勢に近い時だけ肩幅や中立姿勢ヨーを低速更新するとされています。

---

## 7. AnimationMixer / VRM Animation / 加算クリップ採用判断

### 7.1 判断

`AnimationMixer` を本番 VRM の主制御器にしない方針を採用します。理由は、追跡、IK、意味に基づく動作クリップ、代替処理が同じボーンを書くと、最終姿勢が実行順依存になるためです。既存レポートでも、最も安全な方式は姿勢合成処理方式であり、VRM Animation や既存クリップを使う場合は評価用の骨格で評価してから最終姿勢に合成する方針が示されています。

| 方式                         | 採用判断     | 用途                                       |
| ---------------------------- | ------------ | ------------------------------------------ |
| 自前 `VRMPoseDelta` クリップ | 標準採用     | 呼吸, 待機動作, 小さいジェスチャー         |
| 評価用のミキサー             | 条件付き採用 | VRM Animation / 既存 AnimationClip 活用    |
| 本番 VRM 直接ミキサー        | 原則不採用   | ボーン所有が完全に分離できる小規模デモのみ |
| AnimationMixer 主制御        | 不採用       | 追跡 / IK と競合する                       |
| 加算クリップ                 | 採用可       | 小振幅の意味動作・待機動作に限定           |

three-vrm-animation には、VRM Animation を読み込む `VRMAnimationLoaderPlugin` と、`VRMAnimation` と対象 `VRM` から Three.js `AnimationClip` を作る `createVRMAnimationClip()` が提供されています。([Pixiv][8])

### 7.2 評価用のミキサーの推奨フロー

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

この構成では、本番 VRM には最後に `finalPose` だけが適用されます。クリップがどのボーンを動かしているかは `VrmDebugInspector` で AnimationMixerの所有権として記録します。

---

## 8. 揺れ物のボーン / 制約 / 表情との干渉対策

### 8.1 揺れ物のボーン

揺れ物のボーンは更新後の見た目に関わるため、身体動作の急な角速度を嫌います。対策は次です。

| 問題                           | 対策                                              |
| ------------------------------ | ------------------------------------------------- |
| 手振りで髪・袖が過剰に揺れる   | 肩 / `upperChest` の角速度制限                    |
| 代替処理復帰時に装飾が跳ねる   | 未検出 -> 復帰中の 200〜400ms 合成                |
| モデル切替直後に揺れ物が暴れる | 初期数フレームは揺れ物再初期化または姿勢安定化    |
| 腕が髪・胸に近づく             | 到達距離制限 / nearFace 状態 / 衝突リスク調整情報 |

### 8.2 ノード制約

ノード制約は `vrm.update(delta)` 内で人型骨格 / lookAt / 表情後に更新されます。制約が人型骨格ボーン近傍にあるモデルでは、正規化済み姿勢を適用しても更新後のノードが追加変換される可能性があります。対策は、制約の有無を調整情報に記録し、デバッグで正規化済み姿勢 / 未加工姿勢 / 更新後姿勢を比較することです。

### 8.3 表情 / lookAt

表情・視線は今回の主対象外ですが、three-vrm 実行時では更新対象です。所有権は次のように分けます。

| 領域                         | 所有者                                 |
| ---------------------------- | -------------------------------------- |
| 頭部 / 首回転                | 身体の動作                             |
| 目視線 / 目標                | lookAt                                 |
| まばたき / 口 / 顔の形状変化 | 表情                                   |
| 顔行列から MediaPipe         | 頭部動作の観測入力。ただし表情とは分離 |
| 顔のブレンドシェイプ         | 表情層。身体姿勢へ混ぜない             |

---

## 9. VRM モデル差分テスト観点

### 9.1 モデル構成テスト

| モデル             | 見るべき差分                |
| ------------------ | --------------------------- |
| VRoid 標準体型     | 基準動作                    |
| 小柄 VRoid         | reachScale / 頭部比率       |
| 大きな頭の VRoid   | 頭部動作 / 腕 nearFace      |
| `upperChest` なし  | 体幹代替処理                |
| `neck` なし        | 頭部制限                    |
| 肩なし             | 肩補正代替処理              |
| 指末端欠落         | 曲げ再分配                  |
| 一般 VRM 1.0       | 初期姿勢の回転 / ノード階層 |
| 揺れ物の多いモデル | 肩・頭の角速度影響          |
| 制約の多いモデル   | 更新後差分                  |

取り組み計画でも、小柄 VRoid、頭が大きいモデル、`upperChest` なしモデルで同じ再生ログを比較し、調整情報差分によって腕の伸び切り、顔めり込み、肩崩れを調整できることが完了条件として挙げられています。

### 9.2 動作再生テスト

| ケース                       | 主な観測項目                            |
| ---------------------------- | --------------------------------------- |
| 中立姿勢 10 秒               | 胴体・頭部・手首細かな揺れ              |
| ゆっくり手を上げる           | 肩 / `upperChest` / `upperArm` の連続性 |
| 高速手振り                   | 角速度の急増 / 揺れ物過揺れ             |
| 手を顔前へ出す               | 奥行き圧縮 / nearFace 安全性            |
| 片手を画面外へ出す           | 未検出 -> 代替処理 -> 回復              |
| 腕を交差する                 | 左右同定 / 手所有権                     |
| 横を向く                     | bodyFront 反転 / 体幹ヨー               |
| 手をカメラ方向に出す         | 奥行き曖昧さ / 到達距離制限             |
| ジェスチャークリップ同時実行 | 追跡と意味に基づく動作のボーン所有権    |
| VRM Animation 評価用         | 評価用姿勢差分の正規化                  |

### 9.3 デバッグ評価指標

| 指標                           | 用途                         |
| ------------------------------ | ---------------------------- |
| 適用済みクォータニオンの角速度 | 細かな揺れ / 急回転検出      |
| `clampedBones`                 | 制限に張り付くボーンの特定   |
| `missingBoneFallbackCount`     | 任意代替処理の発生状況       |
| `normalizedPoseBeforeLimit`    | ソルバー出力の妥当性         |
| `normalizedPoseAfterLimit`     | 値の制限後の品質確認         |
| `rawPoseAfterUpdate`           | 正規化済み -> 未加工転送確認 |
| `springJitterAfterMotion`      | 揺れ物のボーン干渉評価       |
| AnimationMixerの所有権         | クリップが書くボーンの確認   |
| `recoveryJumpAngle`            | 一時欠損復帰品質             |
| `profileId / calibrationId`    | 再生比較の再現性             |

three-vrm 実装では MediaPipe 特徴点可視化だけでは不十分で、`VRMHumanBoneName` ごとのボーン存在、正規化済み姿勢、未加工姿勢、制限前後、AnimationMixer 所有権、`vrm.update()` 呼び忘れ検出などをデバッグに出すべきです。

---

## 10. sincromisor-frontend への実装提案

### 10.1 既存構成を活かす

既存資料は、大きな `src/mocap` へ作り替えるより、既存の責務境界を保ちながら中間層を追加する方針を推奨しています。これは現在の `src/character`、`src/features/gaze`、`src/pages/motionDebug` の構成と整合します。 ([GitHub][6])

実装順は次が安全です。

1. `src/character/vrm/VrmHumanoidRig.ts`
   `VRMHumanBoneName` によるボーンの有無と対応機能と骨格の測定値を取得する。

2. `src/character/vrm/AvatarMotionProfile.ts`
   任意ボーン、初期姿勢のローカル回転、骨の長さ、演出初期値を保持する。

3. `src/character/vrm/VrmPoseBuffer.ts`
   所有ボーンを毎フレーム全ボーンを含む姿勢として出す。

4. `src/character/vrm/VrmPoseComposer.ts`
   追跡 / 代替処理 / 意味に基づく動作 / 待機動作 / 呼吸を合成し、最終値の制限を行う。

5. `src/character/vrm/VrmPoseApplier.ts`
   `setNormalizedPose(finalPose)` と `vrm.update(delta)` を唯一の適用経路にする。

6. `src/character/vrm/VrmDebugInspector.ts`
   正規化済み / 未加工 / 更新後 / 代替処理 / ミキサー所有権を記録する。

7. `src/character/vrm/VrmClipPoseLayer.ts`
   ジェスチャー / 呼吸 / 任意 VRM Animation 評価用を姿勢差分として供給する。

### 10.2 パッケージバージョン注意

`package.json` では `@pixiv/three-vrm` が `^3.5.1` として指定されています。2026-06-14 時点の GitHub 公開では v3.5.3 が確認できるため、実装設計の対象を v3.5.3 とするのは妥当ですが、実際に使われるバージョンは `package-lock.json` の解決結果も確認してください。([GitHub][2])

three-vrm v3 は WebGPU 対応も含みますが、公式 README では WebGPURenderer 用の MToonNodeMaterial や Three.js r167+ 依存、NodeMaterial 周辺の互換性注意が示されています。モーション実装の安定性を優先する段階では、まず WebGLRenderer + 正規化済み人型骨格姿勢を標準経路にする判断が堅実です。([GitHub][9])

---

## 11. 最終採用判断

| 論点                                  | 判断                                            |
| ------------------------------------- | ----------------------------------------------- |
| `setNormalizedPose()` 主経路          | 採用                                            |
| `VRMHumanBoneName` 唯一識別子         | 採用                                            |
| 未加工ボーン通常制御                  | 不採用                                          |
| ワールド回転直接コピー                | 不採用                                          |
| `normalizedRestPose` を姿勢入力に使う | 不採用                                          |
| 所有ボーンを毎フレーム全書き          | 採用                                            |
| 一部のボーンだけを含む姿勢継続上書き  | 不採用                                          |
| `VrmPoseComposer` 一点合成            | 採用                                            |
| ボーンの可動域制限                    | 合成後値の制限を標準、ソルバー内値の制限も併用  |
| AnimationMixer 直接本番 VRM 適用      | 原則不採用                                      |
| VRM Animation                         | 評価用評価なら採用可                            |
| 加算クリップ                          | 小振幅意味に基づく動作 / 待機動作に限定して採用 |
| 任意ボーン代替処理                    | 必須                                            |
| AvatarMotionProfile                   | 必須                                            |
| 揺れ物 / 制約 / 表情                  | 更新順序と所有権を明示して分離                  |

最終的には、**three-vrm に渡す時点で、すでに `VRMHumanBoneName` をキーとするの正規化済みローカル姿勢として成立している**ことを実装上の合格条件にしてください。three-vrm は「不確実な観測値を解釈する場所」ではなく、VRM 1.0 人型骨格仕様、任意ボーン、初期姿勢の回転、実行時更新順序を尊重しながら、最終姿勢を安全にモデルへ反映する実行時境界です。既存レポートの最終アーキテクチャでも、この責務分離が推奨されています。

[1]: https://pixiv.github.io/three-vrm/docs/types/three-vrm.VRMPose.html "VRMPose | @pixiv/three-vrm"
[2]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/package.json "Sincromisor/sincromisor-frontend/package.json at main · Sincromisor/Sincromisor · GitHub"
[3]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[4]: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/src/VRM.ts "three-vrm/packages/three-vrm/src/VRM.ts at release · pixiv/three-vrm · GitHub"
[5]: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm-core/src/VRMCore.ts "three-vrm/packages/three-vrm-core/src/VRMCore.ts at release · pixiv/three-vrm · GitHub"
[6]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character "Sincromisor/sincromisor-frontend/src/character at main · Sincromisor/Sincromisor · GitHub"
[7]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md "vrm-specification/specification/VRMC_vrm-1.0/humanoid.md at master · vrm-c/vrm-specification · GitHub"
[8]: https://pixiv.github.io/three-vrm/docs/functions/three-vrm-animation.createVRMAnimationClip.html "createVRMAnimationClip | @pixiv/three-vrm"
[9]: https://github.com/pixiv/three-vrm "GitHub - pixiv/three-vrm: Use VRM on Three.js · GitHub"
