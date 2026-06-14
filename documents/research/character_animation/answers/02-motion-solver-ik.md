# 調査レポート：sincromisor-frontend Motion Solver / IK / 関節制約設計

調査時点: **2026-06-14**
対象: **Sincromisor / sincromisor-frontend / sincro モード上半身キャラクターアニメーション**
主対象: **MediaPipe Pose / Hand / Face / Gesture → body-local canonical state → VRM 1.0 normalized local pose → Three.js + @pixiv/three-vrm**

## 0. 結論

`sincro` モードの腕・肩・手首・指の品質改善では、IKそのものを高度化するより、**IK前段の信頼度評価・体幹ローカル化・pole状態管理・reach制御・補正分配・debug記録**を明示的に設計する方が効果が大きいです。添付 `02-motion-solver-ik.md` は、肘反転、肩崩れ、腕の伸び切り、手首roll暴れ、指ちらつきを避けるため、2-bone analytic IK、pole vector、reach clamp、soft limit、肩胸補正、wrist twist、指curl制御を具体化する依頼です。

推奨する実装方針は次です。

```text
MediaPipe observations
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> AvatarMotionProfile
  -> MotionSolver
      torso / shoulder / arm IK / wrist / fingers
  -> VrmPoseComposer
  -> VRMHumanoid.setNormalizedPose(finalPose)
  -> vrm.update(delta)
```

既存roadmapでも、MediaPipe landmark を直接 VRM bone に流すのではなく、Reliability、body-local canonical state、Temporal state、Motion intent、Avatar profile、IK/FK/additive animation を経て VRM normalized local rotations へ落とす方針が定義されています。さらに、IKは中核ではなく、reliability / canonicalization / calibration / temporal state の後段に置く姿勢適用器として扱うべきと整理されています。

---

## 1. 現状実装の確認

### 1.1 技術スタック

`sincromisor-frontend/package.json` では、`@mediapipe/tasks-vision` が `^0.10.34`、`@pixiv/three-vrm` が `^3.5.1`、`three` が `^0.182.0` として宣言されています。([GitHub][1]) three-vrm 上流では `v3.5.3` が 2026-05-18 時点の latest release と表示されており、現在の `^3.5.1` 指定は semver 上は新しい patch へ解決可能ですが、lockfile運用次第では実体バージョン確認が必要です。([GitHub][2])

MediaPipe Pose Landmarker は Web/JavaScript 向けに body landmarks を image coordinates と 3D world coordinates として出力します。([Google AI for Developers][3]) Hand Landmarker は handedness、21点の hand landmarks、world landmarks を返し、`detectForVideo()` は同期実行でUI threadをブロックしうるため、実運用ではWeb Worker分離が有効です。([Google for Developers][4]) Face Landmarker は 3D face landmarks、blendshape scores、facial transformation matrices を出力します。([Google AI for Developers][5]) Gesture Recognizer は gesture categories、handedness、image/world hand landmarks を出力します。([Google AI for Developers][6])

### 1.2 既存ディレクトリ構造

現行リポジトリには、すでに `src/character/ik` があり、`sincroArmIkSolver.ts`、`sincroArmIkGeometry.ts`、`sincroArmIkPole.ts`、`sincroArmIkConstraint.ts`、`sincroCcdIkProbe.ts` などが配置されています。([GitHub][7]) `src/character/retargeting` には `sincroPoseArmIkSolve.ts`、`sincroPoseArmRetargeter.ts`、`sincroPoseRetargetUpperBody.ts` などがあり、Pose由来の腕・上半身リターゲット経路が存在します。([GitHub][8]) `src/features/gaze` には `poseTracking`、`faceTracking`、`trackingRuntime` があり、roadmapで示された既存責務境界とも整合しています。([GitHub][9])

`motionDebug` ページも存在し、`motionDebugCameraStream.ts`、`motionDebugFrameCapture.ts`、`poseOverlayRenderer.ts` などが置かれています。([GitHub][10]) 既存資料でも、最初に作るべきものはアルゴリズム改善そのものではなく、MediaPipe snapshot、retarget frame、final pose、video metadata を保存・再生し、neutral jitter、elbow flip count、recovery jump、angular velocity spike、reach clamp occupancy を計測できる評価基盤だとされています。

