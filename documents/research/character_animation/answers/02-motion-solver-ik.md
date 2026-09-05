# 調査レポート：sincromisor-frontend 動作算出処理 / IK / 関節制約設計

調査時点: **2026-06-14**
対象: **Sincromisor / sincromisor-frontend / sincro モード上半身キャラクターアニメーション**
主対象: **MediaPipe Pose / Hand / Face / Gesture → 身体のローカル座標系での標準状態 → VRM 1.0 正規化済みローカル姿勢 → Three.js + @pixiv/three-vrm**

## 0. 結論

`sincro` モードの腕・肩・手首・指の品質改善では、IKそのものを高度化するより、**IK前段の信頼度評価・体幹ローカル化・曲がる方向の状態管理・到達距離制御・補正分配・デバッグ記録**を明示的に設計する方が効果が大きいです。添付 `02-motion-solver-ik.md` は、肘反転、肩崩れ、腕の伸び切り、手首ロール暴れ、指ちらつきを避けるため、2ボーンの解析的IK、曲がる方向ベクトル、到達距離制限、緩やかな制限、肩胸補正、手首ねじれ、指曲げ制御を具体化する依頼です。

推奨する実装方針は次です。

```text
MediaPipe 観測値
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> AvatarMotionProfile
  -> MotionSolver
      体幹 / 肩 / 腕 IK / 手首 / 指
  -> VrmPoseComposer
  -> VRMHumanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
```

既存取り組み計画でも、MediaPipe 特徴点を直接 VRM ボーンに流すのではなく、信頼性、身体のローカル座標系での標準状態、時系列状態、動作意図、アバターの調整情報、IK・FK・加算アニメーションを経て VRM 正規化済みのローカル回転へ落とす方針が定義されています。さらに、IKは中核ではなく、信頼性 / 標準化 / 較正 / 時系列状態の後段に置く姿勢適用器として扱うべきと整理されています。

---

## 1. 現状実装の確認

### 1.1 技術スタック

`sincromisor-frontend/package.json` では、`@mediapipe/tasks-vision` が `^0.10.34`、`@pixiv/three-vrm` が `^3.5.1`、`three` が `^0.182.0` として宣言されています。([GitHub][1]) three-vrm 上流では `v3.5.3` が 2026-05-18 時点の最新リリースと表示されており、現在の `^3.5.1` 指定はセマンティックバージョニング上は新しいパッチへ解決可能ですが、依存バージョンの固定ファイル運用次第では実体バージョン確認が必要です。([GitHub][2])

MediaPipe Pose Landmarker は Web/JavaScript 向けに身体特徴点を画像座標と 3D ワールド座標として出力します。([Google AI for Developers][3]) Hand Landmarker は左右判定、21点の手の特徴点、ワールド座標の特徴点を返し、`detectForVideo()` は同期実行でUIスレッドをブロックしうるため、実運用ではWeb Worker分離が有効です。([Google for Developers][4]) Face Landmarker は 3D 顔の特徴点、ブレンドシェイプスコア、顔の変換行列を出力します。([Google AI for Developers][5]) Gesture Recognizer はジェスチャー分類、左右判定、画像・ワールド座標の手の特徴点を出力します。([Google AI for Developers][6])

### 1.2 既存ディレクトリ構造

現行リポジトリには、すでに `src/character/ik` があり、`sincroArmIkSolver.ts`、`sincroArmIkGeometry.ts`、`sincroArmIkPole.ts`、`sincroArmIkConstraint.ts`、`sincroCcdIkProbe.ts` などが配置されています。([GitHub][7]) `src/character/retargeting` には `sincroPoseArmIkSolve.ts`、`sincroPoseArmRetargeter.ts`、`sincroPoseRetargetUpperBody.ts` などがあり、Pose由来の腕・上半身リターゲット経路が存在します。([GitHub][8]) `src/features/gaze` には `poseTracking`、`faceTracking`、`trackingRuntime` があり、取り組み計画で示された既存責務境界とも整合しています。([GitHub][9])

`motionDebug` ページも存在し、`motionDebugCameraStream.ts`、`motionDebugFrameCapture.ts`、`poseOverlayRenderer.ts` などが置かれています。([GitHub][10]) 既存資料でも、最初に作るべきものはアルゴリズム改善そのものではなく、MediaPipe スナップショット、動作の変換フレーム、最終姿勢、映像メタデータを保存・再生し、中立姿勢での細かな揺れ、肘の反転回数、復帰時の急変、角速度の急増、到達距離制限の発生率を計測できる評価基盤だとされています。

### 1.3 既存IKの評価

現行 `SincroArmIkSolver` は、VRM 正規化済みボーンの現在姿勢を基準に、MediaPipe由来の肩相対目標を上腕・前腕のローカルクォータニオンに変換する 2本のボーンによるソルバーとして実装されています。既定値は `maxUpperArmDeltaRad = 142°`、`maxLowerArmDeltaRad = 132°`、`minReachRatio = 0.2`、`maxReachRatio = 0.985`、`overheadMinReachRatio = 0.9`、`poleFlipDotThreshold = -0.08` です。([GitHub][11])

