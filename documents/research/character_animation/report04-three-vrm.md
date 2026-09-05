# three-vrmによるVRM-1.0キャラクターアニメーション実装ベストプラクティス

対象時点: **2026年6月 / three-vrm v3.5.3 / VRM-1.0 / Three.js / VRoid Studio標準系モデル**

## 質問

現在、一台のWebカメラの映像で撮影した人間の動きを元に、MediaPipe のPose Landmarker (<https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker)、>
Hand Landmarker (<https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)、>
顔 landmarker(<https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker?hl=ja>) などを用いて、
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

基本的な条件は下記の通りです。- キャラクターモーションの最適な「実装方法」を網羅的に調査し、開発に資するレポートにまとめる - 既存実装との互換性などは考慮せず、「最大限最良の実装にするにはどうすればよいか」だけを考える - 必ずしも人間に合わせたリアルな動きである必要はなく、かわいいキャラクターとしての自然な動きを実現することが目的 - 調査対象資料の言語はこだわらない - 参考にした資料があれば出典を明記する

- 今回はスコープ外とすること
    - 既存実装をベースとした改良案の提示
    - 直接的な「モーションキャプチャー&キャラクターアニメーション」機能フレームワークやライブラリの提案(合理的な範囲で独自に実装することも目的のひとつ)

調査の前に明確にしておきたいことがあれば、それを提示してください。

## 0. 結論

今回の条件では、three-vrmを「ボーンを直接回す便利ライブラリ」として使うのではなく、**VRM-1.0 人型骨格実行時として扱い、最終的な上半身姿勢を `VRMHumanoid` の正規化済み姿勢に集約して適用する**のが最良です。

three-vrm v3.5.3は2026年5月18日にリリースされており、2026年6月時点の対象バージョンとして妥当です。three-vrm v3系では `@pixiv/three-vrm` が基本パッケージで、WebGPU対応もありますが、WebGPU側は Three.js r167+ と NodeMaterial 系の互換性注意が明記されています。したがって、モーション実装の安定性を優先するなら、まずは **WebGLRenderer + three-vrm v3.5.3 + VRM-1.0 正規化済み人型骨格姿勢** を標準構成にするのが堅実です。([GitHub][1])

最重要の実装原則は次です。

| 領域           | ベストプラクティス                                                        |
| -------------- | ------------------------------------------------------------------------- |
| VRM制御API     | `vrm.humanoid.setNormalizedPose()` を主経路にする                         |
| ボーン指定     | Three.js ノード名ではなく `VRMHumanBoneName` を基準にする                 |
| 座標・回転     | ワールド回転ではなく、**初期姿勢・Tポーズからのローカル回転** を扱う      |
| 更新順         | すべての姿勢合成後に `vrm.update(delta)` を1回呼ぶ                        |
| AnimationMixer | 直接同じボーンを奪い合わない。クリップは姿勢レイヤーとして合成する        |
| 任意ボーン     | `chest`, `upperChest`, `shoulder`, 指ボーンの有無を前提に分配する         |
| 表情・視線     | 今回は主制御から分離。ただし `vrm.update()` の更新順には含まれる          |
| MediaPipe連携  | 未加工の特徴点からthree-vrm ボーンを直接書かず、最終 `VRMPose` に変換する |

既存のプロジェクト資料で整理されている「不確実な観測値を信頼度・時系列・標準状態を経て最終姿勢へ落とす」という方針とは整合します。ただし今回は、主眼を **three-vrm 実行時を壊さず、モデル差分に強い形で姿勢を適用すること** に置きます。

---

## 1. three-vrmでの基本モデル

three-vrmの中心は `VRM` オブジェクトです。`VRM` は `scene`, `humanoid`, `expressionManager`, `lookAt`, `springBoneManager`, `nodeConstraintManager` などを持ち、`update(delta)` によって各コンポーネントを更新します。公式API上も、`VRM.update(delta)` は毎フレーム呼ぶべき更新関数として定義されています。([Pixiv][2])

