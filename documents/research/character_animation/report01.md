# 上半身モーションキャプチャ実装方式 調査・設計レポート

対象は、**単眼Webカメラ + MediaPipe Pose / Hand / Face Landmarker を入力とし、VRM-1.0 / VRoid Studio由来モデルの上半身を Three.js 上で自然に動かす実装**です。既存実装との互換性や差分改修は考慮せず、最良の設計を新規に組む前提で整理します。表情、視線、idle motion は除外し、身体・頭部・腕・手首・指のモーション生成に限定します。

---

## 1. 結論

最良の実装方針は、**MediaPipe の landmark を直接 VRM ボーンへ流し込む方式ではなく、MediaPipe を「観測値」として扱い、その上にキャラクター向けの制約付きモーションソルバを構築する方式**です。

推奨アーキテクチャは次です。

```text
WebCamera
  ↓
MediaPipe Pose / Hand / Face Landmarker
  ↓
時刻同期・左右同定・信頼度評価
  ↓
カメラ空間 / 体幹ローカル空間への正規化
  ↓
人体・アバター比率のキャリブレーション
  ↓
上半身姿勢ソルバ
    - 体幹フレーム推定
    - spine / chest / upperChest / neck / head 分配
    - shoulder 補正
    - 2-bone arm IK
    - wrist orientation 推定
    - finger curl / splay 推定
  ↓
制約・スタイル補正
    - 関節可動域
    - elbow pole vector
    - shoulder damping
    - reach clamp
    - dropout handling
  ↓
時間フィルタ
    - One Euro Filter
    - quaternion log-space smoothing
    - confidence-aware blending
  ↓
VRM-1.0 humanoid retarget
  ↓
Three.js / VRM model bone local rotations
```

この構成で重要なのは、**「検出精度を上げる」ことよりも、「検出が多少不安定でも破綻しないキャラクターモーションへ変換する」こと**です。MediaPipe Pose Landmarker は 33 個の身体ランドマークと world landmarks を出力し、Hand Landmarker は手の 21 点ランドマークと handedness を出力し、Face Landmarker は顔ランドマークおよび顔の transformation matrix を出力できますが、これらはそのまま骨格アニメーションの正解値ではありません。([Google AI for Developers][1])

---

## 2. 採用すべき基本思想

### 2.1 Landmark は「骨格姿勢」ではなく「観測値」として扱う

MediaPipe の出力は、画面内の人体らしい構造を推定した landmark です。特に単眼カメラでは、奥行き、肩の前後、肘の向き、手首の回転、手の重なりなどが不安定になりやすいです。そのため、landmark から直接ボーン回転を作ると、次のような問題が発生します。

| 問題                    | 典型例                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| depth ambiguity         | 腕を前に出したのか、横に広げたのかが不安定になる                         |
| elbow flip              | 肘の向きがフレーム間で反転する                                           |
| shoulder collapse       | 手を上げたとき肩・鎖骨・胸が破綻する                                     |
| wrist twist instability | 手首の roll が激しく回転する                                             |
| body scale mismatch     | 実写の人間とVRoidキャラの腕・肩幅・頭身が違い、手が届きすぎる / 届かない |
| landmark dropout        | 手が顔の前に来る、画面外に出る、片手が隠れる                             |

したがって、最終的に作るべきものは **landmark mapper** ではなく、**character motion solver** です。

---

### 2.2 最適化対象は「人間への忠実性」ではなく「キャラクターとしての自然さ」

今回の目的では、人間の動きを完全再現する必要はありません。むしろ、単眼カメラで無理に人体忠実な再現をしようとすると、細かいブレや解剖学的な不整合が目立ちます。

したがって、優先順位は次の順に置くべきです。

| 優先度 | 目的                                   |
| -----: | -------------------------------------- |
|      1 | 破綻しない                             |
|      2 | 安定している                           |
|      3 | かわいいキャラクターとして自然に見える |
|      4 | 撮影者の意図が伝わる                   |
|      5 | 人間の実姿勢に忠実                     |

特に VRoid Studio 由来のモデルでは、現実の人間より頭が大きく、肩幅・腕長・胴体比率が異なることがあります。そのため、**人間の wrist position をそのままアバターの wrist target にするのではなく、アバターの体型に合わせて reach を再解釈する**必要があります。

---

## 3. MediaPipe の使い方

### 3.1 Pose / Hand / Face を分離して使い、統合層を自前で持つ

MediaPipe には Pose、Hand、Face の個別タスクがあります。2026年時点のこの用途では、**個別 Landmarker を使い、自前で Holistic 的に統合する構成**が最も扱いやすいです。

MediaPipe Holistic は pose / face / hand を統合し、pose の推定結果から hand / face の ROI を導出することで、再検出遅延や左右の取り違えを減らす設計を取っています。Google の解説でも、pose を毎フレーム推定して手や顔の ROI を導くことが、速い動きへの反応や左右一貫性の維持に寄与すると説明されています。([Google Research][2])

ただし、現在の実装設計では、Holistic をそのまま使うよりも、次のように個別タスクを統合する方がよいです。

| 項目     | 推奨                                                      |
| -------- | --------------------------------------------------------- |
| Pose     | 体幹、肩、肘、手首、腰の基準                              |
| Hand     | 手首姿勢、指、手の存在確認                                |
| Face     | 頭部姿勢の補助。表情・視線は今回除外                      |
| 統合     | 自前の `PerceptionFusion` 層で行う                        |
| 左右判定 | handedness だけでなく、Pose の左右 wrist と時系列IDで補正 |
| 欠落処理 | Landmarker ではなく motion solver 側で扱う                |

MediaPipe の公式 Holistic ページは、543 landmarks を提供する統合ソリューションとして説明されていますが、同時に「upgraded version coming soon」とされているため、今回の設計では **Holistic の考え方を採用し、実装は Pose / Hand / Face の個別タスクで構成する**のが堅実です。([Google AI for Developers][3])

---

### 3.2 Pose Landmarker の役割

Pose Landmarker は、次の目的に使います。

