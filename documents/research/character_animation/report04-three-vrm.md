# three-vrmによるVRM-1.0キャラクターアニメーション実装ベストプラクティス

対象時点: **2026年6月 / three-vrm v3.5.3 / VRM-1.0 / Three.js / VRoid Studio標準系モデル**

## Question

現在、一台のWebカメラの映像で撮影した人間の動きを元に、MediaPipe のPose Landmarker (<https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)、>
Hand Landmarker (<https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)、>
face landmarker(<https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker?hl=ja>) などを用いて、
3Dキャラクターの上半身の動きを生成するしくみ(モーションキャプチャー)の独自実装を行っています。

プロジェクトのリポジトリは下記にあります。
<https://github.com/Sincromisor/Sincromisor/tree/main/sincromisor-frontend>

主な技術スタックは下記の通りです。

- キャラクターモデル: VRM-1.0 <https://github.com/vrm-c/vrm-specification/tree/master/specification>
- 描画: Webブラウザ + Three.js <https://threejs.org/>
- モデル制作: VRoid Studioを前提 <https://vroid.com/studio>
- モデル描画・操作: Three-vrm v3.5.3 <https://github.com/pixiv/three-vrm>

本プロジェクトは「不確実な観測値から「キャラクターとして破綻しない動作状態」を推定するモーションシステム」を目指しています。
今回は、"three-vrmを用いてキャラクターモーションを実装する際の、2026年6月現在の「three-vrmによるキャラクターアニメーション実装のベストプラクティス」を確立し、レポートにまとめる"をお願いしたいです。

基本的な条件は下記の通りです。
    - キャラクターモーションの最適な「実装方法」を網羅的に調査し、開発に資するレポートにまとめる
    - 既存実装との互換性などは考慮せず、「最大限最良の実装にするにはどうすればよいか」だけを考える
    - 必ずしも人間に合わせたリアルな動きである必要はなく、かわいいキャラクターとしての自然な動きを実現することが目的
    - 調査対象資料の言語はこだわらない
    - 参考にした資料があれば出典を明記する

- 今回はスコープ外とすること
    - 既存実装をベースとした改良案の提示
    - 直接的な「モーションキャプチャー&キャラクターアニメーション」機能フレームワークやライブラリの提案(合理的な範囲で独自に実装することも目的のひとつ)

調査の前に明確にしておきたいことがあれば、それを提示してください。

## 0. 結論

今回の条件では、three-vrmを「ボーンを直接回す便利ライブラリ」として使うのではなく、**VRM-1.0 humanoid runtimeとして扱い、最終的な上半身姿勢を `VRMHumanoid` の normalized pose に集約して適用する**のが最良です。

three-vrm v3.5.3は2026年5月18日にリリースされており、2026年6月時点の対象バージョンとして妥当です。three-vrm v3系では `@pixiv/three-vrm` が基本パッケージで、WebGPU対応もありますが、WebGPU側は Three.js r167+ と NodeMaterial 系の互換性注意が明記されています。したがって、モーション実装の安定性を優先するなら、まずは **WebGLRenderer + three-vrm v3.5.3 + VRM-1.0 normalized humanoid pose** を標準構成にするのが堅実です。([GitHub][1])

最重要の実装原則は次です。

| 領域             | ベストプラクティス                                               |
| -------------- | ------------------------------------------------------- |
| VRM制御API       | `vrm.humanoid.setNormalizedPose()` を主経路にする              |
| ボーン指定          | Three.js node名ではなく `VRMHumanBoneName` を基準にする            |
| 座標・回転          | world rotationではなく、**rest/T-poseからのlocal rotation** を扱う |
| 更新順            | すべての姿勢合成後に `vrm.update(delta)` を1回呼ぶ                    |
| AnimationMixer | 直接同じボーンを奪い合わない。clipはpose layerとして合成する                   |
| optional bone  | `chest`, `upperChest`, `shoulder`, 指ボーンの有無を前提に分配する      |
| 表情・視線          | 今回は主制御から分離。ただし `vrm.update()` の更新順には含まれる                |
| MediaPipe連携    | raw landmarkからthree-vrm boneを直接書かず、最終 `VRMPose` に変換する   |

既存のプロジェクト資料で整理されている「不確実な観測値を信頼度・時系列・canonical stateを経て最終姿勢へ落とす」という方針とは整合します。ただし今回は、主眼を **three-vrm runtimeを壊さず、モデル差分に強い形で姿勢を適用すること** に置きます。

---

## 1. three-vrmでの基本モデル