`clampArmIkTarget()` は上腕長・前腕長から到達距離を制限し、`elbowPosition()` は余弦定理に相当する式で肘位置を求めています。目標方向と曲がる方向から `shoulderToElbow` と `elbowHeight` を計算する構成は、2ボーンの解析的IKとして妥当です。([GitHub][12]) `resolveArmIkPoleDirection()` は elbowPole を目標方向に垂直な平面へ射影し、前フレームまたは初期姿勢の曲がる方向への急反転を `poleFlipDotThreshold` で抑制する実装になっています。([GitHub][13])

ただし現状は、`Stable / Uncertain / Extended / Lost / Recovering` のような**明示的な曲がる方向の状態機械**が不足しています。また、手首ロール、前腕ねじれ、指曲げ・開き、肩・`upperChest`・胸への動作分配は、個別ソルバとしてはまだ弱いです。既存 `retargetPoseArm()` は `feature_only`、`world_3d_ik`、`screen_space_ik` を切り替え、ワールド座標 IKではソルバー結果の上腕・前腕クォータニオンを合成しますが、手首は主に `wristRaise` のz回転補助に留まっています。([GitHub][14])

---

## 2. three-vrm / VRM 1.0 適用方針

three-vrmでは `VRMHumanoid` が正規化済みボーンと未加工ボーンを持ち、`autoUpdateHumanBones` が有効な場合、更新時に正規化済みボーンの姿勢を未加工ボーンへ転送します。([Pixiv][15]) `setNormalizedPose()` が受け取る各変換は初期姿勢 / T-pose からのローカル変換であり、`setRawPose()` は `autoUpdateHumanBones` と競合しやすいため、通常制御では `setNormalizedPose()` を使うべきです。([Pixiv][15])

VRM-1.0の人型骨格仕様では、`hips` と `spine` は必須ですが、`chest`、`upperChest`、`neck` は任意で、`upperChest` は `chest` がある場合のみ存在できます。([GitHub][16]) VRM Animation側の説明でも、`upperChest` や `leftShoulder` などの任意ボーンはモデル間で存在有無が異なり、初期姿勢の回転や任意ボーン差分がある場合、同じ姿勢データをそのまま使えないとされています。([GitHub][17])

したがって、IK ソルバーの出力は three-vrm 未加工ノードへ直接書かず、**`VRMHumanBoneName` 単位の正規化済みローカル姿勢** に集約します。three-vrmの `getNormalizedBoneNode()` は指定した `VRMHumanBoneName` の正規化済みボーンノードを返し、`getNormalizedPose()` は初期姿勢 / T-pose からの相対ローカル変換を返します。([Pixiv][15]) 添付three-vrmレポートでも、`setNormalizedPose(finalPose)` を主経路にし、`normalizedRestPose` を姿勢入力として使わず、自前の姿勢バッファで所有ボーンを毎フレーム埋める方針が推奨されています。

---

## 3. 腕IK設計

### 3.1 入力と座標

腕IKの入力は、Pose由来の肩 / 肘 / 手首を主に使い、Hand Landmarker は手首姿勢と指制御に限定します。既存資料でも、Hand Landmarker の手首を腕IK 目標に直接使うより、全身座標と整合しやすい Pose 手首をIK 目標にする方針が推奨されています。

標準化した入力は次です。

```ts
type ArmSolverInput = {
    side: "left" | "right";
    shoulderLocal: Vector3; // avatar shoulder local origin
    wristTargetLocal: Vector3; // body-local -> avatar shoulder-local
    measuredElbowLocal?: Vector3;
    measuredPalmBasis?: Matrix3;
    confidence: {
        shoulder: number;
        elbow: number;
        wrist: number;
        hand: number;
    };
    previous: {
        pole: Vector3;
        elbowFlexionRad: number;
        wristRotation: Quaternion;
    };
};
```

座標変換は、`camera space -> body-local -> avatar shoulder-local -> VRM normalized local rotation` の順に固定します。既存report01でも、カメラ空間から直接アバターローカルボーンへ行かず、カメラ特徴点を身体のローカル座標系の測定値、正規化済み人間姿勢、アバター固有の動作の変換、VRM ボーンローカル回転へ段階的に変換する方針が示されています。

### 3.2 2ボーンの解析的IK

各腕は、肩 `S`、手首目標 `T`、上腕長 `L1`、前腕長 `L2`、曲がる方向ベクトル `P` で解きます。

```text
v = T - S
d0 = length(v)
d = clampReach(d0)

a = normalize(v)                                      // shoulder -> wrist
p = normalize(projectToPlane(pole, normal = a))       // elbow plane
x = (L1^2 - L2^2 + d^2) / (2d)
h = sqrt(max(L1^2 - x^2, 0))

E = S + a * x + p * h
upperDir = normalize(E - S)
lowerDir = normalize(T - E)
```