| 用途                    | 使う landmark                        |
| ----------------------- | ------------------------------------ |
| 体幹基準                | left/right shoulder, left/right hip  |
| head fallback           | nose, ears, eyes                     |
| upper arm               | shoulder, elbow                      |
| forearm                 | elbow, wrist                         |
| global wrist target     | wrist                                |
| visibility / confidence | 各 landmark の confidence / presence |

Pose Landmarker は image coordinates と world coordinates を出力できます。公式ドキュメントでは、normalized image coordinates、world coordinates、任意の segmentation mask が出力されると説明されています。([Google AI for Developers][1])

ただし、**world coordinates を絶対的な3D座標として過信しない**方がよいです。単眼推定では奥行きが不安定になりやすく、MediaPipe Pose を用いた研究でも、MediaPipe Pose の depth data には大きな誤差があるとして、2D投影誤差と関節制約を使う最適化手法が提案されています。([MDPI][4])

したがって、設計上は次のように扱います。

```text
Pose world landmarks
  → 体幹ローカル空間の相対方向として使う
  → 腕長・肩幅・肘方向の推定に使う
  → 絶対的な手先3D位置としては使わない
```

---

### 3.3 Hand Landmarker の役割

Hand Landmarker は、手の 21 点ランドマーク、handedness、image/world landmarks を出力します。MediaPipe の説明では、palm detection と hand landmark model を組み合わせ、21個の手指 landmark を推定する構成です。([Google AI for Developers][5])

このシステムでは、Hand Landmarker を次の用途に限定するのがよいです。

| 用途                    | 推奨度 | 理由                                           |
| ----------------------- | -----: | ---------------------------------------------- |
| 指の curl / splay 推定  |     高 | 21点ランドマークが直接有効                     |
| 手のひら法線の推定      |     高 | wrist / MCP群から palm basis を作れる          |
| wrist roll の補助       |     中 | 手のひら向きから推定可能                       |
| wrist position の主入力 |     低 | Pose wrist と整合しない場合がある              |
| 腕IK全体の主入力        |     低 | 手の crop 内推定だけでは全身座標との整合が弱い |

つまり、**腕の位置は Pose、手首の向きと指は Hand** という分担にします。

---

### 3.4 Face Landmarker の役割

Face Landmarker は、顔 landmark、blendshape、facial transformation matrix を出力できます。公式ドキュメントでは、3D face landmarks、blendshape scores、顔にエフェクトを描画するための transformation matrices が出力されると説明されています。([Google AI for Developers][6])

今回は表情・視線はスコープ外なので、Face Landmarker は次に限定します。

| 用途                 | 採用   |
| -------------------- | ------ |
| head rotation の補助 | 採用   |
| neck / head 分配     | 採用   |
| facial blendshape    | 不採用 |
| eye gaze             | 不採用 |
| mouth / expression   | 不採用 |

Pose の nose / ears だけで頭部姿勢を作ると、横向きや顔の傾きで不安定になりやすいため、**Face Landmarker の transformation matrix を head orientation の主入力として使う**のがよいです。

---

## 4. 推奨データ構造

実装上は、MediaPipe の出力を直接 VRM に適用せず、次のような中間表現を置きます。

```ts
type LandmarkConfidence = {
    presence: number;
    visibility?: number;
    tracking?: number;
};

type BodyMeasurementFrame = {
    timestampMs: number;

    torso: {
        hipsCenter: THREE.Vector3;
        shouldersCenter: THREE.Vector3;
        shoulderLeft: THREE.Vector3;
        shoulderRight: THREE.Vector3;
        hipLeft: THREE.Vector3;
        hipRight: THREE.Vector3;
        confidence: number;
    };

    arms: {
        left: ArmMeasurement;
        right: ArmMeasurement;
    };

    head: {
        rotationCamera?: THREE.Quaternion;
        positionCamera?: THREE.Vector3;
        confidence: number;
    };
};

type ArmMeasurement = {
    shoulder: THREE.Vector3;
    elbow: THREE.Vector3;
    wrist: THREE.Vector3;
    poseConfidence: number;

    hand?: {
        palmBasis: THREE.Matrix3;
        fingerLandmarks: THREE.Vector3[];
        handedness: "Left" | "Right";
        confidence: number;
    };
};

type NormalizedUpperBodyPose = {
    root: {
        position: THREE.Vector3;
        rotation: THREE.Quaternion;
    };

    localRotations: Partial<Record<VRMHumanBoneName, THREE.Quaternion>>;

    fingers: {
        left?: FingerPose;
        right?: FingerPose;
    };

    confidence: {
        torso: number;
        head: number;
        leftArm: number;
        rightArm: number;
        leftHand: number;
        rightHand: number;
    };
};
```

この中間表現は、**特定のVRMモデルに依存しない正規化ポーズ**として扱います。VRM-1.0 では humanoid bone が glTF node にマップされ、hips / spine / chest / upperChest / neck / head / shoulders / arms / hands などの標準的な humanBones が定義されています。([GitHub][7])

---

## 5. 座標系とキャリブレーション

### 5.1 3つの空間を分ける

実装では、最低でも次の3空間を明確に分けるべきです。

| 空間                  | 内容                               |
| --------------------- | ---------------------------------- |
| camera space          | MediaPipe から得られる観測空間     |
| normalized body space | 被写体の体幹を基準にした正規化空間 |
| avatar local space    | VRMモデルのボーンローカル空間      |

最も重要なのは、**camera space から直接 avatar local bone に行かない**ことです。

```text
camera landmarks
  → body-local measurements
  → normalized human pose
  → avatar-specific retarget
  → VRM bone local rotations
```

---

### 5.2 初期キャリブレーション

単眼カメラかつVRoidモデル前提では、キャリブレーションを入れた方が安定します。

最小構成では、起動時に1〜2秒程度、正面を向いた自然姿勢を取ってもらい、以下を推定します。

| 推定値                  | 用途                             |
| ----------------------- | -------------------------------- |
| shoulder width          | 体幹スケール、腕ターゲット正規化 |
| upper arm length        | 2-bone IK の L1                  |
| lower arm length        | 2-bone IK の L2                  |
| torso height            | spine / chest 分配               |
| neutral chest direction | camera-facing 基準               |
| neutral head rotation   | head / neck の基準               |
| neutral hand size       | finger curl の正規化補助         |

アバター側では、VRMのrest poseから次を計算します。