three-vrmの中心は `VRM` オブジェクトです。`VRM` は `scene`, `humanoid`, `expressionManager`, `lookAt`, `springBoneManager`, `nodeConstraintManager` などを持ち、`update(delta)` によって各コンポーネントを更新します。公式API上も、`VRM.update(delta)` は毎フレーム呼ぶべき更新関数として定義されています。([Pixiv][2])

VRM-1.0では humanoid bone は glTF node へのマッピングとして定義されます。`hips` と `spine` と `head` は必須、`chest`, `upperChest`, `neck`, `leftShoulder`, `rightShoulder`, 指ボーン群などは optional です。また、humanoid bone同士の間に非humanoid nodeが挟まることも許されています。したがって、Three.jsの親子階層やnode名を前提にして直接辿る実装は避けるべきです。([GitHub][3])

### 推奨する役割分担

```text
MediaPipe / tracking layer
  -> 独自の観測・信頼度・時系列処理

Motion solver layer
  -> 体幹・頭・腕・手首・指の最終意図を決める

VRM pose layer
  -> VRMHumanBoneName単位の normalized local pose に変換

three-vrm runtime
  -> normalized humanoid pose を raw glTF bone へ反映
  -> constraints / spring bone / material 等を更新

Three.js renderer
  -> 描画
```

three-vrm層に入る時点では、すでに「このフレームでキャラクターが取るべき姿勢」が決まっているべきです。three-vrm層でMediaPipeの信頼度判定や肘反転回避を行うのではなく、three-vrm層は **VRMモデル差分を吸収しながら、安全に最終姿勢を適用する層** として設計します。

---

## 2. `raw` ではなく `normalized` を主経路にする

three-vrmの `VRMHumanoid` には raw bone と normalized bone の概念があります。重要なのは、通常のキャラクターアニメーション制御では **normalized poseを主経路にする** ことです。

`getNormalizedPose()` / `setNormalizedPose()` が扱う値は、normalized human boneの現在姿勢であり、各transformはrest pose / T-poseからのlocal transformとして扱われます。一方、`getRawAbsolutePose()` のようなabsolute poseはモデルの初期状態を含み、モデル間互換性がないため、一般的なretarget用途には向きません。three-vrmのドキュメントでも、`setRawPose()` は `autoUpdateHumanBones` が有効な場合には `setNormalizedPose()` を使うべきだと警告されています。([Pixiv][4])

### 採用すべきpose形式

```ts
import type { VRMPose } from "@pixiv/three-vrm";
import { VRMHumanBoneName } from "@pixiv/three-vrm";

const pose: VRMPose = {
  [VRMHumanBoneName.Chest]: {
    rotation: [0, 0, 0, 1], // [x, y, z, w]
  },
  [VRMHumanBoneName.LeftUpperArm]: {
    rotation: [0, 0, 0, 1],
  },
};
```

`VRMPose` は `VRMHumanBoneName` をキーにしたpose表現で、各boneは省略可能です。また、すべてのVRMモデルがすべてのboneを持つとは限らないことがAPI上でも前提化されています。([Pixiv][5])

### 禁止に近い実装

```ts
// 非推奨: モデル差分に弱く、three-vrmのhumanoid更新と競合しやすい
const node = vrm.scene.getObjectByName("J_Bip_L_UpperArm");
node!.quaternion.copy(worldQuaternion);
```

この方式は、VRoid Studio由来モデルでは一見動いても、別モデル・別エクスポート・optional bone構成差分・rest rotation差分で破綻しやすくなります。

### 推奨実装

```ts
// 推奨: VRMHumanBoneName単位でnormalized poseを作る
vrm.humanoid.setNormalizedPose(finalPose);
vrm.update(delta);
```

---

## 3. `normalizedRestPose` をpose入力として使わない

three-vrmの `VRMHumanoid` には `normalizedRestPose` がありますが、これは `setNormalizedPose()` / `getNormalizedPose()` と互換のpose値ではありません。ドキュメントでも、`normalizedRestPose` は非相対値を含むため `setNormalizedPose` / `getNormalizedPose` と互換ではないと明記されています。([Pixiv][4])

したがって、次のような使い方は避けます。

```ts
// 非推奨
vrm.humanoid.setNormalizedPose(vrm.humanoid.normalizedRestPose);
```

代わりに、毎フレームの最終poseは **identity rotationをneutralとして、自前のpose bufferで構築**します。