VRM-1.0では人型骨格ボーンは glTF ノードへのマッピングとして定義されます。`hips` と `spine` と `head` は必須、`chest`, `upperChest`, `neck`, `leftShoulder`, `rightShoulder`, 指ボーン群などは任意です。また、人型骨格ボーン同士の間に非人型骨格ノードが挟まることも許されています。したがって、Three.jsの親子階層やノード名を前提にして直接辿る実装は避けるべきです。([GitHub][3])

### 推奨する役割分担

```text
MediaPipe / 追跡層
  -> 独自の観測・信頼度・時系列処理

動作算出処理層
  -> 体幹・頭・腕・手首・指の最終意図を決める

VRM 姿勢レイヤー
  -> VRMHumanBoneName単位の正規化済みローカル姿勢に変換

three-vrm 実行時
  -> 正規化済み人型骨格姿勢を未加工 glTF ボーンへ反映
  -> 制約 / 揺れ物のボーン / 材質等を更新

Three.js 描画処理
  -> 描画
```

three-vrm層に入る時点では、すでに「このフレームでキャラクターが取るべき姿勢」が決まっているべきです。three-vrm層でMediaPipeの信頼度判定や肘反転回避を行うのではなく、three-vrm層は **VRMモデル差分を吸収しながら、安全に最終姿勢を適用する層** として設計します。

---

## 2. `raw` ではなく `normalized` を主経路にする

three-vrmの `VRMHumanoid` には未加工ボーンと正規化済みボーンの概念があります。重要なのは、通常のキャラクターアニメーション制御では **正規化済み姿勢を主経路にする** ことです。

`getNormalizedPose()` / `setNormalizedPose()` が扱う値は、正規化済み人間ボーンの現在姿勢であり、各変換は初期姿勢 / T-poseからのローカル変換として扱われます。一方、`getRawAbsolutePose()` のような絶対姿勢はモデルの初期状態を含み、モデル間互換性がないため、一般的な動作の変換用途には向きません。three-vrmのドキュメントでも、`setRawPose()` は `autoUpdateHumanBones` が有効な場合には `setNormalizedPose()` を使うべきだと警告されています。([Pixiv][4])

### 採用すべき姿勢形式

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

`VRMPose` は `VRMHumanBoneName` をキーにした姿勢表現で、各ボーンは省略可能です。また、すべてのVRMモデルがすべてのボーンを持つとは限らないことがAPI上でも前提化されています。([Pixiv][5])

### 禁止に近い実装

```ts
// 非推奨: モデル差分に弱く、three-vrmのhumanoid更新と競合しやすい
const node = vrm.scene.getObjectByName("J_Bip_L_UpperArm");
node!.quaternion.copy(worldQuaternion);
```

この方式は、VRoid Studio由来モデルでは一見動いても、別モデル・別エクスポート・任意ボーン構成差分・初期姿勢の回転差分で破綻しやすくなります。

### 推奨実装

```ts
// 推奨: VRMHumanBoneName単位でnormalized poseを作る
vrm.humanoid.setNormalizedPose(finalPose);
vrm.update(delta);
```

---

## 3. `normalizedRestPose` を姿勢入力として使わない

three-vrmの `VRMHumanoid` には `normalizedRestPose` がありますが、これは `setNormalizedPose()` / `getNormalizedPose()` と互換の姿勢値ではありません。ドキュメントでも、`normalizedRestPose` は非相対値を含むため `setNormalizedPose` / `getNormalizedPose` と互換ではないと明記されています。([Pixiv][4])

したがって、次のような使い方は避けます。

```ts
// 非推奨
vrm.humanoid.setNormalizedPose(vrm.humanoid.normalizedRestPose);
```

代わりに、毎フレームの最終姿勢は **識別情報回転を中立姿勢として、自前の姿勢バッファで構築**します。

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

部分姿勢だけを `setNormalizedPose()` し続けると、前フレームの値が残って「姿勢が戻らない」問題が出やすくなります。運用ルールは次のどちらかに統一します。

| 方針                                  | 内容                                           |             推奨度 |
| ------------------------------------- | ---------------------------------------------- | -----------------: |
| 全面所有する姿勢                      | 自分が所有するボーンは毎フレーム全て書く       |                 高 |
| 再初期化 + 一部のボーンだけを含む姿勢 | `resetNormalizedPose()` 後に必要ボーンだけ書く | 開発・デバッグ向き |
| 暫定上書き継続                        | 更新したボーンだけ上書きし、残りは前回値       |             非推奨 |

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