現行 `sincroArmIkGeometry.ts` もこの構成に近く、`shoulderToElbow = (L1² - L2² + reach²) / (2 * reach)` と `elbowHeight = sqrt(max(L1² - shoulderToElbow², 0))` から肘位置を作っています。([GitHub][12]) したがって、**IK数学自体は現行実装を継続**し、問題は目標 / 曲がる方向 / 制限 / 代替処理の状態管理に移すべきです。

### 3.3 到達距離制限

推奨初期値は次です。

| 項目                    | 初期値 |  推奨レンジ | 備考                         |
| ----------------------- | -----: | ----------: | ---------------------------- |
| `minReachRatio`         |   0.20 |   0.16–0.24 | 体に近すぎる目標を防ぐ       |
| `maxReachRatio`         |  0.975 | 0.965–0.985 | 完全伸展を避ける             |
| `overheadMinReachRatio` |   0.88 |   0.84–0.92 | 腕上げ時に肩へ潰れるのを防ぐ |
| `armReachScale`         |   0.92 |   0.88–0.96 | VRoid小柄モデル向け          |
| `depthCompression`      |   0.60 |   0.45–0.75 | 単眼zの過大反映を抑える      |
| `lateralScale`          |   0.90 |   0.80–0.98 | 肩幅差を吸収                 |
| `verticalScale`         |   0.95 |   0.90–1.00 | 手上げ感を残す               |

既存report03でも、VRoid系では到達距離・肩幅・奥行きを圧縮し、`arm reach scale = 0.92`、`depth compression = 0.60`、`elbow outward bias = 0.25` を初期値にすることが推奨されています。 現行実装の `maxReachRatio = 0.985` は安全側としては許容できますが、肘反転と腕の伸び切りをより抑えるなら、通常時は `0.975`、高信頼・横広げ時のみ `0.985` まで許容する二段制御がよいです。([GitHub][11])

### 3.4 目標倍率調整

MediaPipe ワールド座標 z は直接信用しない設計にします。身体のローカル座標系で表す手首目標をアバター肩のローカル座標系に写す際は、次のように部位別スケールをかけます。

```text
avatarTarget.x = humanLocal.x * lateralScale
avatarTarget.y = humanLocal.y * verticalScale
avatarTarget.z = humanLocal.z * depthCompression
avatarTarget   = clampToReach(avatarTarget, armReachScale)
```

既存report03は、手を前に出す/横に広げる判定を単一値ではなく `sideScore` と `forwardScore` で行い、横広げは `openness > 0.55 && forwardness < 0.35`、前出しは `forwardness > 0.45 && openness < 0.55`、斜め前は両方が `0.35` 超とする目安を示しています。前出し具合はヒステリシスを入れ、前方向に入る閾値を `0.50`、抜ける閾値を `0.35` にします。

---

## 4. 肘反転防止

### 4.1 曲がる方向ベクトルの定義

測定曲がる方向は次で定義します。

```text
targetDir = normalize(wristTarget - shoulder)
measuredPoleRaw = measuredElbow - shoulder
measuredPole = normalize(
  measuredPoleRaw - targetDir * dot(measuredPoleRaw, targetDir)
)
```

代替処理曲がる方向は身体のローカル座標系の `R`、`U`、`F` を使い、肘が体の外側・やや下・わずか前へ出るようにします。

```text
leftFallbackPole  = normalize(-R * 0.8 + -U * 0.2 + F * 0.1)
rightFallbackPole = normalize( R * 0.8 + -U * 0.2 + F * 0.1)
```

この代替処理式は既存report03でも提示されており、左右の肘が体の外側へ出るように設計されています。 現行 `bindPoleFromArm()` も、実測曲がる方向が使えない場合に左は `(-1, 0, 0)`、右は `(1, 0, 0)` を代替処理にしており、方向性は整合しています。([GitHub][12])

### 4.2 曲がる方向の状態ごとの合成比率

`ArmPoleState` を導入し、毎フレーム `measured / previous / fallback` を状態に応じて合成します。

| 状態         | 条件                                     |  測定済み | 前フレームの値 |  代替処理 |
| ------------ | ---------------------------------------- | --------: | -------------: | --------: |
| `Stable`     | 腕信頼度 > 0.75、肘角安定、非伸展        |      0.70 |           0.25 |      0.05 |
| `Uncertain`  | 0.45–0.75、奥行き不安定、手が顔前/画面端 |      0.35 |           0.50 |      0.15 |
| `Extended`   | 肘屈曲 < 18° または reachRatio > 0.94    |      0.15 |           0.60 |      0.25 |
| `Lost`       | 信頼度 < 0.45 が3フレーム以上            |      0.00 |           0.70 |      0.30 |
| `Recovering` | 再検出後200–400ms                        | 0.20→0.70 |      0.60→0.20 | 0.20→0.10 |

既存report03にも、Stable / Uncertain / Extended / Lost / Recovering の曲がる方向合成比率が示されており、上表はその範囲を初期値として具体化したものです。