```ts
const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

const neutralUpperBodyPose: VRMPose = {
  [VRMHumanBoneName.Spine]: { rotation: IDENTITY },
  [VRMHumanBoneName.Chest]: { rotation: IDENTITY },
  [VRMHumanBoneName.UpperChest]: { rotation: IDENTITY },
  [VRMHumanBoneName.Neck]: { rotation: IDENTITY },
  [VRMHumanBoneName.Head]: { rotation: IDENTITY },
};
```

部分poseだけを `setNormalizedPose()` し続けると、前フレームの値が残って「姿勢が戻らない」問題が出やすくなります。運用ルールは次のどちらかに統一します。

| 方針                   | 内容                                   |       推奨度 |
| -------------------- | ------------------------------------ | --------: |
| full owned pose      | 自分が所有するboneは毎フレーム全て書く                |         高 |
| reset + partial pose | `resetNormalizedPose()` 後に必要boneだけ書く | 開発・デバッグ向き |
| partial overwrite継続  | 更新したboneだけ上書きし、残りは前回値                |       非推奨 |

---

## 4. 更新順序の標準形

three-vrmの内部更新順は、ソース上では概ね次の順です。

```text
VRM.update(delta)
  -> VRMCore.update(delta)
      -> humanoid.update()
      -> lookAt.update(delta)
      -> expressionManager.update()
  -> nodeConstraintManager.update()
  -> springBoneManager.update(delta)
  -> material.update(delta)
```

`VRMHumanoid.update()` は `autoUpdateHumanBones` が有効な場合、normalized rigからraw rigへ姿勢を転送します。`VRM.update()` の後段では node constraint、spring bone、material更新が走ります。([GitHub][6])

したがって、アプリケーション側の標準フレームループは次にします。

```ts
function updateFrame(delta: number) {
  // 1. MediaPipeなどの最新観測値を取得
  const observation = perception.readLatest();

  // 2. 信頼度・時系列・IK・スタイル補正を含めて最終poseを作る
  const trackingPose = motionSolver.solve(observation, delta);

  // 3. 短い意味動作clipや補正poseを合成する
  const finalPose = poseComposer.compose({
    trackingPose,
    semanticPose: semanticClipLayer.getPose(delta),
    style: avatarStyle,
  });

  // 4. three-vrmへは最後に1回だけ適用
  vrm.humanoid.setNormalizedPose(finalPose);

  // 5. humanoid -> constraints -> spring -> material を更新
  vrm.update(delta);

  // 6. 描画
  renderer.render(scene, camera);
}
```

### 重要な設計規約

**同一フレームで、同じboneに対して複数の書き手を作らない**ことが重要です。

悪い例:

```text
AnimationMixer が leftUpperArm を更新
  -> IK solver も leftUpperArm を直接更新
  -> semantic clip も leftUpperArm を直接更新
  -> 最後に実行された処理だけが勝つ
```

良い例:

```text
Animation / IK / semantic / fallback
  -> それぞれ pose delta として出力
  -> PoseComposer で1つの finalPose に合成
  -> setNormalizedPose(finalPose) を1回
  -> vrm.update(delta)
```

---

## 5. VRMロード時のベストプラクティス

three-vrmでは `GLTFLoader` に `VRMLoaderPlugin` を登録してVRMを読み込むのが基本です。`VRMLoaderPlugin` は humanoid、expression、firstPerson、lookAt、MToon material、springBone、nodeConstraint などのpluginを内部に持つGLTFLoader pluginです。([Pixiv][7])

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  VRM,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";

export async function loadVrm(url: string): Promise<VRM> {
  const loader = new GLTFLoader();

  loader.register((parser) => {
    return new VRMLoaderPlugin(parser);
  });

  const gltf = await loader.loadAsync(url);
  const vrm = gltf.userData.vrm as VRM;

  // VRM-1.0のみを正式対象にする。
  // VRM-0.x互換処理はここでは標準経路に入れない。

  // 描画・スキニング性能最適化
  VRMUtils.combineSkeletons(vrm.scene);
  VRMUtils.combineMorphs(vrm);

  // 必要に応じてgeometry最適化
  VRMUtils.removeUnnecessaryVertices(vrm.scene);

  return vrm;
}
```

`VRMUtils.combineSkeletons()` は複数Skeletonの計算を統合して毎フレームのbone matrix計算負荷を減らすための関数です。`combineMorphs()` はVRM expressionsをもとにmorph targetsを結合し、特にモバイル環境でmorph target数制限による問題を回避する目的があります。`removeUnnecessaryJoints()` はdeprecatedなので使わず、代わりに `combineSkeletons()` を使うべきです。([Pixiv][8])

表情は今回スコープ外ですが、`combineMorphs()` はロード最適化としては有効です。ただし、後続の表情調査でexpression制御を詳細に扱う場合は、expression clipやmorph最適化との相互作用を別途検証してください。

---

## 6. bone存在確認とoptional bone方針

`VRMHumanBoneName` には、体幹・頭・腕・指などの標準bone名が定義されています。three-vrmではこれを使ってboneを取得・適用します。([Pixiv][9])

```ts
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