| アバター側計測        | 用途                                 |
| --------------------- | ------------------------------------ |
| shoulder width        | 人間→アバターの横方向スケール        |
| upper arm length      | IK target clamp                      |
| lower arm length      | IK target clamp                      |
| hand length           | wrist / finger補正                   |
| head / torso ratio    | head motion の補正                   |
| optional bones の有無 | spine/chest/upperChest/shoulder 分配 |

VRM-1.0 の humanoid animation 仕様では、モデル間のT-pose差異やrest rotation差異を吸収するため、normalized local rotation へ変換してから対象モデルの local rotation へ戻す考え方が示されています。また、異なるサイズのモデル間では hips translation を身長比でスケーリングする例も示されています。([GitHub][8])

今回の上半身用途では、hips translation 全体を動かすよりも、**肩幅、上腕長、前腕長、胴体長を別々にスケールする**方がよいです。VRoid系モデルでは、頭身や腕の比率が現実の人間と異なるため、単一の global scale では手先位置が破綻しやすくなります。

---

## 6. 体幹ソルバ

### 6.1 体幹フレームの推定

体幹は、上半身全体の安定性を決める最重要要素です。

Pose の shoulder / hip から次の基準軸を作ります。

```text
shoulderCenter = (leftShoulder + rightShoulder) / 2
hipCenter      = (leftHip + rightHip) / 2

bodyUp    = normalize(shoulderCenter - hipCenter)
bodyRight = normalize(rightShoulder - leftShoulder)
bodyFront = normalize(cross(bodyRight, bodyUp))
```

ただし、単眼推定では `bodyFront` が不安定になるため、以下を併用します。

| 入力           | 役割                          |
| -------------- | ----------------------------- |
| shoulder line  | yaw / roll の主入力           |
| hip line       | pelvis安定化                  |
| face transform | head / upper chest yaw の補助 |
| previous frame | front軸の反転防止             |
| camera forward | 正面基準のfallback            |

`bodyFront` は単純な外積だけで作るのではなく、**前フレームとの連続性を見て反転を抑制する**必要があります。

---

### 6.2 spine / chest / upperChest への分配

体幹の回転は、1本のボーンに入れると硬く見えます。VRMモデルに `spine`, `chest`, `upperChest` がある場合、次のように分配します。

| ボーン     | 役割                                 | 例: 回転分配 |
| ---------- | ------------------------------------ | -----------: |
| hips       | 下半身固定時の基準。大きく動かさない |       0〜10% |
| spine      | 胴体の土台                           |      20〜30% |
| chest      | 上半身の主回転                       |      35〜45% |
| upperChest | 肩・首の自然さ                       |      25〜40% |

推奨初期値は次です。

```text
spine      = torsoRotation * 0.25
chest      = torsoRotation * 0.40
upperChest = torsoRotation * 0.35
```

`upperChest` がないモデルでは、`chest` に寄せます。

```text
spine = torsoRotation * 0.35
chest = torsoRotation * 0.65
```

`chest` もない場合は `spine` に集約します。ただし、この場合は肩と腕の見た目が硬くなるため、shoulder compensation を強めます。

---

### 6.3 体幹は「低周波・低振幅」にする

かわいいキャラクターとしての自然さを優先する場合、体幹は人間の動きに完全追従させない方がよいです。手や頭は多少速く追従してもよいですが、胴体が細かく揺れると不安定に見えます。

推奨設定は次です。

| 部位       | 追従                                       |
| ---------- | ------------------------------------------ |
| hips       | ほぼ固定                                   |
| spine      | 弱く追従                                   |
| chest      | 中程度に追従                               |
| upperChest | 腕・頭の動きに合わせて補助的に追従         |
| head       | Face matrix をもとに追従。ただしneckと分配 |

---

## 7. 頭部・首ソルバ

表情・視線は対象外ですが、頭部姿勢は上半身モーションに含めるべきです。頭が完全固定だと、腕や胴体の動きと合わず不自然になります。

### 7.1 入力の優先順位

| 優先度 | 入力                                  | 用途          |
| -----: | ------------------------------------- | ------------- |
|      1 | Face Landmarker transformation matrix | head rotation |
|      2 | Pose nose / ears / eyes               | fallback      |
|      3 | chest forward + previous head         | 欠落時補間    |

Face Landmarker の transformation matrix は頭部姿勢の推定に利用できます。一方で、blendshape や eye gaze は今回使いません。([Google AI for Developers][6])

---

### 7.2 neck / head 分配

頭部の回転を head ボーンだけに入れると、首が折れたように見えます。推奨は、neck と head に分配する方式です。

```text
neck = headDelta * 0.35
head = headDelta * 0.65
```

かわいいキャラクターでは、head 側をやや大きめにしてもよいですが、首の回転をゼロにするのは避けます。

| 回転       | 推奨制限 |
| ---------- | -------: |
| neck yaw   |     ±25° |
| neck pitch |     ±20° |
| neck roll  |     ±15° |
| head yaw   |     ±35° |
| head pitch |     ±25° |
| head roll  |     ±20° |

---

## 8. 腕ソルバ

### 8.1 腕は 2-bone analytic IK を主方式にする

腕は、`upperArm → lowerArm → hand` の2リンク構造として扱えます。ここは Three.js の `CCDIKSolver` を主方式にするよりも、**自前の2-bone analytic IK** を実装する方が安定します。

Three.js の `CCDIKSolver` は CCD 法による inverse kinematics solver で、SkinnedMesh 向けの addon として提供されています。利用候補にはなりますが、腕のような短い2リンクIKでは、専用の解析解の方が elbow pole vector、関節制約、手首姿勢を制御しやすいです。([threejs.org][9])

推奨は次です。

| 用途                     | 方式                    |
| ------------------------ | ----------------------- |
| 通常の腕IK               | 自前 2-bone analytic IK |
| 肩・肘制約込みの補助     | 自前 constrained IK     |
| 複数関節・特殊モデル対応 | FABRIK                  |
| デバッグ・簡易実装       | CCDIKSolver             |
| 最終品質の主方式         | CCDIKSolver単独は非推奨 |