### 4.3 急反転除外条件

`dot(measuredPole, previousPole) < 0` は、角度差が90°を超えることを意味するため、急反転検出として妥当です。ただし、それだけで常時除外すると、横向き・腕交差・大きな姿勢変化で追従が鈍くなるため、次の二段判定にします。

```text
poleDot = dot(measuredPole, previousPole)
poleAngularDelta = angle(measuredPole, previousPole)
elbowFlexion = π - angle(upperDir, lowerDir)

if elbowFlexion < 15°:
    measuredWeight = 0

else if poleDot < 0.0:
    measuredWeight *= 0.1

else if poleAngularDelta > 60° / frame:
    measuredWeight *= 0.2

else if poleAngularVelocity > 900°/s:
    measuredWeight *= 0.35
```

既存report03でも、`dot(measuredPole, previousPole) < 0` の場合は測定済み曲がる方向を拒否または大幅減衰し、`angularChange > 60°/frame` では測定済み重みを `0.2` 倍、`elbowFlexion < 15°` では前フレームの値 + 代替処理優先とする条件が示されています。 現行実装の `poleFlipDotThreshold = -0.08` は約94.6°超の反転を抑える閾値なので、完全に除外閾値としては継続可能です。([GitHub][11]) ただし、状態機械を導入する場合は `dot < 0.25` 程度から重みを緩やかに低下を始め、`dot < -0.08` を継続不可安定化した扱いにする方が滑らかです。

---

## 5. 緩やかな制限 / 関節制約

### 5.1 肩 / `upperArm`

現行実装は `maxUpperArmDeltaRad = 142°` を強制制限としています。([GitHub][11]) これは破綻防止の最終防波堤としてはよいですが、通常姿勢では手前に緩やかな制限を置きます。

| 制約                    | 制限して継続 |   継続不可 | 備考                 |
| ----------------------- | -----------: | ---------: | -------------------- |
| `upperArm` 振り回し合計 |         125° |       142° | 継続不可は現行維持   |
| `upperArm` 持ち上げ     |   -35°〜115° | -45°〜130° | 手下げ/手上げ        |
| `upperArm` 開いた       |   -35°〜105° | -45°〜120° | 体内側へ入りすぎない |
| `upperArm` 奥行き       |    -45°〜70° |  -60°〜85° | 前出しの過大化を抑制 |

現行 `SincroArmIkConstraintResolver` には、肩目標の開き・持ち上げ・奥行き制限、頭部・胸侵入禁止領域、衝突・関節・曲がる方向安定化した時の重み倍率がすでにあります。初期値は `minShoulderOpenRatio = -0.34`、`maxShoulderOpenRatio = 0.97`、`minShoulderLiftRatio = -0.62`、`maxShoulderLiftRatio = 0.99`、`maxShoulderDepthRatio = 0.78` です。([GitHub][18]) これらは「目標制約」として残し、ボーンクォータニオン側の制限して継続発生率も別途ログ化します。

### 5.2 肘 / `lowerArm`

現行実装は `maxLowerArmDeltaRad = 132°` を強制制限とし、`localQuaternionFromParentDirection()` で中立姿勢のクォータニオンからの角度差を制限しています。([GitHub][11]) ただし、肘は「回転角上限」だけではなく、**伸び切り回避**が重要です。

推奨値:

| 項目                            |                              初期値 |
| ------------------------------- | ----------------------------------: |
| 最小見た目の肘屈曲              |                              12–18° |
| Extended状態への移行            | 屈曲 < 18° または reachRatio > 0.94 |
| Extended 状態 exit              | 屈曲 > 28° および reachRatio < 0.90 |
| `lowerArm` 回転差の強制上限     |                                132° |
| `lowerArm` 回転差の緩やかな上限 |                            118–124° |

### 5.3 手首

手首は単眼カメラで最も暴れやすいため、腕IKとは別ソルバーにします。

| 回転              |  通常反映 | 最大角 | 低信頼時             |
| ----------------- | --------: | -----: | -------------------- |
| 手首ピッチ        |      0.55 |   ±45° | 前フレームの値へ保持 |
| 手首ヨー          |      0.45 |   ±40° | 前腕方向から推定     |
| 手首ロール        | 0.25–0.40 |   ±35° | 0へ減衰              |
| `lowerArm` ねじれ | 0.20–0.35 |   ±25° | 前フレームの値へ保持 |

既存report03でも `wrist roll influence = 0.40` が初期値として示されていますが、これは高信頼時の上限と見なし、通常は `0.25–0.35` から開始する方が安定です。

---

## 6. 肩・鎖骨・胸補正

### 6.1 基本分配

VRoid系モデルでは `upperArm` だけを回すと肩・胸・袖まわりが破綻しやすいため、腕の仰角に応じて `shoulder / upperChest / chest / spine` に補助回転を分配します。three-vrmレポートでは、`spine + chest + upperChest` がある場合に `spine = 0.25`、`chest = 0.40`、`upperChest = 0.35` へ体幹回転を分配し、片腕上げ時は肩と `upperChest` に寄せ、両腕上げ時だけ胸を少し使う方針が示されています。