function hasBone(vrm: VRM, name: VRMHumanBoneName): boolean {
  return vrm.humanoid.getNormalizedBoneNode(name) != null;
}
```

VRM-1.0では `chest`, `upperChest`, `neck`, `shoulder`, 指ボーンの多くはoptionalです。VRM Animation仕様でも、`upperChest` や `leftShoulder` のような非必須boneがモデル間で異なる問題が示されており、正規化local rotationを中間形式として扱う考え方が提示されています。([GitHub][10])

### 上半身boneの適用ポリシー

| 部位        | bone                            | 方針                                            |
| --------- | ------------------------------- | --------------------------------------------- |
| root      | `hips`                          | 上半身同期では原則固定。位置移動は慎重に扱う                        |
| torso     | `spine`, `chest`, `upperChest`  | 存在するboneへ分配                                   |
| neck/head | `neck`, `head`                  | `neck` があれば分配、なければ `head` に集約                 |
| shoulder  | `leftShoulder`, `rightShoulder` | あれば肩補正に使う。なければ `upperChest` / `upperArm` 側へ吸収 |
| arm       | `upperArm`, `lowerArm`, `hand`  | 必須相当として主制御対象                                  |
| fingers   | proximal/intermediate/distal    | 存在するboneだけにcurlを再分配                           |

### optional torso分配例

```ts
type TorsoWeights = {
  spine: number;
  chest: number;
  upperChest: number;
};

function getTorsoWeights(vrm: VRM): TorsoWeights {
  const hasChest = hasBone(vrm, VRMHumanBoneName.Chest);
  const hasUpperChest = hasBone(vrm, VRMHumanBoneName.UpperChest);

  if (hasChest && hasUpperChest) {
    return { spine: 0.25, chest: 0.40, upperChest: 0.35 };
  }

  if (hasChest) {
    return { spine: 0.35, chest: 0.65, upperChest: 0.0 };
  }

  return { spine: 1.0, chest: 0.0, upperChest: 0.0 };
}
```

この分配は「人体として正確」よりも、「VRoid系キャラで肩・胸が破綻しにくい」ことを優先した値です。既存の上半身モーション品質資料でも、胴体・頭・肩のjitterや肩崩れを最優先で避ける方針が整理されています。

---

## 7. local rotationの作り方

three-vrmへ渡すposeは、各boneの **local rotation delta** です。つまり、「モデルの現在world姿勢をこのworld quaternionにする」ではなく、「normalized rest/T-poseからこの回転だけ動かす」という考え方にします。

```text
solver output
  = desired local rotation relative to normalized rest pose

VRMPose rotation
  = [x, y, z, w]
```

### 実装上のルール

1. すべてQuaternionで扱う。Euler角を保存形式にしない。
2. 毎フレーム正規化する。
3. 左右boneの座標軸差分をsolver層に漏らさず、`VrmPoseApplier` で吸収する。
4. `getRawBoneNode()` ではなく `getNormalizedBoneNode()` を検証・debugに使う。
5. 最終適用は `setNormalizedPose()` に集約する。

```ts
function qToArray(q: THREE.Quaternion): [number, number, number, number] {
  q.normalize();
  return [q.x, q.y, q.z, q.w];
}
```

---

## 8. AnimationMixer / VRM Animation / additive clipの扱い

Three.jsの `AnimationMixer` は、特定root上のanimation playerです。`mixer.update(delta)` によりanimation timeを進め、`AnimationAction.weight`, `fadeIn`, `fadeOut`, additive blendなどを使って複数actionを合成できます。([Three.js][11])

three-vrm側には `@pixiv/three-vrm-animation` があり、VRM Animationを読み込む `VRMAnimationLoaderPlugin` と、VRMAnimationを対象VRM用のThree.js `AnimationClip` に変換する `createVRMAnimationClip()` が提供されています。([Pixiv][12])

ただし、今回の用途では **AnimationMixerを主モーション制御器にしない**方が安全です。理由は、MediaPipe追従・IK・semantic clip・fallbackが同じboneを書き換えると、実行順依存の競合が起きるためです。

### 推奨パターンA: pose composer方式

最も安全な方式です。

```text
tracking solver
  -> VRMPose