FABRIK は、角度や行列を直接扱う代わりに、関節点を線上に配置していくIK手法です。原論文では、実装が比較的単純で、少ない反復回数で収束し、制約や複数チェーンにも対応できるとされています。([サイエンスダイレクト][10])

---

### 8.2 腕IKの入力

腕IKでは、Pose の shoulder / elbow / wrist を主入力にします。

| 入力                 | 使い方              |
| -------------------- | ------------------- |
| shoulder             | IK root             |
| elbow                | pole vector 推定    |
| wrist                | IK target           |
| hand palm basis      | wrist rotation 補助 |
| previous elbow plane | 肘反転防止          |
| avatar arm length    | target clamp        |

Hand Landmarker の wrist landmark をそのまま腕IK target にするのは避けます。Hand Landmarker は手の crop に対して高精度ですが、全身座標との整合は Pose wrist の方が取りやすいためです。

---

### 8.3 2-bone IK の基本手順

各腕について、次の手順で解きます。

```text
S = shoulder position
E = elbow position
W = wrist target

L1 = avatar upperArm length
L2 = avatar lowerArm length

target = W - S
d = length(target)
d = clamp(d, minReach, L1 + L2 - epsilon)

pole = estimatePoleVector(S, E, W, torsoFrame, previousPole)

upperArmRotation = solveShoulderRotation(S, target, pole, L1, L2)
lowerArmRotation = solveElbowRotation(d, L1, L2)
wristRotation    = solveWristRotation(handPalmBasis, lowerArmRotation)
```

肘角度は余弦定理で求めます。

```text
cosElbow = (L1^2 + L2^2 - d^2) / (2 * L1 * L2)
elbowFlexion = π - acos(clamp(cosElbow, -1, 1))
```

手先が届かない場合は、target を腕長以内に clamp します。

```text
maxReach = (L1 + L2) * reachScale
reachScale = 0.90〜0.98
```

かわいいキャラクターの場合、`reachScale` は 1.0 より少し小さくした方が、腕が伸び切らず自然に見えます。

---

### 8.4 elbow pole vector

腕IKの品質は、ほぼ elbow pole vector で決まります。

pole vector は次の優先順位で決めます。

| 優先度 | pole source                             |
| -----: | --------------------------------------- |
|      1 | Pose elbow から推定した実測 elbow plane |
|      2 | 前フレームの pole vector                |
|      3 | 体幹基準の外向き・やや下向き vector     |
|      4 | 腕の左右に応じた固定fallback            |

単純に Pose elbow を常に信用すると、肘が画面奥方向に回り込んだときに反転します。したがって、`measuredPole` と `previousPole` を confidence に応じてブレンドします。

```ts
const pole = normalize(
    measuredPole
        .multiplyScalar(confidence)
        .add(previousPole.multiplyScalar(1.0 - confidence)),
);
```

さらに、左右の腕で「肘が内側に入りすぎない」制約を入れます。

```text
left elbow  → 体の左外側に寄せる bias
right elbow → 体の右外側に寄せる bias
```

キャラクター用途では、肘のシルエットが見えた方が自然なので、完全な実測追従よりも **外向き bias** を入れる方がよいです。

---

### 8.5 shoulder / clavicle 補正

VRMには `leftShoulder`, `rightShoulder` が存在する場合があります。肩ボーンを適切に使わないと、腕を上げたときに上腕だけが不自然に回転します。

推奨は次です。

| 腕の状態         | shoulder補正                         |
| ---------------- | ------------------------------------ |
| 手が低い         | ほぼ neutral                         |
| 手を前に出す     | shoulder を少し前へ                  |
| 手を横に上げる   | shoulder を少し上・外へ              |
| 手を大きく上げる | shoulder + upperChest を補助的に使う |

shoulder は実測 landmark に直接合わせるのではなく、**腕IK target から二次的に生成**します。

```text
armElevation = angle(upperArmDirection, avatarDown)
shoulderLift = smoothstep(30°, 110°, armElevation) * maxShoulderLift
```

目安は次です。

| 補正             |         角度 |
| ---------------- | -----------: |
| shoulder lift    | 最大 10〜20° |
| shoulder forward | 最大 10〜15° |
| shoulder twist   |   原則小さく |

肩を動かしすぎるとキャラクターが落ち着かなくなるため、**shoulder は腕よりも強く平滑化**します。

---

## 9. 手首・手指ソルバ

### 9.1 手首姿勢

手首姿勢は、Hand Landmarker の landmark から palm basis を作って推定します。

代表的には次のように基底を作ります。

```text
wrist = landmark[0]
indexMcp = landmark[5]
middleMcp = landmark[9]
pinkyMcp = landmark[17]

palmRight = normalize(indexMcp - pinkyMcp)
palmUp    = normalize(middleMcp - wrist)
palmNormal = normalize(cross(palmRight, palmUp))
```

この palm basis を avatar hand bone の local rotation に変換します。

ただし、wrist roll は非常に不安定になりやすいため、次の制約を入れます。

| 回転          | 方針                    |
| ------------- | ----------------------- |
| wrist pitch   | 比較的反映              |
| wrist yaw     | 中程度に反映            |
| wrist roll    | 強く平滑化・制限        |
| forearm twist | lowerArm と hand に分配 |

前腕の twist は、`lowerArm` と `hand` のどちらか一方に集約しない方が自然です。

```text
forearmTwist = estimatedHandRoll

lowerArmTwist = forearmTwist * 0.60
handTwist     = forearmTwist * 0.40
```

---

### 9.2 指は「各関節の3D回転」ではなく「curl / splay」で制御する

Hand Landmarker は 21点を出しますが、これをそのまま VRM の各指ボーンの3D回転へ変換すると破綻しやすいです。特に、単眼カメラでは指先の奥行きや重なりが不安定です。

推奨は、各指について低次元のパラメータへ落とす方式です。

```ts
type FingerPose = {
    thumb: { curl: number; spread: number; oppose: number };
    index: { curl: number; spread: number };
    middle: { curl: number; spread: number };
    ring: { curl: number; spread: number };
    little: { curl: number; spread: number };
};
```

各 finger の `curl` は、MCP / PIP / DIP の角度から求めます。

```text
curl = weightedAngle(
  MCP-PIP-DIP,
  PIP-DIP-TIP
)
```