腕上げ補正の基本式:

```text
armRaiseAssist = smoothstep(30°, 110°, armElevation)
```

| ケース         |                     肩 |      `upperChest` |    胸 | 背骨 |
| -------------- | ---------------------: | ----------------: | ----: | ---: |
| 片腕を上げる   |                 10–16° |              4–8° |  0–4° | 0–2° |
| 両腕を上げる   |           左右各12–20° |             8–14° | 4–10° | 0–3° |
| 手を前に出す   |     前方へ動かす 4–10° |         前方 3–8° |  2–6° | 0–2° |
| 腕を横に広げる | 外向き・持ち上げ 6–14° | ロール・ヨー 2–6° |  0–3° |   0° |
| 斜め前         |    上記を 0.5:0.5 合成 |                   |       |      |

three-vrmレポートでも `armRaiseAssist = smoothstep(30°, 110°, armElevation)`、`shoulderLift = 10〜20°`、`upperChest = 6〜18°`、`chest = 0〜12°` が目安として示されています。

### 6.2 任意ボーン代替処理

`leftShoulder/rightShoulder` が存在する場合は肩補正に使います。ない場合は `upperChest` と `upperArm` 側へ逃がします。`upperChest` がない場合は `chest` へ、`chest` もない場合は `spine` へ集約します。three-vrmレポートでも、VRMHumanBoneNameでボーン存在確認を行い、体幹、首・頭部、肩、腕、指を存在するボーンへ分配する方針が示されています。

推奨代替処理:

| ボーン構成                         | 処理                                               |
| ---------------------------------- | -------------------------------------------------- |
| 肩あり                             | 肩 70%、`upperChest` 30%                           |
| 肩なし + `upperChest`あり          | `upperChest` 60%、`upperArm` 目標補正 40%          |
| 肩なし + `upperChest`なし + 胸あり | 胸 45%、`upperArm` 目標補正 55%                    |
| 背骨のみ                           | 体幹補正は弱くし、`upperArm`側緩やかな制限を強める |

### 6.3 侵入禁止領域

現行制約には頭部・胸侵入禁止領域があり、`headRadiusRatio = 0.38`、`chestRadiusXRatio = 0.56`、`chestRadiusYRatio = 0.72`、`chestRadiusZRatio = 0.42`、`handRadiusRatio = 0.18`、`forearmRadiusRatio = 0.14` が定義されています。([GitHub][18]) これは継続し、次をデバッグに出します。

```text
headPenetration
chestPenetration
targetPushDistance
collisionAvoided
constraint.reasons[]
```

侵入禁止領域は物理衝突ではなく、**目標を外へ押し戻す軽量補正**として扱います。手が顔前にあるとHand/Faceの観測も不安定になるため、衝突補正時は手首ロールと指指の開きの重みも下げます。

---

## 7. 手首・前腕ねじれ

### 7.1 手のひらの基底

Hand Landmarker の21点から、手のひら基底を作ります。Hand Landmarkerは左右判定、21点特徴点、21点ワールド座標の特徴点を返すため、手首姿勢と指制御の入力として適しています。([Google for Developers][4])

推奨基底:

```text
wrist = landmark[0]
indexMcp = landmark[5]
middleMcp = landmark[9]
pinkyMcp = landmark[17]

palmX = normalize(indexMcp - pinkyMcp)
palmY = normalize(middleMcp - wrist)
palmN = normalize(cross(palmX, palmY))
```

信用する軸は `palmY` と `palmN`、最も捨てやすい軸は前腕軸まわりのロールです。手が横向きで手のひらの平面がカメラに対して側面を向いているになる場合、顔前で遮蔽される場合、手領域が小さい場合、手信頼度が低い場合は、ロールを観測から作らず前フレームの値 / 中立姿勢へ戻します。

### 7.2 手首 / `lowerArm` ねじれ分配

VRM 人型骨格には一般的なねじれ専用ボーンが標準化されていないため、`lowerArm`と手へ控えめに分配します。`VRMHumanBoneName` には `LeftLowerArm`、`LeftHand`、各指基節・中節・末節などが定義されています。([Pixiv][19])

推奨分配:

| 状態               | 手ロール | `lowerArm` ねじれ | 備考                  |
| ------------------ | -------: | ----------------: | --------------------- |
| 高信頼度           |     0.65 |              0.35 | ロール上限±35°        |
| 通常               |     0.75 |              0.25 | 初期設定              |
| 手側面を向いている |     0.35 |              0.10 | 前フレームの値優先    |
| 顔前 / 遮蔽された  |     0.20 |              0.00 | ロールを固定          |
| 小さい手           |     0.25 |              0.10 | 中立姿勢へ低速減衰    |
| 未検出             |     0.00 |              0.00 | 300–500msで自然姿勢へ |