semantic clip
  -> VRMPoseDelta

idle / breathing
  -> VRMPoseDelta

fallback / comfort pose
  -> VRMPose

PoseComposer
  -> final VRMPose

vrm.humanoid.setNormalizedPose(finalPose)
vrm.update(delta)
```

この方式では、Three.js `AnimationMixer` を使わず、短い上半身clipも自前の `VRMPoseDelta` として保持します。clipデータはQuaternion keyframe列として持ち、実行時にslerpしてpose deltaに変換します。

### 推奨パターンB: staging mixer方式

VRM Animationや既存AnimationClipを活用したい場合は、直接本番VRMにmixerを当てず、**staging用VRMまたはstaging rigでclipを評価し、そのposeを読んでfinal poseへ合成**します。

```text
stagingMixer.update(delta)
  -> stagingVrm.humanoid.getNormalizedPose()
  -> clipPoseDelta抽出
  -> trackingPoseと合成
  -> 本番vrm.humanoid.setNormalizedPose(finalPose)
```

メモリは増えますが、同じboneの所有権競合を避けられます。

### 許容パターンC: 直接AnimationMixer方式

小規模なデモや、trackingとclipがboneを共有しない場合のみ許容します。

```ts
mixer.update(delta);           // clipがboneを書き込む
applyTrackingOverrides();      // trackingが必要boneだけ上書き
vrm.update(delta);
```

この方式は最後に書いた処理が勝ちます。将来の拡張で破綻しやすいため、長期設計では避けるべきです。

### additive clipを使う場合

Three.jsには `QuaternionKeyframeTrack` があり、Quaternion keyframeを扱えます。また `AnimationUtils.makeClipAdditive()` によりclipをadditive形式へ変換できます。([Three.js][13])

ただし、かわいい上半身モーション用途では、additive clipは「全身を上書きする動き」ではなく、**手振り・指差し・説明ジェスチャーのような短い意味動作の補助**として使います。

---

## 9. 上半身bone別の実装規約

### 9.1 hips

上半身同期では、`hips` は基本的に固定します。MediaPipeの単眼推定からhips位置を動かすと、キャラクター全体が揺れて見えます。`VRMPose` では `hips.position` も表現可能ですが、上半身モーションでは原則使わないか、非常に低周波・低振幅に制限します。

```ts
// 上半身同期では通常 position を入れない
const pose: VRMPose = {
  [VRMHumanBoneName.Hips]: {
    rotation: [0, 0, 0, 1],
  },
};
```

### 9.2 spine / chest / upperChest

体幹は、かわいいキャラクターでは「よく動く」よりも「安定している」ことを優先します。`spine`, `chest`, `upperChest` がすべてある場合は分配し、`upperChest` がない場合は `chest` へ、`chest` もない場合は `spine` へ集約します。

```text
spine      = torsoRotation * 0.25
chest      = torsoRotation * 0.40
upperChest = torsoRotation * 0.35
```

片腕を上げたときに胸全体を大きく傾けると不自然なので、肩補正は基本的に `shoulder` と `upperChest` に寄せます。両腕を上げる場合だけ、`chest` を少し使います。

### 9.3 neck / head

表情・視線はスコープ外ですが、頭部姿勢は上半身モーションの自然さに直結します。`neck` がある場合は、head回転を `neck` と `head` に分配します。

```text
neck = headDelta * 0.30〜0.40
head = headDelta * 0.60〜0.70
```

`neck` がないモデルでは `head` に集約します。ただし、首がないモデルで大きなhead回転を入れると折れたように見えるため、回転上限を下げます。

### 9.4 shoulder

`leftShoulder` / `rightShoulder` が存在する場合、腕を上げる動作で積極的に使います。肩boneを使わず `upperArm` だけを回すと、肩・胸・袖まわりが破綻しやすくなります。

```text
armRaiseAssist = smoothstep(30°, 110°, armElevation)