そして、VRMの指ボーンには次のように割り当てます。

| 指ボーン     | 入力                        |
| ------------ | --------------------------- |
| proximal     | curl の主成分               |
| intermediate | curl の補助成分             |
| distal       | curl の小成分               |
| spread       | proximal の横方向回転に限定 |

指の自然さでは、完全な3D追従よりも、**開いている / 握っている / 指している / 手を振っている**が認識できることの方が重要です。

---

### 9.3 手が消えたときの扱い

手が画面外に出たり、顔の前に来たりすると、Hand Landmarker の confidence が落ちます。このときに即座に neutral に戻すと不自然です。

推奨状態機械は次です。

```text
Tracked
  ↓ confidence低下
Suspect
  ↓ 一定時間復帰なし
Lost
  ↓ 再検出
Recovered
  ↓ 安定
Tracked
```

| 状態      | 処理                                        |
| --------- | ------------------------------------------- |
| Tracked   | 通常追従                                    |
| Suspect   | 直前姿勢を保持しつつ速度を減衰              |
| Lost      | 腕はPose wristで継続、指はゆっくりneutralへ |
| Recovered | 急に飛ばさず、0.2〜0.5秒程度で再接続        |
| Tracked   | 通常追従へ戻る                              |

Hand Landmarker は video / live stream mode では tracking を利用し、手の存在信頼度が落ちた場合に palm detector を再実行する設計です。したがって、アプリ側でも「一瞬消えたら即リセット」ではなく、検出器側の再捕捉と整合する状態管理を持つべきです。([Google AI for Developers][5])

---

## 10. 関節制約

### 10.1 hard clamp ではなく soft limit を使う

関節角を単純に clamp すると、境界で急に止まって見えます。推奨は soft limit です。

```text
rawAngle
  ↓
softLimit(angle, min, max, softness)
  ↓
limitedAngle
```

soft limit は、制限値に近づくほど滑らかに増分を減らす関数です。例えば、`tanh` や smoothstep を使って実装できます。

---

### 10.2 推奨初期制約

VRoid系キャラクター向けの初期値としては、次のような制約から始めるとよいです。厳密な人体可動域ではなく、**破綻防止と見た目優先の制約**です。

| 部位       |        yaw |           pitch | roll / twist |
| ---------- | ---------: | --------------: | -----------: |
| spine      |       ±15° |            ±10° |          ±8° |
| chest      |       ±25° |            ±20° |         ±15° |
| upperChest |       ±25° |            ±20° |         ±15° |
| neck       |       ±25° |            ±20° |         ±15° |
| head       |       ±35° |            ±25° |         ±20° |
| shoulder   |   cone制約 |        cone制約 |   twist ±45° |
| elbow      | 原則 hinge | 0〜145° flexion |      twist小 |
| lowerArm   |          - |               - |   twist ±80° |
| wrist      |       ±35° |            ±45° |         ±45° |

肩は yaw / pitch / roll の個別制限よりも、**swing-twist decomposition** で扱う方が安定します。

```text
shoulderRotation
  → swing component
  → twist component
  → swing cone limit
  → twist range limit
```

swing-twist 分解はキャラクター関節制約で広く使われますが、分解の特異点や急な反転には注意が必要です。実装では、前フレームとの連続性、最大角速度制限、fallback軸を持たせるべきです。

---

## 11. 時間フィルタリング

### 11.1 raw landmark だけを平滑化しない

よくある失敗は、MediaPipe の landmark 座標だけを平滑化して、その後にIKを解く方式です。この方式では、以下の問題が残ります。

| 問題             | 理由                                       |
| ---------------- | ------------------------------------------ |
| 肘反転が残る     | landmark座標が滑らかでもIK解が不連続になる |
| 手首rollが暴れる | palm basisの向きが不連続                   |
| 体幹が揺れる     | camera depth の揺れが体幹に伝わる          |
| 欠落時に飛ぶ     | 再検出時のID・位置変化を吸収できない       |

推奨は、複数段のフィルタリングです。

```text
landmark-level light smoothing
  ↓
semantic measurement smoothing
  ↓
IK target smoothing
  ↓
joint rotation smoothing
  ↓
final pose confidence blending
```

---

### 11.2 One Euro Filter を基本にする

リアルタイムモーションでは、遅延とジッターのトレードオフが問題になります。One Euro Filter は、低速時にはジッターを抑え、高速時にはカットオフ周波数を上げて遅延を減らす設計のため、この用途に適しています。公式ページでも、まず `beta = 0` で `mincutoff` を調整して低速時のジッターを抑え、その後 `beta` を上げて高速動作時の遅延を減らす調整手順が示されています。([Géry Casiez][11])

推奨対象は次です。

| 対象           | フィルタ空間         |
| -------------- | -------------------- |
| shoulderCenter | body-local position  |
| wrist target   | body-local position  |
| elbow pole     | unit vector          |
| torso rotation | quaternion log space |
| head rotation  | quaternion log space |
| wrist rotation | quaternion log space |
| finger curl    | scalar               |

Quaternion を Euler 角に変換して平滑化するのは避けます。代わりに、前フレームとの差分 quaternion を log map に変換し、3次元ベクトルとして平滑化してから exp map で戻します。

```text
q_delta = inverse(q_prev) * q_current
v = log(q_delta)
v_filtered = oneEuro(v)
q_filtered = q_prev * exp(v_filtered)
```

---

### 11.3 部位ごとにフィルタ係数を変える

全身に同じフィルタをかけると、動きの印象が悪くなります。

| 部位         | 方針                                   |
| ------------ | -------------------------------------- |
| torso        | 強めに平滑化                           |
| shoulder     | 強めに平滑化                           |
| upperArm     | 中程度                                 |
| lowerArm     | 中程度                                 |
| wrist target | やや反応性重視                         |
| wrist roll   | 強めに平滑化                           |
| fingers      | 反応性重視。ただし hysteresis を入れる |
| head         | 中程度。急な反転を抑える               |

特に指は、連続値として滑らかにするだけでなく、**open / half / closed** のような認識状態に hysteresis を入れると見た目が安定します。

---

## 12. VRM-1.0 retarget

### 12.1 VRM bone を直接 world rotation で上書きしない