ピッチ・ヨーは「手首から中指MCP方向」「前腕方向」から比較的安定して作り、ロールのみ強く抑制します。手首クォータニオンはIK結果に直接上書きせず、`forearmDir` に整合する手首基準姿勢へ手のひらの基底の差分を小さく加算合成します。

---

## 8. 指制御

### 8.1 初期実装粒度

初期段階では、各関節の3D回転を直接推定せず、**低次元の曲げ / 指の開き / 対向運動** に限定します。添付依頼でも、指は各関節の3D回転ではなく、曲げ / 指の開き / 対向運動から始める案を具体化することが求められています。

推奨する最小指グループ:

```ts
type FingerControl = {
    thumb: { curl: number; oppose: number; splay: number };
    index: { curl: number; splay: number };
    middle: { curl: number; splay: number };
    ringLittle: { curl: number; splay: number };
};
```

`ring` と `little` は初期段階ではまとめます。指のちらつきは腕や肩ほど致命的ではない一方、細かく追従させるほど不安定になるため、最初は `Open / Relaxed / Fist / Point / ThumbUp` 程度の意味状態と連続曲げを混ぜるのが安全です。

### 8.2 曲げ分配

| 指       |        基部 |    中間部 |      末端 |
| -------- | ----------: | --------: | --------: |
| 人差し指 |        0.50 |      0.32 |      0.18 |
| 中指     |        0.50 |      0.32 |      0.18 |
| 薬指     |        0.48 |      0.34 |      0.18 |
| 小指     |        0.48 |      0.34 |      0.18 |
| 親指     | 中手骨 0.35 | 基部 0.40 | 末端 0.25 |

指ボーンが不足するモデルでは、存在するボーンへ曲げを再分配します。three-vrmレポートでも、指は基節・中節・末節のうち存在するボーンだけに曲げを再分配する方針が示されています。

### 8.3 指の開き / 対向運動

| 制御               | 初期値 | 上限 |
| ------------------ | -----: | ---: |
| 人差し指指の開き   |   0–6° | ±12° |
| 中指指の開き       |   0–3° |  ±6° |
| 薬指・小指指の開き |   0–5° | ±10° |
| 親指の対向動作     |    18° |  35° |
| 親指指の開き       |     8° |  20° |

Gesture Recognizerはジェスチャー分類、左右判定、手の特徴点、ワールド座標の特徴点を返すため、意味状態の補助として使えます。([Google AI for Developers][20]) ただし、Gesture Recognizerの結果を指姿勢へ即時強制的に上書きするとちらつくため、`gestureConfidence > 0.75` が100–150ms継続した場合だけ意味に基づく動作状態を切り替えます。`fingerCurl` と `Gesture` が矛盾する場合は、連続曲げを優先し、ジェスチャーは「目標姿勢への偏りの補正」として使います。

---

## 9. 実装モジュール案

### 9.1 追加すべき状態

現行 `SincroArmIkTarget` は `wrist / elbowPole / weight` が中心です。([GitHub][21]) ここに直接全情報を詰めるより、IK前段に `CanonicalArmState` と `ArmTemporalState` を追加する方が保守しやすいです。

```ts
type ArmPoleState = "Stable" | "Uncertain" | "Extended" | "Lost" | "Recovering";

type CanonicalArmState = {
    side: "left" | "right";
    target: THREE.Vector3;
    measuredPole?: THREE.Vector3;
    fallbackPole: THREE.Vector3;
    confidence: number;
    reachRatio: number;
    elbowFlexionRad: number;
    forwardness: number;
    openness: number;
    elevation: number;
};

type ArmTemporalState = {
    poleState: ArmPoleState;
    previousPole: THREE.Vector3;
    blendedPole: THREE.Vector3;
    poleAngularVelocityRadPerSec: number;
    lostDurationMs: number;
    recoveringElapsedMs: number;
};
```

### 9.2 既存ファイルへの対応

| 既存領域                                               | 変更内容                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `features/gaze/poseTracking`                           | 未加工の特徴点から `CanonicalUpperBodyState` を作る前段へ拡張                   |
| `character/retargeting/sincroPoseArmIkSolve.ts`        | `wrist/elbowPole/weight` だけでなく `confidence/reachRatio/elbowFlexion` を渡す |
| `character/ik/sincroArmIkPole.ts`                      | `resolveArmIkPoleDirection()` を状態機械ベースに拡張                            |
| `character/ik/sincroArmIkConstraint.ts`                | 侵入禁止領域結果をデバッグへ詳細出力                                            |
| `character/retargeting/sincroPoseRetargetUpperBody.ts` | 腕仰角 / 前出し具合 / 両側の持ち上げ由来の肩・胸補正を追加                      |
| 新規 `WristPoseSolver.ts`                              | 手のひらの基底からピッチ・ヨー・ロールを低信頼度対応付きで作る                  |
| 新規 `FingerPoseSolver.ts`                             | 曲げ・開き・対向運動とGesture整合を行う                                         |
| `pages/motionDebug`                                    | 曲がる方向、到達距離、制約、手首、指評価指標を表示・保存                        |