shoulderLift = armRaiseAssist * 10〜20°
upperChest   = armRaiseAssist * 6〜18°
chest        = armRaiseAssist * 0〜12°
```

肩boneがないモデルでは、`upperChest` と `upperArm` 側へ補正を逃がします。既存資料でも、肩・鎖骨・胸の補正は上半身品質に大きく効く領域として整理されています。

### 9.5 upperArm / lowerArm / hand

腕はtwo-bone IKや独自solverで求めた結果を、最終的に次の3boneへ変換します。

```text
leftUpperArm / rightUpperArm
leftLowerArm / rightLowerArm
leftHand / rightHand
```

three-vrm層ではIKを解かず、IK solverが出した `upperArm`, `lowerArm`, `hand` のlocal rotationを受け取るだけにします。

手首rollは特に暴れやすいため、`hand` boneに全rollを入れず、必要なら `lowerArm` twist と `hand` twist に分配します。既存資料でも、手首rollは強く抑え、pitch/yaw中心に扱う方針が推奨されています。

### 9.6 fingers

指は、最初から各関節3D回転を完全再現しない方が安定します。three-vrmのbone適用層では、Hand Landmarkerの21点を直接finger bone rotationに変換するのではなく、`curl`, `spread`, `oppose` のような低次元パラメータをVRM指ボーンへ分配します。

```text
proximal     = curl * 50〜60%
intermediate = curl * 30〜40%
distal       = curl * 10〜20%
```

指boneが欠けている場合は、存在するboneへ再分配します。`splay` は入れるとしても `index` / `little` へ限定し、±10〜15°程度から始めるのが安全です。

---

## 10. MediaPipe入力との接続方針

今回の主題はthree-vrmですが、MediaPipe入力と接続する際の境界は明確にしておくべきです。

```text
MediaPipe landmarks
  -> reliability / temporal / canonical / IK / style
  -> final VRMPose
  -> vrm.humanoid.setNormalizedPose()
```

避けるべき流れは次です。

```text
MediaPipe wrist / elbow / shoulder
  -> Three.js Bone world quaternion
  -> bone.quaternion.copy()
```

単眼Webカメラ由来のlandmarkは奥行きや手首roll、肘方向に不確実性を持ちます。既存資料でも、MediaPipe world landmarksは絶対3D位置として過信せず、左右・上下・相対方向を主に使い、奥行きは圧縮して使う方針が示されています。

three-vrm層に渡す直前のデータ構造は、次のようにします。

```ts
type FinalUpperBodyPose = {
  pose: VRMPose;

  confidence: {
    torso: number;
    head: number;
    leftArm: number;
    rightArm: number;
    leftHand: number;
    rightHand: number;
  };

  debug: {
    source: "tracking" | "semantic" | "fallback" | "mixed";
    clampedBones: VRMHumanBoneName[];
  };
};
```

低confidence時にthree-vrm層で急にneutralへ戻すのではなく、motion solver側で「控えめな自然姿勢」へなめらかに退避させます。キャラクター会話用途では、よく動くが不安定な姿勢より、控えめでも破綻しない姿勢を優先すべきです。

---

## 11. 推奨モジュール構成

three-vrmを主軸にしたモーション実装では、次の分割が扱いやすいです。

```text
src/character/vrm/
  VrmLoader.ts
  VrmRuntime.ts
  VrmHumanoidRig.ts
  VrmBoneProfile.ts
  VrmPoseBuffer.ts
  VrmPoseComposer.ts
  VrmPoseApplier.ts
  VrmClipPoseLayer.ts
  VrmDebugInspector.ts
```

### `VrmRuntime`

VRM本体、mixer、update順序を所有します。

```ts
class VrmRuntime {
  constructor(
    readonly vrm: VRM,
  ) {}

  update(delta: number, finalPose: VRMPose): void {
    this.vrm.humanoid.setNormalizedPose(finalPose);
    this.vrm.update(delta);
  }
}
```

### `VrmHumanoidRig`

bone存在確認、optional bone判定、profile計測を行います。

```ts
class VrmHumanoidRig {
  constructor(private readonly vrm: VRM) {}

  has(name: VRMHumanBoneName): boolean {
    return this.vrm.humanoid.getNormalizedBoneNode(name) != null;
  }

  getNode(name: VRMHumanBoneName): THREE.Object3D | undefined {
    return this.vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
  }

  getUpperBodyCapabilities() {
    return {
      chest: this.has(VRMHumanBoneName.Chest),
      upperChest: this.has(VRMHumanBoneName.UpperChest),
      neck: this.has(VRMHumanBoneName.Neck),
      leftShoulder: this.has(VRMHumanBoneName.LeftShoulder),
      rightShoulder: this.has(VRMHumanBoneName.RightShoulder),
    };
  }
}
```

### `VrmPoseBuffer`

自分が所有するboneを毎フレーム埋めるbufferです。

```ts
class VrmPoseBuffer {
  private pose: VRMPose = {};