### 1.3 既存IKの評価

現行 `SincroArmIkSolver` は、VRM normalized bone の現在姿勢を基準に、MediaPipe由来の肩相対 target を upper/lower arm の local quaternion に変換する two-bone solver として実装されています。既定値は `maxUpperArmDeltaRad = 142°`、`maxLowerArmDeltaRad = 132°`、`minReachRatio = 0.2`、`maxReachRatio = 0.985`、`overheadMinReachRatio = 0.9`、`poleFlipDotThreshold = -0.08` です。([GitHub][11])

`clampArmIkTarget()` は上腕長・前腕長から reach を clamp し、`elbowPosition()` は余弦定理に相当する式で肘位置を求めています。target方向とpole方向から `shoulderToElbow` と `elbowHeight` を計算する構成は、2-bone analytic IKとして妥当です。([GitHub][12]) `resolveArmIkPoleDirection()` は elbowPole を target方向に垂直な平面へ射影し、前フレームまたはbind poleへの急反転を `poleFlipDotThreshold` で抑制する実装になっています。([GitHub][13])

ただし現状は、`Stable / Uncertain / Extended / Lost / Recovering` のような**明示的なpole状態機械**が不足しています。また、手首roll、forearm twist、指curl/splay、肩・upperChest・chestへの動作分配は、個別ソルバとしてはまだ弱いです。既存 `retargetPoseArm()` は `feature_only`、`world_3d_ik`、`screen_space_ik` を切り替え、world IKでは solver結果の upper/lower quaternion をblendしますが、wristは主に `wristRaise` のz回転補助に留まっています。([GitHub][14])

---

## 2. three-vrm / VRM 1.0 適用方針

three-vrmでは `VRMHumanoid` が normalized bones と raw bones を持ち、`autoUpdateHumanBones` が有効な場合、update時に normalized bones のposeを raw bones へ転送します。([Pixiv][15]) `setNormalizedPose()` が受け取る各transformは rest pose / T-pose からの local transform であり、`setRawPose()` は `autoUpdateHumanBones` と競合しやすいため、通常制御では `setNormalizedPose()` を使うべきです。([Pixiv][15])

VRM-1.0のhumanoid仕様では、`hips` と `spine` はrequiredですが、`chest`、`upperChest`、`neck` はoptionalで、`upperChest` は `chest` がある場合のみ存在できます。([GitHub][16]) VRM Animation側の説明でも、`upperChest` や `leftShoulder` などのnon-required bonesはモデル間で存在有無が異なり、rest rotation やoptional bone差分がある場合、同じpose dataをそのまま使えないとされています。([GitHub][17])

したがって、IK solver の出力は three-vrm raw node へ直接書かず、**`VRMHumanBoneName` 単位の normalized local pose** に集約します。three-vrmの `getNormalizedBoneNode()` は指定した `VRMHumanBoneName` の normalized bone node を返し、`getNormalizedPose()` は rest pose / T-pose からの相対local transformを返します。([Pixiv][15]) 添付three-vrmレポートでも、`setNormalizedPose(finalPose)` を主経路にし、`normalizedRestPose` をpose入力として使わず、自前のpose bufferで所有boneを毎フレーム埋める方針が推奨されています。

---

## 3. 腕IK設計

### 3.1 入力と座標

腕IKの入力は、Pose由来の shoulder / elbow / wrist を主に使い、Hand Landmarker は手首姿勢と指制御に限定します。既存資料でも、Hand Landmarker の wrist を腕IK targetに直接使うより、全身座標と整合しやすい Pose wrist をIK targetにする方針が推奨されています。

標準化した入力は次です。