`VRMHumanoid.update()` は `autoUpdateHumanBones` が有効な場合、正規化済みリグから未加工リグへ姿勢を転送します。`VRM.update()` の後段ではノード制約、揺れ物のボーン、材質更新が走ります。([GitHub][6])

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

**同一フレームで、同じボーンに対して複数の書き手を作らない**ことが重要です。

悪い例:

```text
AnimationMixer が leftUpperArm を更新
  -> IK 算出処理も leftUpperArm を直接更新
  -> 意味に基づく動作クリップも leftUpperArm を直接更新
  -> 最後に実行された処理だけが勝つ
```

良い例:

```text
Animation / IK / 意味に基づく動作 / 代替処理
  -> それぞれ姿勢差分として出力
  -> PoseComposer で1つの finalPose に合成
  -> setNormalizedPose(finalPose) を1回
  -> vrm.update(delta)
```

---

## 5. VRMロード時のベストプラクティス

three-vrmでは `GLTFLoader` に `VRMLoaderPlugin` を登録してVRMを読み込むのが基本です。`VRMLoaderPlugin` は人型骨格、表情、firstPerson、lookAt、MToon 材質、springBone、nodeConstraint などのプラグインを内部に持つGLTFLoader プラグインです。([Pixiv][7])

```ts
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

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

`VRMUtils.combineSkeletons()` は複数Skeletonの計算を統合して毎フレームのボーン行列計算負荷を減らすための関数です。`combineMorphs()` はVRM expressionsをもとに変形目標を結合し、特にモバイル環境で形状変化目標数制限による問題を回避する目的があります。`removeUnnecessaryJoints()` は廃止予定なので使わず、代わりに `combineSkeletons()` を使うべきです。([Pixiv][8])

表情は今回スコープ外ですが、`combineMorphs()` はロード最適化としては有効です。ただし、後続の表情調査で表情制御を詳細に扱う場合は、表情クリップや形状変化最適化との相互作用を別途検証してください。

---

## 6. ボーン存在確認と任意ボーン方針

`VRMHumanBoneName` には、体幹・頭・腕・指などの標準ボーン名が定義されています。three-vrmではこれを使ってボーンを取得・適用します。([Pixiv][9])

```ts
import { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

function hasBone(vrm: VRM, name: VRMHumanBoneName): boolean {
    return vrm.humanoid.getNormalizedBoneNode(name) != null;
}
```

VRM-1.0では `chest`, `upperChest`, `neck`, `shoulder`, 指ボーンの多くは任意です。VRM Animation仕様でも、`upperChest` や `leftShoulder` のような非必須ボーンがモデル間で異なる問題が示されており、正規化ローカル回転を中間形式として扱う考え方が提示されています。([GitHub][10])

### 上半身ボーンの適用ポリシー

| 部位     | ボーン                          | 方針                                                            |
| -------- | ------------------------------- | --------------------------------------------------------------- |
| ルート   | `hips`                          | 上半身同期では原則固定。位置移動は慎重に扱う                    |
| 体幹     | `spine`, `chest`, `upperChest`  | 存在するボーンへ分配                                            |
| 首・頭部 | `neck`, `head`                  | `neck` があれば分配、なければ `head` に集約                     |
| 肩       | `leftShoulder`, `rightShoulder` | あれば肩補正に使う。なければ `upperChest` / `upperArm` 側へ吸収 |
| 腕       | `upperArm`, `lowerArm`, `hand`  | 必須相当として主制御対象                                        |
| 指       | 基節・中節・末節                | 存在するボーンだけに曲げを再分配                                |

### 任意体幹分配例

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
        return { spine: 0.25, chest: 0.4, upperChest: 0.35 };
    }

    if (hasChest) {
        return { spine: 0.35, chest: 0.65, upperChest: 0.0 };
    }

    return { spine: 1.0, chest: 0.0, upperChest: 0.0 };
}
```

この分配は「人体として正確」よりも、「VRoid系キャラで肩・胸が破綻しにくい」ことを優先した値です。既存の上半身モーション品質資料でも、胴体・頭・肩の細かな揺れや肩崩れを最優先で避ける方針が整理されています。

---

## 7. ローカル回転の作り方

three-vrmへ渡す姿勢は、各ボーンの **ローカル回転差分** です。つまり、「モデルの現在ワールド座標姿勢をこのワールド座標クォータニオンにする」ではなく、「正規化済み初期姿勢・Tポーズからこの回転だけ動かす」という考え方にします。

```text
solver output
  = desired local rotation relative to normalized rest pose

VRMPose rotation
  = [x, y, z, w]
```

### 実装上のルール

1. すべてQuaternionで扱う。Euler角を保存形式にしない。
2. 毎フレーム正規化する。
3. 左右ボーンの座標軸差分をソルバー層に漏らさず、`VrmPoseApplier` で吸収する。
4. `getRawBoneNode()` ではなく `getNormalizedBoneNode()` を検証・デバッグに使う。
5. 最終適用は `setNormalizedPose()` に集約する。

```ts
function qToArray(q: THREE.Quaternion): [number, number, number, number] {
    q.normalize();
    return [q.x, q.y, q.z, q.w];
}
```

---

## 8. AnimationMixer / VRM Animation / 加算クリップの扱い

Three.jsの `AnimationMixer` は、特定ルート上のアニメーション再生処理です。`mixer.update(delta)` によりアニメーション時間を進め、`AnimationAction.weight`, `fadeIn`, `fadeOut`, 加算合成などを使って複数操作を合成できます。([Three.js][11])

three-vrm側には `@pixiv/three-vrm-animation` があり、VRM Animationを読み込む `VRMAnimationLoaderPlugin` と、VRMAnimationを対象VRM用のThree.js `AnimationClip` に変換する `createVRMAnimationClip()` が提供されています。([Pixiv][12])

ただし、今回の用途では **AnimationMixerを主モーション制御器にしない**方が安全です。理由は、MediaPipe追従・IK・意味に基づく動作クリップ・代替処理が同じボーンを書き換えると、実行順依存の競合が起きるためです。

### 推奨パターンA: 姿勢合成処理方式

最も安全な方式です。

```text
追跡算出処理
  -> VRMPose

意味に基づく動作クリップ
  -> VRMPoseDelta

待機動作 / 呼吸
  -> VRMPoseDelta

代替処理 / 無理のない自然姿勢
  -> VRMPose

PoseComposer
  -> 最終 VRMPose

vrm.humanoid.setNormalizedPose(finalPose)
vrm.update(delta)
```

この方式では、Three.js `AnimationMixer` を使わず、短い上半身クリップも自前の `VRMPoseDelta` として保持します。クリップデータはQuaternion キーフレーム列として持ち、実行時にslerpして姿勢差分に変換します。

### 推奨パターンB: 評価用のミキサー方式

VRM Animationや既存AnimationClipを活用したい場合は、直接本番VRMにミキサーを当てず、**評価用用VRMまたは評価用の骨格でクリップを評価し、その姿勢を読んで最終姿勢へ合成**します。

```text
stagingMixer.update(delta)
  -> stagingVrm.humanoid.getNormalizedPose()
  -> clipPoseDelta抽出
  -> trackingPoseと合成
  -> 本番vrm.humanoid.setNormalizedPose(finalPose)
```

メモリは増えますが、同じボーンの所有権競合を避けられます。

### 許容パターンC: 直接AnimationMixer方式

小規模なデモや、追跡とクリップがボーンを共有しない場合のみ許容します。

```ts
mixer.update(delta); // clipがboneを書き込む
applyTrackingOverrides(); // trackingが必要boneだけ上書き
vrm.update(delta);
```

この方式は最後に書いた処理が勝ちます。将来の拡張で破綻しやすいため、長期設計では避けるべきです。

### 加算クリップを使う場合

Three.jsには `QuaternionKeyframeTrack` があり、Quaternion キーフレームを扱えます。また `AnimationUtils.makeClipAdditive()` によりクリップを加算形式へ変換できます。([Three.js][13])

ただし、かわいい上半身モーション用途では、加算クリップは「全身を上書きする動き」ではなく、**手振り・指差し・説明ジェスチャーのような短い意味動作の補助**として使います。

---

## 9. 上半身ボーン別の実装規約

### 9.1 両腰

上半身同期では、`hips` は基本的に固定します。MediaPipeの単眼推定から両腰位置を動かすと、キャラクター全体が揺れて見えます。`VRMPose` では `hips.position` も表現可能ですが、上半身モーションでは原則使わないか、非常に低周波・低振幅に制限します。

```ts
// 上半身同期では通常 position を入れない
const pose: VRMPose = {
    [VRMHumanBoneName.Hips]: {
        rotation: [0, 0, 0, 1],
    },
};
```

### 9.2 背骨 / 胸 / `upperChest`

体幹は、かわいいキャラクターでは「よく動く」よりも「安定している」ことを優先します。`spine`, `chest`, `upperChest` がすべてある場合は分配し、`upperChest` がない場合は `chest` へ、`chest` もない場合は `spine` へ集約します。

```text
spine      = torsoRotation * 0.25
chest      = torsoRotation * 0.40
upperChest = torsoRotation * 0.35
```

片腕を上げたときに胸全体を大きく傾けると不自然なので、肩補正は基本的に `shoulder` と `upperChest` に寄せます。両腕を上げる場合だけ、`chest` を少し使います。

### 9.3 首 / 頭部

表情・視線はスコープ外ですが、頭部姿勢は上半身モーションの自然さに直結します。`neck` がある場合は、頭部回転を `neck` と `head` に分配します。

```text
neck = headDelta * 0.30〜0.40
head = headDelta * 0.60〜0.70
```

`neck` がないモデルでは `head` に集約します。ただし、首がないモデルで大きな頭部回転を入れると折れたように見えるため、回転上限を下げます。

### 9.4 肩

`leftShoulder` / `rightShoulder` が存在する場合、腕を上げる動作で積極的に使います。肩ボーンを使わず `upperArm` だけを回すと、肩・胸・袖まわりが破綻しやすくなります。

```text
armRaiseAssist = smoothstep(30°, 110°, armElevation)

shoulderLift = armRaiseAssist * 10〜20°
upperChest   = armRaiseAssist * 6〜18°
chest        = armRaiseAssist * 0〜12°
```

肩ボーンがないモデルでは、`upperChest` と `upperArm` 側へ補正を逃がします。既存資料でも、肩・鎖骨・胸の補正は上半身品質に大きく効く領域として整理されています。

### 9.5 `upperArm` / `lowerArm` / 手

腕は2本のボーンによる IKや独自ソルバーで求めた結果を、最終的に次の3boneへ変換します。

```text
leftUpperArm / rightUpperArm
leftLowerArm / rightLowerArm
leftHand / rightHand
```

three-vrm層ではIKを解かず、IK ソルバーが出した `upperArm`, `lowerArm`, `hand` のローカル回転を受け取るだけにします。

手首ロールは特に暴れやすいため、`hand` ボーンに全ロールを入れず、必要なら `lowerArm` ねじれと `hand` ねじれに分配します。既存資料でも、手首ロールは強く抑え、ピッチ・ヨー中心に扱う方針が推奨されています。

### 9.6 指

指は、最初から各関節3D回転を完全再現しない方が安定します。three-vrmのボーン適用層では、Hand Landmarkerの21点を直接指ボーンの回転に変換するのではなく、`curl`, `spread`, `oppose` のような低次元パラメータをVRM指ボーンへ分配します。

```text
proximal     = curl * 50〜60%
intermediate = curl * 30〜40%
distal       = curl * 10〜20%
```

指ボーンが欠けている場合は、存在するボーンへ再分配します。`splay` は入れるとしても `index` / `little` へ限定し、±10〜15°程度から始めるのが安全です。

---

## 10. MediaPipe入力との接続方針

今回の主題はthree-vrmですが、MediaPipe入力と接続する際の境界は明確にしておくべきです。

```text
MediaPipe 特徴点
  -> 信頼性 / 時系列 / 標準化した / IK / 表現調整
  -> 最終 VRMPose
  -> vrm.humanoid.setNormalizedPose()
```

避けるべき流れは次です。

```text
MediaPipe 手首 / 肘 / 肩
  -> Three.js Bone ワールド座標クォータニオン
  -> bone.quaternion.copy()
```

単眼Webカメラ由来の特徴点は奥行きや手首ロール、肘方向に不確実性を持ちます。既存資料でも、MediaPipe ワールド座標の特徴点は絶対3D位置として過信せず、左右・上下・相対方向を主に使い、奥行きは圧縮して使う方針が示されています。

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

低信頼度時にthree-vrm層で急に中立姿勢へ戻すのではなく、動作算出処理側で「控えめな自然姿勢」へなめらかに退避させます。キャラクター会話用途では、よく動くが不安定な姿勢より、控えめでも破綻しない姿勢を優先すべきです。

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

VRM本体、ミキサー、更新順序を所有します。

```ts
class VrmRuntime {
    constructor(readonly vrm: VRM) {}

    update(delta: number, finalPose: VRMPose): void {
        this.vrm.humanoid.setNormalizedPose(finalPose);
        this.vrm.update(delta);
    }
}
```

### `VrmHumanoidRig`

ボーン存在確認、任意ボーン判定、調整情報計測を行います。

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

自分が所有するボーンを毎フレーム埋めるバッファです。

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

追跡, 意味に基づく動作, 代替処理, 演出を合成し、1つの最終姿勢にします。

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

実装上、Quaternionの単純な成分lerpは避け、`slerp` または対数空間での合成を使います。最終姿勢は必ず正規化します。

---

## 12. AnimationMixerを使う場合の実装規約

AnimationMixerを使う場合、three-vrmの最終姿勢適用と競合しないように、明確な規約を設けます。

### 規約1: 本番VRMに直接ミキサーを書かせるボーンを限定する

例えば、追跡が腕を所有するなら、ミキサーのクリップは腕を触らないようにします。

```text
追跡処理が所有する部位:
  背骨, 胸, `upperChest`, 首, 頭部,
  両肩, 腕, 手, 指

AnimationMixerが所有する部位:
  なし
```

この場合、ミキサーは実質使いません。短いクリップは `VRMPoseDelta` として自前管理します。

### 規約2: VRM Animation クリップは評価用で評価する

VRM Animationを使う場合は、`createVRMAnimationClip()` でクリップ化し、評価用の骨格で評価します。`createVRMAnimationClip()` は `VRMAnimation` と対象 `VRM` からThree.js `AnimationClip` を作る関数として提供されています。([Pixiv][14])

```text
VRMAnimation
  -> createVRMAnimationClip(vrmAnimation, stagingVrm)
  -> stagingMixer.update(delta)
  -> stagingPose = stagingVrm.humanoid.getNormalizedPose()
  -> finalPoseへ合成
```

### 規約3: 直接ミキサー方式では更新順を固定する

どうしても本番VRMへ直接ミキサーを当てる場合は、更新順を固定します。

```ts
mixer.update(delta);

// mixer結果を読んで、必要なら自前poseで上書き
const mixedPose = vrm.humanoid.getNormalizedPose();
const finalPose = composer.overrideWithTracking(mixedPose, trackingPose);

vrm.humanoid.setNormalizedPose(finalPose);
vrm.update(delta);
```

この方式は、クリップがどのノードを目標にしているかをデバッグで確認できる場合に限ります。長期的には評価用方式または姿勢合成処理方式へ寄せるべきです。

---

## 13. デバッグで見るべきthree-vrm固有項目

three-vrm実装では、MediaPipeの特徴点可視化だけでは不十分です。少なくとも次を表示・記録します。

| 項目                               | 目的                                             |
| ---------------------------------- | ------------------------------------------------ |
| `VRMHumanBoneName`ごとのボーン存在 | 任意ボーン差分の確認                             |
| 正規化済み姿勢                     | ソルバー出力が意図通りか確認                     |
| 未加工姿勢                         | 正規化済みから未加工へ正しく転送されているか確認 |
| 最終姿勢前制限                     | 制約前の姿勢確認                                 |
| 最終姿勢後制限                     | 制約後の姿勢確認                                 |
| 適用済みクォータニオン角速度       | 急回転・細かな揺れ検出                           |
| 欠損ボーン代替処理                 | `upperChest`なし、肩なし等の分配確認             |
| AnimationMixer 所有権              | どのボーンをクリップが書いているか確認           |
| `vrm.update()` 呼び忘れ検出        | 揺れ物・制約・材質更新異常の検出                 |

既存資料でも、ライブカメラだけで品質調整せず、MediaPipe出力を記録して同一ログで再生・評価することが推奨されています。特に中立姿勢での細かな揺れ、肘の反転回数、観測欠落からの復帰時の急変、遅延、骨の長さばらつきなどは、three-vrm適用後の最終ボーン回転でも見るべきです。

---

## 14. 実装時の推奨事項・禁止事項

### 推奨事項

| 推奨事項                                      | 理由                                     |
| --------------------------------------------- | ---------------------------------------- |
| `VRMHumanBoneName` を唯一のボーン識別子にする | ノード名・階層差分に強くなる             |
| `setNormalizedPose()` を主経路にする          | VRM-1.0の初期姿勢の回転差分に強くなる    |
| 最終姿勢を1箇所で合成する                     | IK / クリップ / 代替処理競合を避けられる |
| `vrm.update(delta)` を全姿勢適用後に呼ぶ      | 人型骨格, 制約, 揺れ物等の順序が安定する |
| 任意ボーンを毎モデルで判定する                | VRoid/一般VRM差分に強くなる              |
| ロード時に `combineSkeletons()` を使う        | スケルトン更新負荷を減らせる             |
| 指は曲げ中心から始める                        | 単眼手指推定のちらつきに強い             |
| 低信頼度時は振幅を下げる                      | 壊れずに控えめな動きへ退避できる         |

### 禁止事項

| 禁止事項                                                 | 問題                                  |
| -------------------------------------------------------- | ------------------------------------- |
| glTF ノード名に依存してボーンを探す                      | モデル差分で壊れる                    |
| ワールド回転を直接ボーンへコピーする                     | 初期姿勢の回転 / 親の変換差分に弱い   |
| `normalizedRestPose` を `setNormalizedPose()` へ渡す     | 互換形式ではない                      |
| `setRawPose()` を通常制御に使う                          | `autoUpdateHumanBones` と競合しやすい |
| AnimationMixerとIKが同じボーンを書く                     | 実行順依存で破綻する                  |
| 一部のボーンだけを含む姿勢だけを毎フレーム上書きし続ける | 前フレーム姿勢が残る                  |
| `removeUnnecessaryJoints()` を新規採用する               | 廃止予定                              |
| VRM 初期姿勢の回転補正量をオンラインで変更する           | モデル全体が崩れる                    |

---

## 15. 最終推奨アーキテクチャ

```text
カメラ / MediaPipe
  -> 観測値
  -> 信頼性 / 時系列 / 標準化した
  -> 動作算出処理
      - 体幹
      - 頭部
      - 両肩
      - 腕
      - 手首
      - 指
  -> VrmPoseComposer
      - 追跡姿勢
      - 意味に基づく動作の姿勢差分
      - 代替処理姿勢
      - 表現調整値の制限
  -> VrmPoseApplier
      - setNormalizedPose(finalPose)
  -> vrm.update(delta)
      - 人型骨格更新
      - lookAt 更新
      - 表情更新
      - ノード制約
      - 揺れ物ボーン
      - 材質
  -> renderer.render()
```

実装上の最重要点は、**three-vrmに入れる時点で、すでに「VRMHumanoid 正規化済みローカル姿勢」として成立していること**です。three-vrmはMediaPipeの不確実性を解く場所ではありません。three-vrmの役割は、VRM-1.0の人型骨格仕様、任意ボーン、初期姿勢の回転、揺れ物・制約更新順を尊重しながら、最終姿勢を安全にモデルへ適用することです。

この方針にすると、VRoid Studio標準系モデルを中心に、一般的なVRM-1.0人型モデルでも破綻しにくく、将来の表情・視線・待機動作動作・意味に基づく動作ジェスチャー追加とも衝突しにくい設計になります。

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