  clear(): void {
    this.pose = {};
  }

  setRotation(name: VRMHumanBoneName, q: THREE.Quaternion): void {
    q.normalize();
    this.pose[name] = {
      rotation: [q.x, q.y, q.z, q.w],
    };
  }

  getPose(): VRMPose {
    return this.pose;
  }
}
```

### `VrmPoseComposer`

tracking, semantic, fallback, styleを合成し、1つのfinal poseにします。

```ts
type PoseLayer = {
  pose: VRMPose;
  weight: number;
  mode: "override" | "additive";
};

class VrmPoseComposer {
  compose(layers: PoseLayer[]): VRMPose {
    // 実装方針:
    // 1. base / tracking を先に置く
    // 2. additive layerをlog-spaceまたはslerpで加える
    // 3. bone limitを最後に適用する
    // 4. 所有boneは毎フレーム必ず出力する
    return {};
  }
}
```

実装上、Quaternionの単純な成分lerpは避け、`slerp` またはlog-space blendを使います。最終poseは必ず正規化します。

---

## 12. AnimationMixerを使う場合の実装規約

AnimationMixerを使う場合、three-vrmのfinal pose適用と競合しないように、明確な規約を設けます。

### 規約1: 本番VRMに直接mixerを書かせるboneを限定する

例えば、trackingが腕を所有するなら、mixerのclipは腕を触らないようにします。

```text
tracking owns:
  spine, chest, upperChest, neck, head,
  shoulders, arms, hands, fingers

AnimationMixer owns:
  none
```

この場合、mixerは実質使いません。短いclipは `VRMPoseDelta` として自前管理します。

### 規約2: VRM Animation clipはstagingで評価する

VRM Animationを使う場合は、`createVRMAnimationClip()` でclip化し、staging rigで評価します。`createVRMAnimationClip()` は `VRMAnimation` と対象 `VRM` からThree.js `AnimationClip` を作る関数として提供されています。([Pixiv][14])

```text
VRMAnimation
  -> createVRMAnimationClip(vrmAnimation, stagingVrm)
  -> stagingMixer.update(delta)
  -> stagingPose = stagingVrm.humanoid.getNormalizedPose()
  -> finalPoseへ合成
```

### 規約3: 直接mixer方式では更新順を固定する

どうしても本番VRMへ直接mixerを当てる場合は、更新順を固定します。

```ts
mixer.update(delta);

// mixer結果を読んで、必要なら自前poseで上書き
const mixedPose = vrm.humanoid.getNormalizedPose();
const finalPose = composer.overrideWithTracking(mixedPose, trackingPose);