```ts
type ArmSolverInput = {
  side: "left" | "right";
  shoulderLocal: Vector3;      // avatar shoulder local origin
  wristTargetLocal: Vector3;   // body-local -> avatar shoulder-local
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

座標変換は、`camera space -> body-local -> avatar shoulder-local -> VRM normalized local rotation` の順に固定します。既存report01でも、camera spaceから直接avatar local boneへ行かず、camera landmarksをbody-local measurements、normalized human pose、avatar-specific retarget、VRM bone local rotationsへ段階的に変換する方針が示されています。

### 3.2 2-bone analytic IK

各腕は、肩 `S`、手首target `T`、上腕長 `L1`、前腕長 `L2`、pole vector `P` で解きます。

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

現行 `sincroArmIkGeometry.ts` もこの構成に近く、`shoulderToElbow = (L1² - L2² + reach²) / (2 * reach)` と `elbowHeight = sqrt(max(L1² - shoulderToElbow², 0))` から肘位置を作っています。([GitHub][12]) したがって、**IK数学自体は現行実装を継続**し、問題は target / pole / limit / fallback の状態管理に移すべきです。

### 3.3 reach clamp

推奨初期値は次です。

| 項目                      |   初期値 |       推奨レンジ | 備考              |
| ----------------------- | ----: | ----------: | --------------- |
| `minReachRatio`         |  0.20 |   0.16–0.24 | 体に近すぎるtargetを防ぐ |
| `maxReachRatio`         | 0.975 | 0.965–0.985 | 完全伸展を避ける        |
| `overheadMinReachRatio` |  0.88 |   0.84–0.92 | 腕上げ時に肩へ潰れるのを防ぐ  |
| `armReachScale`         |  0.92 |   0.88–0.96 | VRoid小柄モデル向け    |
| `depthCompression`      |  0.60 |   0.45–0.75 | 単眼zの過大反映を抑える    |
| `lateralScale`          |  0.90 |   0.80–0.98 | 肩幅差を吸収          |
| `verticalScale`         |  0.95 |   0.90–1.00 | 手上げ感を残す         |

既存report03でも、VRoid系では reach・肩幅・奥行きを圧縮し、`arm reach scale = 0.92`、`depth compression = 0.60`、`elbow outward bias = 0.25` を初期値にすることが推奨されています。 現行実装の `maxReachRatio = 0.985` は安全側としては許容できますが、肘反転と腕の伸び切りをより抑えるなら、通常時は `0.975`、高信頼・横広げ時のみ `0.985` まで許容する二段制御がよいです。([GitHub][11])

### 3.4 target scaling

MediaPipe world z は直接信用しない設計にします。body-localな wrist target を avatar shoulder-local に写す際は、次のように部位別スケールをかけます。

```text
avatarTarget.x = humanLocal.x * lateralScale
avatarTarget.y = humanLocal.y * verticalScale
avatarTarget.z = humanLocal.z * depthCompression
avatarTarget   = clampToReach(avatarTarget, armReachScale)
```

既存report03は、手を前に出す/横に広げる判定を単一値ではなく `sideScore` と `forwardScore` で行い、横広げは `openness > 0.55 && forwardness < 0.35`、前出しは `forwardness > 0.45 && openness < 0.55`、斜め前は両方が `0.35` 超とする目安を示しています。forwardness はヒステリシスを入れ、前方向に入る閾値を `0.50`、抜ける閾値を `0.35` にします。

---

## 4. 肘反転防止

### 4.1 pole vectorの定義

測定poleは次で定義します。

```text
targetDir = normalize(wristTarget - shoulder)
measuredPoleRaw = measuredElbow - shoulder
measuredPole = normalize(
  measuredPoleRaw - targetDir * dot(measuredPoleRaw, targetDir)
)
```

fallback pole は body-local の `R`、`U`、`F` を使い、肘が体の外側・やや下・わずか前へ出るようにします。

```text
leftFallbackPole  = normalize(-R * 0.8 + -U * 0.2 + F * 0.1)
rightFallbackPole = normalize( R * 0.8 + -U * 0.2 + F * 0.1)
```

このfallback式は既存report03でも提示されており、左右の肘が体の外側へ出るように設計されています。 現行 `bindPoleFromArm()` も、実測poleが使えない場合に左は `(-1, 0, 0)`、右は `(1, 0, 0)` をfallbackにしており、方向性は整合しています。([GitHub][12])

### 4.2 pole状態ごとのblend比率

`ArmPoleState` を導入し、毎フレーム `measured / previous / fallback` を状態に応じてblendします。

| 状態           | 条件                                        |  measured |  previous |  fallback |
| ------------ | ----------------------------------------- | --------: | --------: | --------: |
| `Stable`     | arm confidence > 0.75、肘角安定、非伸展            |      0.70 |      0.25 |      0.05 |
| `Uncertain`  | 0.45–0.75、奥行き不安定、手が顔前/画面端                 |      0.35 |      0.50 |      0.15 |
| `Extended`   | elbow flexion < 18° または reachRatio > 0.94 |      0.15 |      0.60 |      0.25 |
| `Lost`       | confidence < 0.45 が3フレーム以上                |      0.00 |      0.70 |      0.30 |
| `Recovering` | 再検出後200–400ms                             | 0.20→0.70 | 0.60→0.20 | 0.20→0.10 |

既存report03にも、Stable / Uncertain / Extended / Lost / Recovering のpole blend比率が示されており、上表はその範囲を初期値として具体化したものです。

### 4.3 急反転reject条件

`dot(measuredPole, previousPole) < 0` は、角度差が90°を超えることを意味するため、急反転検出として妥当です。ただし、それだけで常時rejectすると、横向き・腕交差・大きな姿勢変化で追従が鈍くなるため、次の二段判定にします。

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

既存report03でも、`dot(measuredPole, previousPole) < 0` の場合は measured pole を拒否または大幅減衰し、`angularChange > 60°/frame` では measured weight を `0.2` 倍、`elbowFlexion < 15°` では previous + fallback 優先とする条件が示されています。 現行実装の `poleFlipDotThreshold = -0.08` は約94.6°超の反転を抑える閾値なので、hard reject閾値としては継続可能です。([GitHub][11]) ただし、状態機械を導入する場合は `dot < 0.25` 程度からsoft downweightを始め、`dot < -0.08` をhard stabilized扱いにする方が滑らかです。

---

## 5. soft limit / 関節制約

### 5.1 shoulder / upperArm

現行実装は `maxUpperArmDeltaRad = 142°` を hard limit としています。([GitHub][11]) これは破綻防止の最終防波堤としてはよいですが、通常姿勢では手前にsoft limitを置きます。

| 制約                   |      soft |      hard | 備考         |
| -------------------- | --------: | --------: | ---------- |
| upperArm swing total |      125° |      142° | hardは現行維持  |
| upperArm lift        | -35°〜115° | -45°〜130° | 手下げ/手上げ    |
| upperArm open        | -35°〜105° | -45°〜120° | 体内側へ入りすぎない |
| upperArm depth       |  -45°〜70° |  -60°〜85° | 前出しの過大化を抑制 |

現行 `SincroArmIkConstraintResolver` には、肩targetのopen/lift/depth制限、head/chest no-go zone、collision/joint/pole stabilized時のweight scaleがすでにあります。初期値は `minShoulderOpenRatio = -0.34`、`maxShoulderOpenRatio = 0.97`、`minShoulderLiftRatio = -0.62`、`maxShoulderLiftRatio = 0.99`、`maxShoulderDepthRatio = 0.78` です。([GitHub][18]) これらは「target制約」として残し、bone quaternion側のsoft occupancyも別途ログ化します。

### 5.2 elbow / lowerArm

現行実装は `maxLowerArmDeltaRad = 132°` を hard limit とし、`localQuaternionFromParentDirection()` で neutral quaternion からの角度差を制限しています。([GitHub][11]) ただし、肘は「回転角上限」だけではなく、**伸び切り回避**が重要です。

推奨値:

| 項目                           |                                 初期値 |
| ---------------------------- | ----------------------------------: |
| minimum visual elbow flexion |                              12–18° |
| Extended state enter         |  flexion < 18° or reachRatio > 0.94 |
| Extended state exit          | flexion > 28° and reachRatio < 0.90 |
| lowerArm hard delta          |                                132° |
| lowerArm soft delta          |                            118–124° |

### 5.3 wrist

手首は単眼カメラで最も暴れやすいため、腕IKとは別solverにします。

| 回転             |      通常反映 |  最大角 | 低信頼時          |
| -------------- | --------: | ---: | ------------- |
| wrist pitch    |      0.55 | ±45° | previousへ保持   |
| wrist yaw      |      0.45 | ±40° | forearm方向から推定 |
| wrist roll     | 0.25–0.40 | ±35° | 0へ減衰          |
| lowerArm twist | 0.20–0.35 | ±25° | previousへ保持   |

既存report03でも `wrist roll influence = 0.40` が初期値として示されていますが、これは高信頼時の上限と見なし、通常は `0.25–0.35` から開始する方が安定です。

---

## 6. 肩・鎖骨・胸補正

### 6.1 基本分配

VRoid系モデルでは upperArm だけを回すと肩・胸・袖まわりが破綻しやすいため、腕のelevationに応じて `shoulder / upperChest / chest / spine` に補助回転を分配します。three-vrmレポートでは、`spine + chest + upperChest` がある場合に `spine = 0.25`、`chest = 0.40`、`upperChest = 0.35` へ体幹回転を分配し、片腕上げ時は shoulder と upperChest に寄せ、両腕上げ時だけ chest を少し使う方針が示されています。

腕上げ補正の基本式:

```text
armRaiseAssist = smoothstep(30°, 110°, armElevation)
```

| ケース     |           shoulder |    upperChest | chest | spine |
| ------- | -----------------: | ------------: | ----: | ----: |
| 片腕を上げる  |             10–16° |          4–8° |  0–4° |  0–2° |
| 両腕を上げる  |        12–20° each |         8–14° | 4–10° |  0–3° |
| 手を前に出す  |     protract 4–10° |  forward 3–8° |  2–6° |  0–2° |
| 腕を横に広げる | outward/lift 6–14° | roll/yaw 2–6° |  0–3° |    0° |
| 斜め前     |  上記を 0.5:0.5 blend |               |       |       |

three-vrmレポートでも `armRaiseAssist = smoothstep(30°, 110°, armElevation)`、`shoulderLift = 10〜20°`、`upperChest = 6〜18°`、`chest = 0〜12°` が目安として示されています。

### 6.2 optional bone fallback

`leftShoulder/rightShoulder` が存在する場合は肩補正に使います。ない場合は `upperChest` と `upperArm` 側へ逃がします。`upperChest` がない場合は `chest` へ、`chest` もない場合は `spine` へ集約します。three-vrmレポートでも、VRMHumanBoneNameでbone存在確認を行い、torso、neck/head、shoulder、arm、fingersを存在するboneへ分配する方針が示されています。

推奨fallback:

| bone構成                              | 処理                                   |
| ----------------------------------- | ------------------------------------ |
| shoulderあり                          | shoulder 70%、upperChest 30%          |
| shoulderなし + upperChestあり           | upperChest 60%、upperArm target補正 40% |
| shoulderなし + upperChestなし + chestあり | chest 45%、upperArm target補正 55%      |
| spineのみ                             | torso補正は弱くし、upperArm側soft limitを強める  |

### 6.3 no-go zone

現行constraintには head/chest no-go zone があり、`headRadiusRatio = 0.38`、`chestRadiusXRatio = 0.56`、`chestRadiusYRatio = 0.72`、`chestRadiusZRatio = 0.42`、`handRadiusRatio = 0.18`、`forearmRadiusRatio = 0.14` が定義されています。([GitHub][18]) これは継続し、次をdebugに出します。

```text
headPenetration
chestPenetration
targetPushDistance
collisionAvoided
constraint.reasons[]
```

no-go zone は物理衝突ではなく、**targetを外へ押し戻す軽量補正**として扱います。手が顔前にあるとHand/Faceの観測も不安定になるため、collision補正時は wrist roll と finger splay の重みも下げます。

---

## 7. 手首・前腕twist

### 7.1 palm basis

Hand Landmarker の21点から、手のひらbasisを作ります。Hand Landmarkerはhandedness、21点landmarks、21点world landmarksを返すため、手首姿勢と指制御の入力として適しています。([Google for Developers][4])

推奨basis:

```text
wrist = landmark[0]
indexMcp = landmark[5]
middleMcp = landmark[9]
pinkyMcp = landmark[17]