現行 `DEFAULT_SINCRO_POSE_RETARGET_CONFIG` は `minConfidence = 0.45`、`returnToNeutralMs = 520`、`smoothingMs = 155`、`armIkStrength = 1.0`、`armIkMode = "world_3d_ik"` です。([GitHub][22]) この設定は継続しつつ、低信頼度時に即中立姿勢へ戻すのではなく、動作算出処理側で「控えめな自然姿勢」へ滑らかに退避する方針にします。three-vrmレポートでも、低信頼度時はthree-vrm層で急に中立姿勢へ戻さず、動作算出処理側で自然姿勢へ退避させることが推奨されています。

---

## 10. 部位別初期パラメータ表

| 領域              | パラメータ              |                                     初期値 |
| ----------------- | ----------------------- | -----------------------------------------: |
| 腕信頼度          | Stable                  |                                   `> 0.75` |
| 腕信頼度          | Uncertain               |                                `0.45–0.75` |
| 腕信頼度          | Lost                    |                       `< 0.45` が3フレーム |
| 復帰              | Recovering 継続時間     |                                `200–400ms` |
| 到達距離          | `minReachRatio`         |                                     `0.20` |
| 到達距離          | `maxReachRatio`         |                                    `0.975` |
| 到達距離          | `overheadMinReachRatio` |                                     `0.88` |
| アバター倍率      | `armReachScale`         |                                     `0.92` |
| アバター倍率      | `depthCompression`      |                                     `0.60` |
| 曲がる方向        | 外向き偏りの補正        |                                     `0.25` |
| 曲がる方向        | 完全に除外              |                              `dot < -0.08` |
| 曲がる方向        | 重みを緩やかに低下      |                               `dot < 0.25` |
| 肘                | Extendedへの移行        | `flexion < 18°` または `reachRatio > 0.94` |
| 肘                | Extendedからの離脱      | `flexion > 28°` および `reachRatio < 0.90` |
| `upperArm`        | 回転差の強制上限        |                                     `142°` |
| `upperArm`        | 回転差の緩やかな上限    |                                     `125°` |
| `lowerArm`        | 回転差の強制上限        |                                     `132°` |
| `lowerArm`        | 回転差の緩やかな上限    |                                     `120°` |
| 体幹              | 背骨・胸・`upperChest`  |                       `0.25 / 0.40 / 0.35` |
| 肩                | 腕持ち上げ補助          |                    `smoothstep(30°, 110°)` |
| 手首              | ロール反映率            |                                `0.25–0.40` |
| 手首              | 最大ロール              |                                     `±35°` |
| `lowerArm` ねじれ | 最大                    |                                     `±25°` |
| 指                | 曲げ平滑化              |                                 `80–140ms` |
| ジェスチャー      | 切り替えヒステリシス    |                                `100–150ms` |

---

## 11. VRoid系モデルで避けるべき破綻と対策

| 破綻                               | 原因                                         | 対策                                                         |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| 肘反転                             | 曲がる方向の奥行き不安定、腕伸展、再検出急変 | `ArmPoleState`、前フレームの値・代替処理合成、dot/角速度除外 |
| 肩崩れ                             | `upperArm`のみ回す                           | 肩 / `upperChest` / 胸補正                                   |
| 腕の伸び切り                       | 目標遠すぎ、奥行き過大                       | maxReach 0.975、depthCompression 0.60、Extended 状態         |
| 手首ロール暴れ                     | 手のひらの基底不安定、遮蔽、手が小さい       | ロール低反映、前フレームの値保持、低信頼時中立姿勢減衰       |
| 指ちらつき                         | 関節ごとの直接推定、ジェスチャー即時反映     | 曲げ・開き・対向運動低次元化、ヒステリシス                   |
| 顔・胸へのめり込み                 | 単眼zとキャラ体型差                          | 頭部球 / 胸楕円体侵入禁止領域                                |
| 任意ボーン差                       | `upperChest`・肩・指不足                     | ボーン存在確認と分配代替処理                                 |
| 小柄VRoidで手が届かない/届きすぎる | 人体とアバター比率差                         | 肩・腕・胴体・奥行きの部位別倍率                             |

既存report01でも、小柄VRoidモデル、`upperChest`なしモデル、手を顔前に出す、腕を交差する、カメラ方向に手を突き出す、片手を画面外に出す、といった固定テストケースが必要だと整理されています。

---

## 12. デバッグで記録すべき値

最低限、次を `motionDebug` の保存ログに含めます。