vrm.humanoid.setNormalizedPose(finalPose);
vrm.update(delta);
```

この方式は、clipがどのnodeをtargetにしているかをdebugで確認できる場合に限ります。長期的にはstaging方式またはpose composer方式へ寄せるべきです。

---

## 13. デバッグで見るべきthree-vrm固有項目

three-vrm実装では、MediaPipeのlandmark可視化だけでは不十分です。少なくとも次を表示・記録します。

| 項目                                  | 目的                                |
| ----------------------------------- | --------------------------------- |
| `VRMHumanBoneName`ごとのbone存在         | optional bone差分の確認                |
| normalized pose                     | solver出力が意図通りか確認                  |
| raw pose                            | normalizedからrawへ正しく転送されているか確認     |
| final pose before limit             | 制約前の姿勢確認                          |
| final pose after limit              | 制約後の姿勢確認                          |
| applied quaternion angular velocity | 急回転・jitter検出                      |
| missing bone fallback               | upperChestなし、shoulderなし等の分配確認     |
| AnimationMixer ownership            | どのboneをclipが書いているか確認              |
| `vrm.update()` 呼び忘れ検出               | spring/constraint/material更新異常の検出 |

既存資料でも、ライブカメラだけで品質調整せず、MediaPipe出力を記録して同一ログで再生・評価することが推奨されています。特にneutral jitter、elbow flip count、dropout recovery jump、latency、bone length varianceなどは、three-vrm適用後の最終bone回転でも見るべきです。

---

## 14. 実装時のDo / Don’t

### Do

| Do                                | 理由                                     |
| --------------------------------- | -------------------------------------- |
| `VRMHumanBoneName` を唯一のbone識別子にする | node名・階層差分に強くなる                        |
| `setNormalizedPose()` を主経路にする     | VRM-1.0のrest rotation差分に強くなる           |
| final poseを1箇所で合成する               | IK / clip / fallback競合を避けられる           |
| `vrm.update(delta)` を全姿勢適用後に呼ぶ    | humanoid, constraints, spring等の順序が安定する |
| optional boneを毎モデルで判定する           | VRoid/一般VRM差分に強くなる                     |
| ロード時に `combineSkeletons()` を使う    | skeleton更新負荷を減らせる                      |
| 指はcurl中心から始める                     | 単眼手指推定のちらつきに強い                         |
| 低confidence時は振幅を下げる               | 壊れずに控えめな動きへ退避できる                       |

### Don’t

| Don’t                                            | 問題                                    |
| ------------------------------------------------ | ------------------------------------- |
| glTF node名に依存してboneを探す                           | モデル差分で壊れる                             |
| world rotationを直接boneへcopyする                     | rest rotation / parent transform差分に弱い |
| `normalizedRestPose` を `setNormalizedPose()` へ渡す | 互換形式ではない                              |
| `setRawPose()` を通常制御に使う                          | `autoUpdateHumanBones` と競合しやすい        |
| AnimationMixerとIKが同じboneを書く                      | 実行順依存で破綻する                            |
| partial poseだけを毎フレーム上書きし続ける                      | 前フレーム姿勢が残る                            |
| `removeUnnecessaryJoints()` を新規採用する              | deprecated                            |
| VRM rest rotation offsetをオンラインで変更する              | モデル全体が崩れる                             |

---

## 15. 最終推奨アーキテクチャ

```text
Camera / MediaPipe
  -> Observation
  -> Reliability / Temporal / Canonical
  -> Motion Solver
      - torso
      - head
      - shoulders
      - arms
      - wrists
      - fingers
  -> VrmPoseComposer
      - tracking pose
      - semantic pose delta
      - fallback pose
      - style clamp
  -> VrmPoseApplier
      - setNormalizedPose(finalPose)
  -> vrm.update(delta)
      - humanoid update
      - lookAt update
      - expression update
      - node constraints
      - spring bones
      - materials
  -> renderer.render()
```

実装上の最重要点は、**three-vrmに入れる時点で、すでに「VRMHumanoid normalized local pose」として成立していること**です。three-vrmはMediaPipeの不確実性を解く場所ではありません。three-vrmの役割は、VRM-1.0のhumanoid仕様、optional bone、rest rotation、spring/constraint更新順を尊重しながら、最終姿勢を安全にモデルへ適用することです。

この方針にすると、VRoid Studio標準系モデルを中心に、一般的なVRM-1.0人型モデルでも破綻しにくく、将来の表情・視線・idle motion・semantic gesture追加とも衝突しにくい設計になります。

[1]: https://github.com/pixiv/three-vrm "GitHub - pixiv/three-vrm: Use VRM on Three.js · GitHub"
[2]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRM.html "VRM | @pixiv/three-vrm"
[3]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md "vrm-specification/specification/VRMC_vrm-1.0/humanoid.md at master · vrm-c/vrm-specification · GitHub"
[4]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMHumanoid.html "VRMHumanoid | @pixiv/three-vrm"
[5]: https://pixiv.github.io/three-vrm/docs/types/three-vrm.VRMPose.html "VRMPose | @pixiv/three-vrm"
[6]: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm-core/src/VRMCore.ts "three-vrm/packages/three-vrm-core/src/VRMCore.ts at release · pixiv/three-vrm · GitHub"
[7]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMLoaderPlugin.html "VRMLoaderPlugin | @pixiv/three-vrm"
[8]: https://pixiv.github.io/three-vrm/docs/classes/three-vrm.VRMUtils.html "VRMUtils | @pixiv/three-vrm"
[9]: https://pixiv.github.io/three-vrm/docs/variables/three-vrm.VRMHumanBoneName.html "VRMHumanBoneName | @pixiv/three-vrm"
[10]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md "vrm-specification/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md at master · vrm-c/vrm-specification · GitHub"
[11]: https://threejs.org/docs/pages/AnimationMixer.html "AnimationMixer - Three.js Docs"
[12]: https://pixiv.github.io/three-vrm/docs/modules/three-vrm-animation.html "three-vrm-animation | @pixiv/three-vrm"
[13]: https://threejs.org/docs/pages/QuaternionKeyframeTrack.html "QuaternionKeyframeTrack - Three.js Docs"
[14]: https://pixiv.github.io/three-vrm/docs/functions/three-vrm-animation.createVRMAnimationClip.html "createVRMAnimationClip | @pixiv/three-vrm"