palmX = normalize(indexMcp - pinkyMcp)
palmY = normalize(middleMcp - wrist)
palmN = normalize(cross(palmX, palmY))
```

信用する軸は `palmY` と `palmN`、最も捨てやすい軸は forearm軸まわりのrollです。手が横向きでpalm planeがカメラに対してedge-onになる場合、顔前で遮蔽される場合、手領域が小さい場合、hand confidenceが低い場合は、rollを観測から作らず previous / neutral へ戻します。

### 7.2 wrist / lowerArm twist分配

VRM humanoidには一般的なtwist専用boneが標準化されていないため、lowerArmとhandへ控えめに分配します。`VRMHumanBoneName` には `LeftLowerArm`、`LeftHand`、各指 proximal/intermediate/distal などが定義されています。([Pixiv][19])

推奨分配:

| 状態                    | hand roll | lowerArm twist | 備考              |
| --------------------- | --------: | -------------: | --------------- |
| high confidence       |      0.65 |           0.35 | roll上限±35°      |
| normal                |      0.75 |           0.25 | 初期設定            |
| hand edge-on          |      0.35 |           0.10 | previous優先      |
| face front / occluded |      0.20 |           0.00 | roll freeze     |
| small hand            |      0.25 |           0.10 | neutralへ低速減衰    |
| lost                  |      0.00 |           0.00 | 300–500msで自然姿勢へ |

pitch/yawは「手首から中指MCP方向」「前腕方向」から比較的安定して作り、rollのみ強く抑制します。wrist quaternionはIK結果に直接上書きせず、`forearmDir` に整合する手首基準姿勢へ palm basis の差分を小さくadditive合成します。

---

## 8. 指制御

### 8.1 初期実装粒度

初期段階では、各関節の3D回転を直接推定せず、**低次元の curl / splay / oppose** に限定します。添付依頼でも、指は各関節の3D回転ではなく、curl / splay / oppose から始める案を具体化することが求められています。

推奨する最小指グループ:

```ts
type FingerControl = {
  thumb: { curl: number; oppose: number; splay: number };
  index: { curl: number; splay: number };
  middle: { curl: number; splay: number };
  ringLittle: { curl: number; splay: number };
};
```

`ring` と `little` は初期段階ではまとめます。指のちらつきは腕や肩ほど致命的ではない一方、細かく追従させるほど不安定になるため、最初は `Open / Relaxed / Fist / Point / ThumbUp` 程度の意味状態と連続curlを混ぜるのが安全です。

### 8.2 curl分配

| 指      |        proximal |  intermediate |      distal |
| ------ | --------------: | ------------: | ----------: |
| index  |            0.50 |          0.32 |        0.18 |
| middle |            0.50 |          0.32 |        0.18 |
| ring   |            0.48 |          0.34 |        0.18 |
| little |            0.48 |          0.34 |        0.18 |
| thumb  | metacarpal 0.35 | proximal 0.40 | distal 0.25 |

指boneが不足するモデルでは、存在するboneへcurlを再分配します。three-vrmレポートでも、fingersは proximal/intermediate/distal のうち存在するboneだけにcurlを再分配する方針が示されています。

### 8.3 splay / oppose

| 制御               |  初期値 |   上限 |
| ---------------- | ---: | ---: |
| index splay      | 0–6° | ±12° |
| middle splay     | 0–3° |  ±6° |
| ringLittle splay | 0–5° | ±10° |
| thumb oppose     |  18° |  35° |
| thumb splay      |   8° |  20° |

Gesture Recognizerは gesture categories、handedness、hand landmarks、world landmarksを返すため、意味状態の補助として使えます。([Google AI for Developers][20]) ただし、Gesture Recognizerの結果を指poseへ即時hard overrideするとちらつくため、`gestureConfidence > 0.75` が100–150ms継続した場合だけ semantic state を切り替えます。`fingerCurl` と `Gesture` が矛盾する場合は、連続curlを優先し、gestureは「目標poseへのbias」として使います。

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

| 既存領域                                                   | 変更内容                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `features/gaze/poseTracking`                           | raw landmarkから `CanonicalUpperBodyState` を作る前段へ拡張                       |
| `character/retargeting/sincroPoseArmIkSolve.ts`        | `wrist/elbowPole/weight` だけでなく `confidence/reachRatio/elbowFlexion` を渡す |
| `character/ik/sincroArmIkPole.ts`                      | `resolveArmIkPoleDirection()` を状態機械ベースに拡張                               |
| `character/ik/sincroArmIkConstraint.ts`                | no-go zone結果をdebugへ詳細出力                                                 |
| `character/retargeting/sincroPoseRetargetUpperBody.ts` | arm elevation / forwardness / bilateral raise 由来の shoulder/chest補正を追加   |
| 新規 `WristPoseSolver.ts`                                | palm basisから pitch/yaw/roll を低信頼度対応付きで作る                                |
| 新規 `FingerPoseSolver.ts`                               | curl/splay/oppose とGesture整合を行う                                         |
| `pages/motionDebug`                                    | pole、reach、constraint、wrist、finger metrics を表示・保存                       |

現行 `DEFAULT_SINCRO_POSE_RETARGET_CONFIG` は `minConfidence = 0.45`、`returnToNeutralMs = 520`、`smoothingMs = 155`、`armIkStrength = 1.0`、`armIkMode = "world_3d_ik"` です。([GitHub][22]) この設定は継続しつつ、低confidence時に即neutralへ戻すのではなく、motion solver側で「控えめな自然姿勢」へ滑らかに退避する方針にします。three-vrmレポートでも、低confidence時はthree-vrm層で急にneutralへ戻さず、motion solver側で自然姿勢へ退避させることが推奨されています。

---

## 10. 部位別初期パラメータ表

| 領域             | パラメータ                   |                                     初期値 |
| -------------- | ----------------------- | --------------------------------------: |
| arm confidence | Stable                  |                                `> 0.75` |
| arm confidence | Uncertain               |                             `0.45–0.75` |
| arm confidence | Lost                    |                         `< 0.45` が3フレーム |
| recover        | Recovering duration     |                             `200–400ms` |
| reach          | `minReachRatio`         |                                  `0.20` |
| reach          | `maxReachRatio`         |                                 `0.975` |
| reach          | `overheadMinReachRatio` |                                  `0.88` |
| avatar scale   | `armReachScale`         |                                  `0.92` |
| avatar scale   | `depthCompression`      |                                  `0.60` |
| pole           | outward bias            |                                  `0.25` |
| pole           | hard reject             |                           `dot < -0.08` |
| pole           | soft downweight         |                            `dot < 0.25` |
| elbow          | Extended enter          |  `flexion < 18°` or `reachRatio > 0.94` |
| elbow          | Extended exit           | `flexion > 28°` and `reachRatio < 0.90` |
| upperArm       | hard delta              |                                  `142°` |
| upperArm       | soft delta              |                                  `125°` |
| lowerArm       | hard delta              |                                  `132°` |
| lowerArm       | soft delta              |                                  `120°` |
| torso          | spine/chest/upperChest  |                    `0.25 / 0.40 / 0.35` |
| shoulder       | arm raise assist        |                 `smoothstep(30°, 110°)` |
| wrist          | roll influence          |                             `0.25–0.40` |
| wrist          | max roll                |                                  `±35°` |
| lowerArm twist | max                     |                                  `±25°` |
| finger         | curl smoothing          |                              `80–140ms` |
| gesture        | switch hysteresis       |                             `100–150ms` |

---

## 11. VRoid系モデルで避けるべき破綻と対策

| 破綻                   | 原因                           | 対策                                                   |
| -------------------- | ---------------------------- | ---------------------------------------------------- |
| 肘反転                  | poleの奥行き不安定、腕伸展、再検出jump      | `ArmPoleState`、previous/fallback blend、dot/角速度reject |
| 肩崩れ                  | upperArmのみ回す                 | shoulder / upperChest / chest補正                      |
| 腕の伸び切り               | target遠すぎ、depth過大            | maxReach 0.975、depthCompression 0.60、Extended state  |
| 手首roll暴れ             | palm basis不安定、遮蔽、手が小さい       | roll低反映、previous保持、低信頼時neutral減衰                     |
| 指ちらつき                | per-joint直接推定、gesture即時反映    | curl/splay/oppose低次元化、hysteresis                     |
| 顔・胸へのめり込み            | 単眼zとキャラ体型差                   | head sphere / chest ellipsoid no-go zone             |
| optional bone差       | upperChest/shoulder/finger不足 | bone存在確認と分配fallback                                  |
| 小柄VRoidで手が届かない/届きすぎる | 人体とアバター比率差                   | shoulder/arm/torso/depthの部位別scale                    |

既存report01でも、小柄VRoidモデル、upperChestなしモデル、手を顔前に出す、腕を交差する、カメラ方向に手を突き出す、片手を画面外に出す、といった固定テストケースが必要だと整理されています。

---

## 12. debugで記録すべき値

最低限、次を `motionDebug` の保存ログに含めます。

| カテゴリ       | debug値                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------ |
| 入力         | timestamp、video frame id、Pose/Hand/Face/Gesture confidence                                                   |
| body frame | `bodyRight/bodyUp/bodyFront`、front反転有無                                                                       |
| target     | raw wrist、scaled wrist、clamped target、reachRatio、targetClamped                                               |
| pole       | measuredPole、previousPole、fallbackPole、blendedPole、poleDot、poleAngularVelocity、poleState                     |
| elbow      | elbowFlexion、Extended enter/exit、estimated elbow position                                                    |
| constraint | jointLimited、poleStabilized、collisionAvoided、targetPushDistance、constraint.reasons                           |
| shoulder補正 | armElevation、armRaiseAssist、shoulder/chest/upperChest degrees                                                |
| wrist      | palmBasis confidence、pitch/yaw/roll raw、appliedRoll、lowerArmTwist                                            |
| fingers    | curl/splay/oppose raw/applied、gesture category、gesture confidence、semantic state                             |
| VRM        | optional bone capability、final pose before limit、final pose after limit                                      |
| metrics    | elbow flip count、reach clamp occupancy、quaternion angular velocity、recovery jump angle、dropped hand duration |

既存report01でも、`wrist target error`、`elbow flip count`、`shoulder limit occupancy`、`quaternion angular velocity`、`dropped hand duration`、`recovery jump angle`、`confidence-weighted smoothing amount` などを記録すべき評価指標として挙げています。

---

## 13. 実装優先順

1. **debug schema拡張**
   pole、reach、constraint、wrist、fingerを記録できるようにする。アルゴリズム変更より先に行う。

2. **ArmPoleState導入**
   `Stable / Uncertain / Extended / Lost / Recovering` とblend表を実装し、現行 `resolveArmIkPoleDirection()` の前段で blendedPole を作る。

3. **reach / depth scaling整理**
   `armReachScale = 0.92`、`depthCompression = 0.60` を `AvatarMotionProfile` に置き、world_3d_ik target生成時に適用する。

4. **shoulder / upperChest / chest補正**
   `armElevation / forwardness / openness / bothArmsRaised` から補助回転を作り、optional bone fallback付きで `VRMPose` に合成する。

5. **WristPoseSolver追加**
   Hand palm basisから pitch/yaw/roll を作り、rollはconfidence-awareにする。

6. **FingerPoseSolver追加**
   curl/splay/opposeの低次元制御を実装し、Gesture Recognizerはsemantic biasとして使う。

7. **固定ログ再生テスト**
   neutral、片手上げ、両手上げ、横広げ、前出し、腕交差、顔前、画面外復帰、小柄VRoid、upperChestなしモデルで比較する。

最終的には、three-vrmへ入る時点で `VRMHumanoid normalized local pose` として成立していることが重要です。three-vrmはMediaPipeの不確実性を解く場所ではなく、VRM-1.0 humanoid仕様、optional bone、rest rotation、spring/constraint更新順を尊重して最終姿勢を安全に適用する層として扱います。

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