VRM-1.0 では、humanoid bone は glTF node にマップされます。モデルによって rest rotation、optional bone、node階層が異なるため、world rotation を直接書き込むとモデル差分に弱くなります。VRM仕様では、humanoid bones の親子関係や optional bones が定義されており、humanoid bone 間に non-humanoid node が存在しうることも示されています。([GitHub][7])

推奨は次です。

```text
normalized humanoid local rotation
  ↓
avatar rest pose compensation
  ↓
VRM bone local rotation
```

VRM Animation の仕様では、source model の pose を NormalizedLocalRotation に変換し、destination model の rest rotation を用いて適用する考え方が示されています。optional bones が異なる場合は、存在するボーンだけ適用する、または子ボーンへ回転を分配する方針も示されています。([GitHub][8])

---

### 12.2 optional bone の扱い

VRoid Studio 由来モデルでも、`chest`, `upperChest`, `shoulder` などの有無や構成が異なる可能性があります。これに対応するため、モーションソルバは次のように書きます。

| ボーン構成                 | 処理                           |
| -------------------------- | ------------------------------ |
| spine + chest + upperChest | 3段分配                        |
| spine + chest              | upperChest分をchestへ          |
| spineのみ                  | torso回転をspineへ集約         |
| shoulderあり               | shoulder compensationを適用    |
| shoulderなし               | upperArm root補正へ吸収        |
| finger bones不足           | 存在する指ボーンにcurlを再分配 |

この分配は、VRMのモデル差分に対する堅牢性を大きく上げます。

---

### 12.3 モデルサイズ差への対応

被写体の人間よりアバターが小柄、あるいは頭身が違う場合、単純な座標スケールでは破綻します。

推奨は、**部位別スケール**です。

```text
avatarShoulderWidth / humanShoulderWidth
avatarUpperArmLength / humanUpperArmLength
avatarLowerArmLength / humanLowerArmLength
avatarTorsoHeight / humanTorsoHeight
```

腕IK target は、肩を基準にして次のように正規化します。

```text
humanLocalWrist = humanWrist - humanShoulder

scaledWrist.x *= avatarShoulderWidthScale
scaledWrist.y *= avatarTorsoScale
scaledWrist.z *= armDepthScale

target = avatarShoulder + scaledWrist
target = clampToAvatarReach(target)
```

`armDepthScale` は特に注意が必要です。単眼推定の z は不安定になりやすいため、奥行き方向は弱めに反映します。

```text
armDepthScale = 0.5〜0.8
```

---

## 13. Character style layer

今回の目的では、撮影者の動きを完全に再現するよりも、キャラクターとして自然に見えることが重要です。そのため、IKの後段に **style layer** を置きます。

### 13.1 推奨スタイルパラメータ

```ts
type MotionStyle = {
    torsoFollow: number;
    chestFollow: number;
    headFollow: number;

    armReachScale: number;
    armDepthScale: number;

    shoulderResponsiveness: number;
    wristRollResponsiveness: number;
    fingerResponsiveness: number;

    elbowOutwardBias: number;
    motionSoftness: number;
};
```

初期値の例です。

```ts
const vroidCuteStyle: MotionStyle = {
    torsoFollow: 0.45,
    chestFollow: 0.65,
    headFollow: 0.8,

    armReachScale: 0.92,
    armDepthScale: 0.65,

    shoulderResponsiveness: 0.45,
    wristRollResponsiveness: 0.35,
    fingerResponsiveness: 0.8,

    elbowOutwardBias: 0.3,
    motionSoftness: 0.7,
};
```

この layer により、検出結果が同じでも、キャラクターの印象を調整できます。

---

### 13.2 「かわいさ」に効く補正

| 補正                | 効果                                   |
| ------------------- | -------------------------------------- |
| armReachScale < 1.0 | 腕が伸び切らず柔らかく見える           |
| elbowOutwardBias    | シルエットが明確になり、腕が潰れにくい |
| shoulder damping    | 肩が暴れず、キャラらしく落ち着く       |
| chest under-drive   | 胴体の細かい揺れを抑える               |
| wrist roll damping  | 手首の不自然な回転を抑える             |
| finger hysteresis   | 指のちらつきを抑える                   |

特に重要なのは、**人間の手先位置を正確に再現しようとしすぎない**ことです。腕の reach を少し短くし、肘を外側に保つだけで、VRoid系キャラクターの印象はかなり安定します。

---

## 14. Optional: constrained optimization

最良品質をさらに狙う場合、IKだけでなく、軽量な最適化層を追加できます。

### 14.1 目的関数

```text
Loss =
  w_wrist   * wristTargetError
+ w_elbow   * elbowDirectionError
+ w_shoulder* shoulderNaturalnessPenalty
+ w_limit   * jointLimitPenalty
+ w_smooth  * temporalSmoothnessPenalty
+ w_style   * characterStylePenalty
```

最適化変数は、全身ではなく上半身に限定します。

```text
spine yaw/pitch/roll
chest yaw/pitch/roll
upperChest yaw/pitch/roll
left shoulder swing/twist
left elbow flexion
left forearm twist
right shoulder swing/twist
right elbow flexion
right forearm twist
head/neck split
```

MediaPipe Pose を使った研究でも、MediaPipe Pose の2Dランドマークとhumanoid modelを照合し、関節角や体幹姿勢を最適化する方式が提案されています。この研究では、2D投影誤差、重心、関節角ペナルティなどを含む目的関数を使い、単眼推定の奥行き曖昧性をモデル制約で補っています。([MDPI][4])

---

### 14.2 使いどころ

ただし、最初から最適化を主方式にする必要はありません。

推奨は次です。

| 段階     | 方式                                  |
| -------- | ------------------------------------- |
| 初期実装 | analytic IK + constraints             |
| 品質改善 | pole vector / shoulder / wrist の補正 |
| 高品質化 | constrained optimization を一部導入   |
| 最終形   | IK初期解 → 数回の軽量最適化           |

最適化は全フレームで重い非線形問題を解くのではなく、**IKで得た初期解を数回だけ補正する**位置づけにするのがよいです。

---

## 15. 代替推定モデルの評価

結論として、今回の条件では **MediaPipeを主軸のままにするのが妥当**です。