| カテゴリ     | デバッグ値                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| 入力         | 時刻、映像フレーム ID、Pose/Hand/Face/Gesture 信頼度                                                 |
| 身体の座標系 | `bodyRight/bodyUp/bodyFront`、前反転有無                                                             |
| 目標         | 未加工手首、倍率調整済み手首、制限済み目標、reachRatio、targetClamped                                |
| 曲がる方向   | measuredPole、previousPole、fallbackPole、blendedPole、poleDot、poleAngularVelocity、poleState       |
| 肘           | elbowFlexion、Extended 開始・終了、推定した肘位置                                                    |
| 制約         | jointLimited、poleStabilized、collisionAvoided、targetPushDistance、constraint.reasons               |
| 肩補正       | armElevation、armRaiseAssist、肩・胸・`upperChest` 度                                                |
| 手首         | palmBasis 信頼度、ピッチ・ヨー・ロール未加工、appliedRoll、lowerArmTwist                             |
| 指           | 曲げ・開き・対向運動未加工・適用済み、ジェスチャーカテゴリ、ジェスチャー信頼度、意味に基づく動作状態 |
| VRM          | 任意ボーン対応能力、最終姿勢前制限、最終姿勢後制限                                                   |
| 評価指標     | 肘の反転回数、到達距離制限の発生率、クォータニオン角速度、復帰時の急変角度、欠落した手継続時間       |

既存report01でも、手首目標の誤差、肘の反転回数、肩の制限が適用された割合、クォータニオンの角速度、手の観測欠落時間、復帰時の急変角度、信頼度で重み付けした平滑化量などを記録すべき評価指標として挙げています。

---

## 13. 実装優先順

1. **デバッグスキーマ拡張**
   曲がる方向、到達距離、制約、手首、指を記録できるようにする。アルゴリズム変更より先に行う。

2. **ArmPoleState導入**
   `Stable / Uncertain / Extended / Lost / Recovering` と合成表を実装し、現行 `resolveArmIkPoleDirection()` の前段で blendedPole を作る。

3. **到達距離 / 奥行き倍率調整整理**
   `armReachScale = 0.92`、`depthCompression = 0.60` を `AvatarMotionProfile` に置き、world_3d_ik 目標生成時に適用する。

4. **肩 / `upperChest` / 胸補正**
   `armElevation / forwardness / openness / bothArmsRaised` から補助回転を作り、任意ボーン代替処理付きで `VRMPose` に合成する。

5. **WristPoseSolver追加**
   Hand 手のひらの基底からピッチ・ヨー・ロールを作り、ロールは信頼度を考慮したにする。

6. **FingerPoseSolver追加**
   曲げ・開き・対向運動の低次元制御を実装し、Gesture Recognizerは意味に基づく動作偏りの補正として使う。

7. **固定ログ再生テスト**
   中立姿勢、片手上げ、両手上げ、横広げ、前出し、腕交差、顔前、画面外復帰、小柄VRoid、`upperChest`なしモデルで比較する。

最終的には、three-vrmへ入る時点で VRMHumanoidの正規化済みローカル姿勢として成立していることが重要です。three-vrmはMediaPipeの不確実性を解く場所ではなく、VRM-1.0 人型骨格仕様、任意ボーン、初期姿勢の回転、揺れ物・制約更新順を尊重して最終姿勢を安全に適用する層として扱います。

[1]: https://github.com/Sincromisor/Sincromisor/blob/main/sincromisor-frontend/package.json "Sincromisor/sincromisor-frontend/package.json at main · Sincromisor/Sincromisor · GitHub"
[2]: https://github.com/pixiv/three-vrm "GitHub - pixiv/three-vrm: Use VRM on Three.js · GitHub"
[3]: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[4]: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[5]: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[6]: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer "Gesture recognition task guide  |  Google AI Edge  |  Google for Developers"
[7]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character/ik "Sincromisor/sincromisor-frontend/src/character/ik at main · Sincromisor/Sincromisor · GitHub"
[8]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/character/retargeting "Sincromisor/sincromisor-frontend/src/character/retargeting at main · Sincromisor/Sincromisor · GitHub"
[9]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/features/gaze "Sincromisor/sincromisor-frontend/src/features/gaze at main · Sincromisor/Sincromisor · GitHub"
[10]: https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend/src/pages/motionDebug "Sincromisor/sincromisor-frontend/src/pages/motionDebug at main · Sincromisor/Sincromisor · GitHub"
[11]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts "raw.githubusercontent.com"
[12]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/ik/sincroArmIkGeometry.ts "raw.githubusercontent.com"
[13]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/ik/sincroArmIkPole.ts "raw.githubusercontent.com"
[14]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/retargeting/sincroPoseArmRetargeter.ts "raw.githubusercontent.com"
[15]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[16]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md "vrm-specification/specification/VRMC_vrm-1.0/humanoid.md at master · vrm-c/vrm-specification · GitHub"
[17]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md "vrm-specification/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md at master · vrm-c/vrm-specification · GitHub"
[18]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/ik/sincroArmIkConstraint.ts "raw.githubusercontent.com"
[19]: https://pixiv.github.io/three-vrm/docs/variables/three-vrm.VRMHumanBoneName.html "VRMHumanBoneName | @pixiv/three-vrm"
[20]: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google for Developers"
[21]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/retargeting/sincroPoseArmIkSolve.ts "raw.githubusercontent.com"
[22]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts "raw.githubusercontent.com"