### 15.1 MoveNet

MoveNet は高速な pose estimation model として提供されていますが、標準的には17 keypointsであり、手指や顔、VRM上半身制御に必要な詳細情報が不足します。TensorFlowのドキュメントでも、MoveNet / PoseNet は17 keypoints、BlazePose は33 keypointsと説明されています。([TensorFlow][12])

今回の用途では、MoveNet は次の理由で主方式には向きません。

| 観点       | 評価                   |
| ---------- | ---------------------- |
| 姿勢推定   | 高速                   |
| 上半身詳細 | MediaPipe Poseより弱い |
| 手指       | 別途必要               |
| 顔・頭部   | 別途必要               |
| VRM制御    | 情報不足               |
| 結論       | 置き換え候補ではない   |

---

### 15.2 RTMPose / MMPose 系

RTMPose / MMPose 系は研究・サーバーサイド用途では強力ですが、MMPose は PyTorch ベースの toolbox であり、2D pose、hand、face、whole-body、3D mesh など広範なモデルを扱うフレームワークです。([GitHub][13])

今回の制約では、次の理由で優先度は低いです。

| 観点                   | 評価                           |
| ---------------------- | ------------------------------ |
| 推定精度               | 高い候補がある                 |
| ブラウザ統合           | MediaPipeより重い              |
| ランタイム             | PyTorch/サーバー寄り           |
| ライセンス・モデル確認 | 個別確認が必要                 |
| システムリソース       | MediaPipeより厳しくなりやすい  |
| 結論                   | 研究比較対象。主実装には不採用 |

---

### 15.3 OpenPose

OpenPose は有名ですが、ライセンス面で今回の条件に合いません。公式の license section では、非商用の研究・教育目的などに限定される条項が示されています。([GitHub][14])

したがって、OpenPose は除外します。

---

### 15.4 MediaPipe の位置づけ

MediaPipe 本体は Apache-2.0 license で公開されています。([GitHub][15])

また、Pose / Hand / Face がそれぞれ Web 向けに提供され、上半身モーションに必要な body / hand / head 情報を統一的に取得できるため、今回の用途では MediaPipe が最も実装合理性の高い選択です。

---

## 16. 推奨実装順序

### Phase 1: VRM rig abstraction

最初に、VRMモデルを直接操作するのではなく、rig abstraction を作ります。

```ts
class VrmHumanoidRig {
    getBone(name: VRMHumanBoneName): THREE.Object3D | undefined;
    getRestLocalRotation(name: VRMHumanBoneName): THREE.Quaternion;
    getBoneLength(a: VRMHumanBoneName, b: VRMHumanBoneName): number;
    applyNormalizedPose(pose: NormalizedUpperBodyPose): void;
}
```

この段階で行うことは次です。

| 実装                | 目的                       |
| ------------------- | -------------------------- |
| humanBones の列挙   | モデル差分吸収             |
| rest pose の保存    | retarget補正               |
| bone length 計測    | IK用                       |
| optional bone 判定  | spine/chest/upperChest分配 |
| debug skeleton 表示 | 品質確認                   |

---

### Phase 2: Perception fusion

MediaPipe 出力を統合する層を作ります。

```ts
class PerceptionFusion {
    update(
        poseResult: PoseLandmarkerResult,
        handResult: HandLandmarkerResult,
        faceResult: FaceLandmarkerResult,
        timestampMs: number,
    ): BodyMeasurementFrame;
}
```

ここで行うことは次です。

| 処理              | 内容                                           |
| ----------------- | ---------------------------------------------- |
| timestamp管理     | Pose / Hand / Face の結果を同一frameとして扱う |
| handedness補正    | hand handedness と pose wrist を照合           |
| confidence計算    | 各部位の信頼度を統合                           |
| dropout判定       | Tracked / Suspect / Lost 状態管理              |
| camera mirror補正 | 自撮り表示と座標系の混同を防ぐ                 |

---

### Phase 3: Torso / head solver

体幹と頭部だけを先に完成させます。

```ts
class TorsoHeadSolver {
    solve(
        frame: BodyMeasurementFrame,
        rig: AvatarRigMetrics,
    ): Partial<NormalizedUpperBodyPose>;
}
```

この段階では、腕や指を動かさなくても、以下を確認できます。

| 確認項目                            |
| ----------------------------------- |
| 正面姿勢で体幹が安定する            |
| 横を向いても bodyFront が反転しない |
| 頭部が首とheadに自然に分配される    |
| Pose欠落時に急に飛ばない            |

---

### Phase 4: Arm IK

腕の2-bone IKを実装します。

```ts
class ArmIkSolver {
    solveArm(
        side: "left" | "right",
        measurement: ArmMeasurement,
        torsoFrame: TorsoFrame,
        rig: AvatarRigMetrics,
        previous: PreviousArmState,
        style: MotionStyle,
    ): ArmPose;
}
```

この段階の評価項目は次です。

| 確認項目                       |
| ------------------------------ |
| 肘が反転しない                 |
| 手を上げても肩が破綻しない     |
| 腕が伸び切らない               |
| 手が画面外に出ても急に戻らない |
| 左右の手が入れ替わらない       |

---

### Phase 5: Wrist / fingers

Hand Landmarker を使って、手首と指を実装します。

```ts
class HandPoseSolver {
    solveHand(hand: HandMeasurement, previous: PreviousHandState): HandPose;
}
```

指は、最初から各関節の完全追従を狙わず、次の順で進めるのがよいです。

| 段階 | 実装                         |
| ---- | ---------------------------- |
| 1    | 全指共通の open / close      |
| 2    | thumb / index / other の分離 |
| 3    | 5指 curl                     |
| 4    | spread                       |
| 5    | thumb oppose                 |
| 6    | 指ボーン個別の補正           |

---

### Phase 6: Temporal filter

最後に、全体の時間フィルタを統合します。

```ts
class MotionTemporalFilter {
    update(
        rawPose: NormalizedUpperBodyPose,
        confidence: PoseConfidence,
    ): NormalizedUpperBodyPose;
}
```

重要なのは、フィルタを後付けの単一処理にしないことです。部位ごと、状態ごとに係数を変えます。

---

### Phase 7: Optional optimization

品質が必要であれば、IK後に軽量な最適化を追加します。

```text
MediaPipe measurements
  ↓
analytic IK initial pose
  ↓
constraint projection
  ↓
2〜5 iterations optimization
  ↓
filtered pose
```

この段階は、最初から実装しない方がよいです。まず analytic IK + constraints + filtering で基礎品質を出し、その後に最適化を入れます。

---

## 17. テスト設計

この種のシステムは、ライブカメラだけで調整すると再現性が低くなります。MediaPipe の出力を記録し、同じ入力を何度も再生できるテスト環境を作るべきです。

### 17.1 記録すべきデータ

```ts
type RecordedPerceptionFrame = {
    timestampMs: number;
    poseLandmarks: unknown;
    poseWorldLandmarks: unknown;
    handLandmarks: unknown;
    handWorldLandmarks: unknown;
    handedness: unknown;
    faceLandmarks: unknown;
    faceTransformMatrix: unknown;
};
```

動画そのものではなく、MediaPipeの出力を保存しておくと、motion solver の調整が容易です。

---

### 17.2 テストケース

| ケース                   | 見るべき問題              |
| ------------------------ | ------------------------- |
| 正面 neutral             | 基準姿勢の安定性          |
| ゆっくり手を上げる       | shoulder / elbow の自然さ |
| 高速に手を振る           | 遅延とジッター            |
| 手を顔の前に出す         | Hand / Face の干渉        |
| 片手を画面外に出す       | dropout処理               |
| 腕を交差する             | 左右取り違え              |
| 横を向く                 | bodyFront反転             |
| 手をカメラ方向に突き出す | depth ambiguity           |
| 小柄なVRoidモデル        | reach / scale補正         |
| upperChestなしモデル     | optional bone分配         |

---

### 17.3 評価指標

完全な客観評価は難しいですが、開発時には次をログ化すると改善しやすいです。

| 指標                                 | 内容                             |
| ------------------------------------ | -------------------------------- |
| wrist target error                   | IK後の手先とtargetの距離         |
| elbow flip count                     | pole vector の急反転回数         |
| shoulder limit occupancy             | shoulder制約に張り付いている割合 |
| quaternion angular velocity          | ボーン回転速度                   |
| dropped hand duration                | 手の欠落時間                     |
| recovery jump angle                  | 再検出時の角度ジャンプ           |
| confidence-weighted smoothing amount | confidence低下時の補間量         |
| subjective score                     | 見た目の自然さ                   |

---

## 18. 最終推奨構成

最終的には、次の構成を推奨します。

| 領域       | 推奨方式                                               |
| ---------- | ------------------------------------------------------ |
| 検出       | MediaPipe Pose / Hand / Face 個別実行                  |
| 統合       | 自前 PerceptionFusion                                  |
| 座標系     | camera → body-local → normalized pose → VRM local      |
| 体幹       | shoulder / hip / face を用いた安定フレーム推定         |
| 頭部       | Face transformation matrix + neck/head分配             |
| 腕         | 自前 2-bone analytic IK                                |
| 肘         | pole vector + outward bias + previous frame continuity |
| 肩         | 腕ターゲット由来の secondary motion                    |
| 手首       | Hand palm basis。ただし roll は強く制限                |
| 指         | 21点 landmark → curl / splay / oppose                  |
| 制約       | swing-twist + soft limit                               |
| 時間平滑化 | One Euro Filter + quaternion log-space smoothing       |
| 欠落処理   | Tracked / Suspect / Lost / Recovered 状態機械          |
| VRM対応    | normalized local rotation → avatar local rotation      |
| 体型差     | 部位別スケール + reach clamp                           |
| 追加最適化 | IK後の軽量 constrained optimization を任意導入         |
| 代替モデル | 原則不要。MediaPipe継続                                |

この設計の中心は、**MediaPipeを高精度モーションキャプチャとして扱わず、キャラクター制御のための観測入力として扱う**ことです。Pose / Hand / Face の生出力は不安定でも、体幹基準化、IK、関節制約、時間フィルタ、VRM retarget、キャラクター向けstyle layerを挟むことで、単眼Webカメラでも「かわいいキャラクターとして自然な上半身モーション」に近づけられます。

[1]: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker "Pose landmark detection guide  |  Google AI Edge  |  Google AI for Developers"
[2]: https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/ "MediaPipe Holistic — Simultaneous Face, Hand and Pose Prediction, on Device"
[3]: https://ai.google.dev/edge/mediapipe/solutions/vision/holistic_landmarker "Holistic landmarks detection task guide  |  Google AI Edge  |  Google AI for Developers"
[4]: https://www.mdpi.com/2076-3417/13/4/2700 "Human Pose Estimation Using MediaPipe Pose and Optimization Method Based on a Humanoid Model | MDPI"
[5]: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker "Hand landmarks detection guide  |  Google AI Edge  |  Google AI for Developers"
[6]: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker "Face landmark detection guide  |  Google AI Edge  |  Google AI for Developers"
[7]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md "vrm-specification/specification/VRMC_vrm-1.0/humanoid.md at master · vrm-c/vrm-specification · GitHub"
[8]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md "vrm-specification/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md at master · vrm-c/vrm-specification · GitHub"
[9]: https://threejs.org/docs/pages/CCDIKSolver.html "CCDIKSolver - Three.js Docs"
[10]: https://www.sciencedirect.com/science/article/abs/pii/S1524070311000178 "FABRIK: A fast, iterative solver for the Inverse Kinematics problem - ScienceDirect"
[11]: https://gery.casiez.net/1euro/ "1€ Filter"
[12]: https://www.tensorflow.org/hub/tutorials/movenet "MoveNet: Ultra fast and accurate pose detection model.  |  TensorFlow Hub"
[13]: https://github.com/open-mmlab/mmpose "GitHub - open-mmlab/mmpose: OpenMMLab Pose Estimation Toolbox and Benchmark. · GitHub"
[14]: https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/LICENSE "openpose/LICENSE at master · CMU-Perceptual-Computing-Lab/openpose · GitHub"
[15]: https://github.com/google-ai-edge/mediapipe "GitHub - google-ai-edge/mediapipe: Cross-platform, customizable ML solutions for live and streaming media. · GitHub"
