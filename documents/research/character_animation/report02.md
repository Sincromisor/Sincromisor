# IK以外の品質改善手法 調査・設計レポート

対象は、**単眼Webカメラ + MediaPipe Pose / Hand / Face Landmarker + VRM-1.0 + Three.js** による上半身モーション生成です。前回はIK・関節制約・retargetを中心に整理しましたが、今回はそれ以外、つまり **検出入力の品質、時系列処理、信頼度設計、キャラクター動作としての意味づけ、評価基盤** によって品質を上げる方法を中心にまとめます。

結論から言うと、IKの精度を上げるだけでは限界があります。最良構成では、IKは最終段の「姿勢適用器」に近く、品質の大部分はその前後にある **perception quality control / canonicalization / temporal state estimation / semantic motion layer / avatar profile** によって決まります。

---

## 1. 結論

IK以外で最も効果が大きい改善は、次の5つです。

| 優先度 | 改善領域                          | 効果                                                                     |
| -----: | --------------------------------- | ------------------------------------------------------------------------ |
|      1 | **信頼度つき観測モデル**          | MediaPipeの出力を一律に信用せず、部位ごとの品質・欠落・外れ値を扱える    |
|      2 | **Pose起点のROI再推定**           | 手・顔・上半身の検出安定性、左右取り違え、手の小ささ問題を改善できる     |
|      3 | **canonical pose化 / 体型差吸収** | 撮影者とVRoidキャラの肩幅・腕長・頭身差を吸収できる                      |
|      4 | **時系列状態推定**                | jitter、急なジャンプ、検出欠落、再検出時の飛びを抑えられる               |
|      5 | **semantic motion layer**         | 人間の動きをそのまま再現せず、かわいいキャラクターらしい動作に変換できる |

推奨する新規アーキテクチャは次です。

```text
Camera
  ↓
FrameClock / CameraQualityController
  ↓
MediaPipe Multi-pass Detection
  - full-frame pose
  - pose-seeded hand ROI
  - face/head ROI
  ↓
LandmarkReliabilityEstimator
  - visibility / presence
  - tracking confidence
  - segmentation consistency
  - border proximity
  - bone-length consistency
  - temporal innovation
  ↓
CanonicalUpperBodyState
  - user calibration
  - body-local coordinates
  - normalized skeleton
  - avatar-scale mapping
  ↓
TemporalStateEstimator
  - confidence-aware filtering
  - prediction during dropout
  - hysteresis
  - outlier rejection
  ↓
SemanticMotionLayer
  - gesture state
  - motion intent
  - authored animation overlay
  - character style policy
  ↓
AvatarRetargetProfile
  - VRM rest-pose compensation
  - model-specific offsets
  - deformation-safe limits
  ↓
IK / FK / Bone Application
  ↓
Three.js / VRM rendering
```

この構成では、MediaPipeのlandmarkは「最終姿勢」ではなく、**不確実性を持つ観測値**として扱います。MediaPipe Pose Landmarkerはbody pose landmarksと3D world landmarksを出力し、各landmarkにpresenceやvisibilityを含めますが、それらはそのままキャラクターの骨格回転として使うための値ではありません。([Google AI for Developers][1])

---

## 2. 改善方針の全体像

IK以外の品質改善は、次の層に分けて考えるのが実装しやすいです。

| 層                     | 主な責務                               | 典型的な不具合                          |
| ---------------------- | -------------------------------------- | --------------------------------------- |
| capture layer          | カメラ入力、解像度、フレーム時刻、画角 | motion blur、低解像度、フレーム時刻ずれ |
| detection layer        | MediaPipe実行、ROI、モデルオプション   | 手の欠落、左右取り違え、顔・手の不安定  |
| reliability layer      | 出力の信頼度評価                       | 外れ値を正常値として使ってしまう        |
| canonicalization layer | 体型差・視点差の吸収                   | 人間とアバターの腕長差、肩幅差          |
| temporal layer         | 時系列推定、欠落補間                   | jitter、ジャンプ、再検出時の飛び        |
| semantic layer         | 動作意図・ジェスチャー化               | 人間っぽいがキャラとしてかわいくない    |
| avatar profile layer   | VRMモデル差分の吸収                    | モデルごとに肩・首・手が破綻する        |
| evaluation layer       | 録画・再生・定量評価                   | 調整結果を再現できない                  |

前回扱ったIKは、主に `temporal layer` より後段の `bone application` に位置します。しかし、単眼Webカメラの品質問題はIKの前段で発生することが多いため、上流の設計が重要です。

---

## 3. Capture layer: カメラ入力品質を制御する

### 3.1 getUserMedia constraintsを明示し、実際の設定を検証する

Webカメラ入力では、指定した解像度・フレームレートがそのまま使われるとは限りません。Media Capture and Streams APIでは、constraintsは多くの場合「要求」であり、実際の設定は `MediaStreamTrack.getSettings()` で確認する必要があります。MDNの説明でも、`getConstraints()` は要求値を返す一方、実際の値は `getSettings()` で確認するとされています。([MDN Web Docs][2])

推奨方針は次です。

```ts
const stream = await navigator.mediaDevices.getUserMedia({
    video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
        facingMode: "user",
    },
    audio: false,
});

const track = stream.getVideoTracks()[0];
const settings = track.getSettings();
```

重要なのは、**高解像度を常に選ぶことではなく、MediaPipeが安定してランドマークを拾える画角と解像度を維持すること**です。上半身用途では、手が画面端に出やすいため、顔のアップよりも「腰上〜頭上まで余白あり」の構図を優先します。

---

### 3.2 requestVideoFrameCallbackを使い、映像フレーム基準で処理する

`requestAnimationFrame` はブラウザ描画周期に同期しますが、カメラ映像の実フレームとは一致しないことがあります。`HTMLVideoElement.requestVideoFrameCallback()` は新しい映像フレームがコンポジターへ送られるタイミングでcallbackを呼び、metadataとして `mediaTime`, `presentationTime`, `presentedFrames` などを提供します。MDNでも、映像解析やvideo frameごとの処理に使えるAPIとして説明されています。([MDN Web Docs][3])

推奨は、MediaPipeの入力を次のように駆動することです。

```ts
function onVideoFrame(
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata,
) {
    const t = metadata.mediaTime * 1000;

    // 同一 video frame に対して Pose / Hand / Face の timestamp を揃える
    pipeline.processVideoFrame(video, t, metadata);

    video.requestVideoFrameCallback(onVideoFrame);
}

video.requestVideoFrameCallback(onVideoFrame);
```

これにより、次のような品質改善ができます。

| 改善               | 内容                                                   |
| ------------------ | ------------------------------------------------------ |
| timestamp整合      | Pose / Hand / Faceの結果を同一フレームとして扱いやすい |
| dropped frame検出  | `presentedFrames` からフレーム欠落を検出できる         |
| dt正規化           | フィルタや速度推定に正しい経過時間を使える             |
| 描画周期依存の排除 | 60Hz描画と30fpsカメラの混同を避けられる                |

これはパフォーマンス最適化というより、**時系列信号の品質を上げるための基盤**です。

---

### 3.3 カメラ品質スコアを導入する

アルゴリズムだけでなく、撮影状態そのものを評価する `CameraQualityScore` を持つべきです。

```ts
type CameraQualityScore = {
    frameWidth: number;
    frameHeight: number;
    actualFrameRate: number;

    torsoInFrame: number;
    handsInFrame: {
        left: number;
        right: number;
    };

    motionBlurRisk: number;
    underExposureRisk: number;
    borderRisk: number;

    overall: number;
};
```

MediaPipe側のconfidenceだけでは、カメラ入力の失敗を十分に表せません。例えば、手が画面端に近い、顔だけ大きく写って肩が入っていない、カメラが広角すぎて端で歪む、という問題はmotion solver以前に検出すべきです。

---

### 3.4 カメラキャリブレーションは「高精度モード」として有効

通常のWebカメラ用途では必須ではありませんが、広角カメラやノートPC内蔵カメラで画面端の歪みが大きい場合、肩幅・腕の角度・手先位置が歪みます。OpenCVのカメラキャリブレーションでは、チェスボード等からcamera matrixとdistortion coefficientsを推定し、画像のundistortionに使う流れが示されています。([opencv24-python-tutorials.readthedocs.io][4])

推奨は次です。

| モード       | 方針                                                             |
| ------------ | ---------------------------------------------------------------- |
| 通常モード   | キャリブレーションなし。画面中央を使うUI誘導で対応               |
| 高品質モード | カメラごとにintrinsicsを保存し、入力画像またはlandmark座標を補正 |
| 広角カメラ   | 画面端を使わないcrop、またはundistortionを推奨                   |
| 配布アプリ   | 自動キャリブレーションは重すぎるため、任意設定にする             |

実装コストに対する効果は、カメラの歪みが大きい場合に高く、通常画角のWebカメラでは中程度です。

---

## 4. Detection layer: MediaPipeを単純に並列実行しない

### 4.1 Poseを全体検出、Hand/FaceをROI検出として扱う

品質改善の観点で最も重要なのは、**Pose / Hand / Faceを単に全画面で独立実行しない**ことです。

Google ResearchのMediaPipe Holistic解説では、pose predictionを毎フレーム実行し、それをfaceやhandのROI priorとして使うことで、速い動きへの反応と左右一貫性を改善する設計が説明されています。([Google Research][5])

今回の推奨は、Holisticをそのまま使うのではなく、その考え方を自前統合層に取り入れることです。

```text
Full frame
  ↓
Pose Landmarker
  ↓
left wrist / right wrist / face region を推定
  ↓
Hand Landmarker on left-hand crop
Hand Landmarker on right-hand crop
Face Landmarker on face crop
  ↓
crop座標 → full-frame座標 → body-local座標へ戻す
```

この方式により、手が小さく写る場合や、顔・手が近い場合でも検出結果を安定させやすくなります。

---

### 4.2 Pose Landmarkerのsegmentation maskを品質判定に使う

Pose Landmarkerには `outputSegmentationMasks` オプションがあります。公式Webドキュメントでは、Pose Landmarkerがpose landmark、world landmark、segmentation maskを返せること、また `outputSegmentationMasks` でmask出力を有効化できることが説明されています。([Google AI for Developers][1])

segmentation maskは、レンダリング用ではなく、**landmarkの妥当性判定**に使えます。

| 用途                     | 判定例                                                   |
| ------------------------ | -------------------------------------------------------- |
| 手が人体領域内にあるか   | wrist / elbow がmask外なら信頼度を下げる                 |
| 肩が画面外か             | shoulder付近のmaskが欠けていればtorso confidenceを下げる |
| 顔前の手のオクルージョン | hand landmarkとface領域が重なればhand confidenceを下げる |
| 背景誤検出               | landmark周辺のmaskが人体でなければ外れ値扱い             |

segmentation maskは厳密な遮蔽判定ではありませんが、**MediaPipeの数値confidenceに加える二次的な品質指標**として有効です。

---

### 4.3 Hand Landmarkerは「検出器」ではなく「追跡器を含む状態機械」として扱う

Hand LandmarkerのWebドキュメントでは、`minHandDetectionConfidence`, `minHandPresenceConfidence`, `minTrackingConfidence` が設定でき、Video modeではhand presenceが閾値を下回るとpalm detectionを再実行し、trackingが成功していれば検出をskipする、と説明されています。([Google AI for Developers][6])

これはアプリ側でも重要です。つまり、手の検出結果は毎フレーム独立ではなく、**tracking状態を持つ時系列信号**です。

推奨する手の状態管理は次です。

```text
DetectedStable
  ↓ confidence低下
DetectedUnstable
  ↓ 一定時間継続
Predicted
  ↓ 復帰
Recovering
  ↓ 安定
DetectedStable
```

| 状態             | 処理                                |
| ---------------- | ----------------------------------- |
| DetectedStable   | 通常利用                            |
| DetectedUnstable | 重みを下げて利用                    |
| Predicted        | 前フレーム状態 + 速度モデルで予測   |
| Recovering       | 急に戻さず補間                      |
| Lost             | 指はneutralへ、腕はPose wristで継続 |

---

### 4.4 Face Landmarkerは頭部姿勢品質の補助として使う

表情・視線は今回スコープ外ですが、Face Landmarkerのfacial transformation matrixは頭部姿勢の安定化に使えます。公式ドキュメントでは、Face Landmarkerが3D face landmarks、blendshape scores、transformation matricesを出力できること、また `outputFacialTransformationMatrixes` オプションがあることが説明されています。([Google AI for Developers][7])

特に、Poseのnose / earsだけでhead rotationを作るより、Face Landmarkerの行列をhead orientationの主入力にする方が安定しやすいです。

ただし、Face LandmarkerのWeb設定では、`numFaces` が1のときのみsmoothingが適用されると説明されています。([Google AI for Developers][7]) そのため、この用途では `numFaces = 1` を基本にし、複数人対応は別のidentity selection layerで扱うべきです。

---

## 5. Reliability layer: landmark信頼度を自前で再定義する

### 5.1 MediaPipe confidenceだけでは不十分

MediaPipeはpresenceやvisibilityなどを出しますが、キャラクター制御で必要なのは「その値を今フレームの制御にどれだけ使ってよいか」です。これはMediaPipeのconfidenceそのものではなく、複数指標から合成するべきです。

```ts
type LandmarkReliability = {
    modelPresence: number;
    modelVisibility: number;
    trackingConfidence: number;

    insideSegmentationMask: number;
    distanceFromImageBorder: number;
    boneLengthConsistency: number;
    temporalConsistency: number;
    sideConsistency: number;

    finalWeight: number;
};
```

推奨する `finalWeight` は次のように合成します。

```ts
finalWeight =
    modelPresence *
    modelVisibility *
    trackingConfidence *
    borderWeight *
    boneLengthWeight *
    temporalWeight *
    sideWeight;
```

この重みを、フィルタ、IK target、gesture recognition、animation blend weightの全てで共有します。

---

### 5.2 temporal innovationで外れ値を検出する

外れ値検出では、前フレームからの予測値と観測値の差を使います。

```ts
innovation = observedPosition - predictedPosition;
innovationNorm = innovation.length();

if (innovationNorm > thresholdByJoint[joint]) {
    reliability.temporalConsistency *= 0.1;
}
```

重要なのは、外れ値を即座に捨てるのではなく、**信頼度を下げる**ことです。完全に捨てると復帰時に遅れます。重みを下げれば、状態推定器側で滑らかに扱えます。

---

### 5.3 body scale consistencyを品質指標にする

単眼推定では奥行きが揺れやすいため、各フレームでの骨長が大きく変動します。上腕長、前腕長、肩幅、胴体長の変化は、姿勢変化ではなく推定誤差であることが多いです。

```ts
boneLengthWeight = exp(-abs(currentLength - calibratedLength) / sigma);
```

これにより、たとえばwristだけが急に奥へ飛んだ場合、腕全体の観測信頼度を下げられます。

---

## 6. Canonicalization layer: 人間の姿勢をキャラクター用中間表現に変換する

### 6.1 joint positionではなくnormalized poseを中心にする

人間とアバターの体型差を吸収するには、MediaPipeの座標をそのまま使うのではなく、標準骨格上のcanonical poseに変換するのが有効です。ICCV 2021のNormalized Human Pose Featuresの論文では、同じポーズでも人の骨長や体型が違うとjoint positionsは変わるが、joint rotationsは類似するため、poseを正規化してanthropometryやviewpointの影響を除く考え方が示されています。([CVFオープンアクセス][8])

今回の実装では、深層学習モデルを必須にする必要はありません。TypeScriptで次のようなcanonical stateを定義するだけでも効果があります。

```ts
type CanonicalUpperBodyState = {
    torso: {
        yaw: number;
        pitch: number;
        roll: number;
        bend: number;
    };

    head: {
        yaw: number;
        pitch: number;
        roll: number;
    };

    arms: {
        left: CanonicalArmState;
        right: CanonicalArmState;
    };

    hands: {
        left?: CanonicalHandState;
        right?: CanonicalHandState;
    };
};

type CanonicalArmState = {
    elevation: number; // 腕をどれだけ上げているか
    forwardness: number; // 前に出しているか
    openness: number; // 体から離れているか
    elbowFlexionHint: number;
    wristPalmNormal?: THREE.Vector3;
};
```

この方式では、MediaPipeの3D座標をそのままVRM座標に変換するのではなく、**腕を上げている、前に出している、手を開いている、という制御意味へ落とす**ことができます。

---

### 6.2 キャリブレーションを「初回だけ」ではなく「継続推定」にする

初回キャリブレーションは必要ですが、それだけでは不十分です。Webカメラ環境では、ユーザーが椅子を動かす、姿勢が変わる、カメラが揺れる、距離が変わることがあります。

推奨は、次の2段階です。

| 種類                | 内容                                                                      |
| ------------------- | ------------------------------------------------------------------------- |
| initial calibration | neutral姿勢から肩幅、胴体長、頭部基準、腕長を推定                         |
| online calibration  | 高信頼度フレームだけを使って、骨長・neutral yaw・カメラ距離をゆっくり更新 |

online calibrationでは、即時更新せず、長い時定数で更新します。

```ts
if (frameReliability.torso > 0.9 && isNearNeutral(frame)) {
    calibratedShoulderWidth = lerp(
        calibratedShoulderWidth,
        measuredShoulderWidth,
        0.001,
    );
}
```

これにより、最初のキャリブレーションに失敗しても徐々に安定します。

---

### 6.3 VRoidキャラ向けに「小柄補正」を入れる

撮影者よりVRoidキャラが小柄、または頭が大きい場合、腕の到達距離と肩の見た目が合いません。ここはIKではなく、**canonical stateからavatar controlへ変換する段階**で補正します。

```ts
type AvatarProportionMap = {
    shoulderWidthScale: number;
    torsoHeightScale: number;
    upperArmScale: number;
    lowerArmScale: number;
    headInfluenceScale: number;
    armDepthCompression: number;
};
```

推奨値の例です。

```ts
const vroidSmallAvatarMap: AvatarProportionMap = {
    shoulderWidthScale: 0.85,
    torsoHeightScale: 0.9,
    upperArmScale: 0.92,
    lowerArmScale: 0.92,
    headInfluenceScale: 1.1,
    armDepthCompression: 0.6,
};
```

ポイントは、**奥行き方向を弱める**ことです。単眼カメラではz方向が不安定になりやすく、手を前に出した動作を忠実に再現しようとすると破綻しやすいためです。

---

## 7. Temporal layer: 平滑化ではなく状態推定として設計する

### 7.1 フィルタはlandmark座標だけにかけない

IK前段でlandmark座標を平滑化するだけでは、最終姿勢のjitterは十分に消えません。motion capture信号にはノイズが含まれるため、アニメーションに適用する前に処理が必要であることは、モーションキャプチャ信号処理の研究でも指摘されています。たとえばSensors 2022の論文では、moving average、B-spline smoothing、Kalman filterなどを比較し、raw captured motion signalsにはノイズが含まれるため後処理が必要だと述べています。([MDPI][9])

推奨は、複数段の時系列処理です。

```text
raw landmarks
  ↓ 軽い外れ値除去
semantic measurements
  ↓ confidence-aware filter
canonical controls
  ↓ state estimator
avatar motion intent
  ↓ style filter
final bone rotations
  ↓ short smoothing
```

---

### 7.2 One Euro Filterはリアルタイム入力の基本部品として使う

One Euro Filterは、低速時はcutoffを低くしてjitterを抑え、高速時はcutoffを上げてlagを減らす適応的low-pass filterです。原論文では、jitterとlagのバランスを少ないパラメータで調整できるフィルタとして説明されています。([ディレクションボルドー][10])

ただし、One Euro Filterだけで全てを解決しない方がよいです。適用対象を分けます。

| 対象             | 推奨                         |
| ---------------- | ---------------------------- |
| wrist target     | One Euro + confidence重み    |
| elbow hint       | One Euro + outlier rejection |
| torso yaw/pitch  | 強めのlow-pass               |
| hand openness    | One Euro + hysteresis        |
| gesture state    | debounce / minimum duration  |
| final quaternion | log-space smoothing          |

---

### 7.3 Kalman filterは「欠落補間」に強い

One Euro Filterはjitter/lag調整に向きますが、手が消えたときの予測や再検出時の復帰には、状態空間モデルの方が扱いやすいです。

最小構成は、位置と速度を持つconstant velocity modelです。

```ts
type JointState = {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    covariance: Matrix;
};
```

更新は次です。

```text
predict:
  x_t = A x_{t-1}

update:
  x_t = predicted + K * (observed - predicted)

where:
  measurement noise R = f(landmarkReliability)
```

信頼度が低いときはmeasurement noiseを大きくし、観測値を弱く反映します。

```ts
const measurementNoise = baseNoise / Math.max(reliability, 0.05);
```

この方式により、手が一時的に消えても、直前の速度から自然に減衰しながら予測できます。

---

### 7.4 B-spline / Savitzky-Golay系はライブではなく録画補正向け

B-spline smoothingのような手法は高品質なモーション信号を作りやすい一方、未来フレームを使うためライブ用途では遅延が問題になります。Sensors 2022の比較では、B-spline-based least square methodが高品質な出力を得られるとされていますが、ライブavatar制御では低遅延性が必要です。([MDPI][9])

したがって、次の使い分けが適切です。

| 用途                         | 推奨                                             |
| ---------------------------- | ------------------------------------------------ |
| ライブ配信・リアルタイム会話 | One Euro / Kalman / EMA                          |
| 録画後のモーション生成       | B-spline / Savitzky-Golay / non-causal smoothing |
| デバッグ用比較               | causal filterとoffline smootherを両方出す        |
| 教師データ作成               | offline smoothingでclean targetを作る            |

---

### 7.5 SmoothNet的な時系列補正は将来候補

SmoothNetは、既存pose estimatorの後段に接続するtemporal-only refinement networkとして提案されており、動画内でのpose jitterを低減する目的の手法です。説明ページでは、既存推定器の出力に対するjitter mitigationとして、long-range temporal relationsを学習すると説明されています。([ailingzeng.site][11])

ただし、今回の制約では、これをそのまま採用するのは優先度が低いです。

| 観点             | 評価             |
| ---------------- | ---------------- |
| 品質向上可能性   | 高い             |
| 実装コスト       | 高い             |
| 学習データ       | 必要             |
| ブラウザ組み込み | 追加モデルが必要 |
| ライセンス確認   | 必須             |
| 推奨度           | 将来候補         |

現実的には、まず自前のconfidence-aware temporal estimatorを作り、十分なログデータが集まってから軽量な時系列補正モデルを検討するのがよいです。

---

## 8. Semantic motion layer: landmark追従から「動作意図」へ変換する

### 8.1 かわいいキャラクターでは完全追従より「意味のある動き」が重要

人間の手先位置を忠実に再現しても、VRoidキャラとして自然とは限りません。単眼カメラでは微細なブレが目立つため、**continuous tracking + semantic animation** のハイブリッドにする方が品質が上がります。

```text
continuous tracking:
  - 腕の大まかな位置
  - 手の開閉
  - 頭・体幹の向き

semantic animation:
  - 手を振る
  - 指差し
  - 拳を握る
  - 両手を合わせる
  - 顔近くで手を添える
```

これは「モーション制御フレームワーク」の導入ではなく、MediaPipeの出力から自前で状態を判定し、Three.js標準のアニメーション合成で補う方式です。

---

### 8.2 MediaPipe Gesture Recognizerを補助入力として使う

MediaPipe Gesture Recognizerは、リアルタイムに手のgestureを認識し、hand landmarksも返すWeb向けタスクとして提供されています。公式ドキュメントでは、canned gesturesとして `Closed_Fist`, `Open_Palm`, `Pointing_Up`, `Thumb_Up`, `Victory`, `ILoveYou` などが示されています。([Google AI for Developers][12])

今回の用途では、Gesture Recognizerを主制御にするのではなく、**手指状態のsemantic label** として使うのが適切です。

| Gesture     | 用途                   |
| ----------- | ---------------------- |
| Open_Palm   | 手振り、手を見せる動作 |
| Closed_Fist | 拳、力を入れる動作     |
| Pointing_Up | 指差し                 |
| Thumb_Up    | サムズアップ動作       |
| Victory     | ピース                 |
| None        | 通常tracking           |

Gesture RecognizerもHand Landmarkerと同様にtracking confidenceやpresence thresholdを持ちます。Video modeではhand presenceが低いとpalm detectionを再実行し、trackingが成功していればhand detectionをskipする設計です。([Google AI for Developers][12])

---

### 8.3 Three.js AnimationMixerで「短い上半身クリップ」を合成する

Three.jsにはAnimationMixerがあり、特定のObject3D上のanimation playerとして使えます。公式ドキュメントでは、複数オブジェクトを独立にアニメーションする場合、それぞれにAnimationMixerを使えると説明されています。([Three.js][13]) また、QuaternionKeyframeTrackはquaternion keyframe values用のtrackとして提供されています。([Three.js][14])

これを使い、次のような短い上半身クリップを自作します。

| Clip               | 発火条件                                    |
| ------------------ | ------------------------------------------- |
| small_wave         | 手が上がっていてOpen_Palm、左右速度が周期的 |
| point_up           | Pointing_Upが一定時間継続                   |
| thumbs_up          | Thumb_Upが一定時間継続                      |
| shy_hand_near_face | 手が顔近く、Open_Palmまたは軽いcurl         |
| clap_like          | 両手距離が近く、速度が対向                  |
| explain_gesture    | 片手が胸前で開いている                      |

重要なのは、clipを完全に再生するのではなく、**tracking結果とadditive blendする**ことです。

```text
finalPose =
  trackingPose * 0.7
+ semanticClip * 0.3
```

ただし、手振りのようにtrackingが不安定になりやすい動作では、clip側の重みを一時的に上げます。

---

### 8.4 motion intentを導入する

landmarkから直接boneへ行くのではなく、途中で `MotionIntent` を作ります。

```ts
type MotionIntent = {
    leftArm: {
        role: "tracking" | "wave" | "pointing" | "nearFace" | "lost";
        confidence: number;
        expressiveness: number;
    };

    rightArm: {
        role: "tracking" | "wave" | "pointing" | "nearFace" | "lost";
        confidence: number;
        expressiveness: number;
    };

    torso: {
        role: "neutral" | "leaning" | "turning";
        confidence: number;
    };
};
```

この層を入れると、次のような判断ができます。

| 状況                                | 対応                                                  |
| ----------------------------------- | ----------------------------------------------------- |
| 手が高く、Open_Palmで横揺れ         | raw追従より手振りclipを強める                         |
| 手が顔に重なってHand confidence低下 | nearFaceとして保持し、急に腕を落とさない              |
| wristが画面外                       | 追従を切らず、lost poseへ遷移                         |
| Pointing_Upが安定                   | 指差しclipをblend                                     |
| 両手が交差                          | 左右入れ替えを即時反映せず、semantic continuityを優先 |

この方式は、現実の動きを完全再現するのではなく、**キャラクターとして意味が伝わる動き**を安定して出すために有効です。

---

## 9. Avatar profile layer: VRMモデル差分を品質問題として扱う

### 9.1 VRM-1.0ではrest rotation差を前提にする

VRM-1.0では、VRM-0.xのようにrest rotationが無回転に正規化される前提ではなく、モデルが任意のrest rotationを持つことを想定します。VRM Animation仕様では、同じ姿勢でもrest rotationやoptional bonesの有無によってpose dataが変わるため、`NormalizedLocalRotation` を中間形式としてpose dataを変換する考え方が示されています。([GitHub][15])

これはIK以外の重要な品質要因です。つまり、同じMediaPipe入力でも、VRMモデルごとに見た目が変わる問題を、**avatar profile** として管理すべきです。

```ts
type AvatarMotionProfile = {
    modelId: string;

    restPose: {
        boneLocalRotations: Record<string, THREE.Quaternion>;
        boneWorldRotations: Record<string, THREE.Quaternion>;
    };

    proportions: {
        shoulderWidth: number;
        torsoLength: number;
        upperArmLength: number;
        lowerArmLength: number;
        headSize: number;
    };

    retargetOffsets: {
        chest?: THREE.Quaternion;
        neck?: THREE.Quaternion;
        leftShoulder?: THREE.Quaternion;
        rightShoulder?: THREE.Quaternion;
        leftHand?: THREE.Quaternion;
        rightHand?: THREE.Quaternion;
    };

    style: MotionStyleProfile;
};
```

---

### 9.2 モデルごとの「破綻しやすさ」をプロファイル化する

VRoid Studio標準モデルを主対象にしても、身長、頭身、肩幅、腕の長さ、服装、髪のボリュームは変わります。これらは検出精度ではなく、**アニメーション適用時の破綻要因**です。

| モデル要因        | 起きやすい問題         | 対策                     |
| ----------------- | ---------------------- | ------------------------ |
| 頭が大きい        | 手が顔にめり込む       | face proximity penalty   |
| 肩幅が狭い        | 腕が胴体に重なる       | elbow outward bias       |
| 腕が短い          | 手先が届かず伸び切る   | reach compression        |
| 袖が大きい        | 肘・手首の破綻が目立つ | wrist motion抑制         |
| upperChestなし    | 肩上げが硬い           | chest側へ分配            |
| shoulder bone弱い | 腕上げが不自然         | upperArm側の補正を弱める |

このプロファイルは自動計測 + 手動調整のハイブリッドが現実的です。

---

### 9.3 corrective morph / pose-space deformationは高品質化候補

VRM/VRoidの標準運用からは少し外れますが、肩・肘・手首の見た目を改善するには、body corrective morphを使う余地があります。Three.js自体はmorph target influenceを扱えますが、VRMの標準Expressionとは別に、モデル側に補正用morph targetを持たせる必要があります。

推奨度は中程度です。

| 項目          | 評価                                         |
| ------------- | -------------------------------------------- |
| 品質効果      | 肩・肘の見た目には高い                       |
| 汎用性        | モデルごとの作り込みが必要                   |
| VRoid標準運用 | やや外れる                                   |
| 実装難度      | 中〜高                                       |
| 推奨          | 汎用機能ではなく、特定モデル向け高品質モード |

---

## 10. Perception orchestration: Web Workerは品質安定化にも効く

MediaPipeのWebドキュメントでは、Pose / Hand / Face / Gestureの各タスクについて、`detectForVideo()` や `recognizeForVideo()` は同期実行でUI threadをblockするため、Web Workersで別thread実行できると説明されています。([Google AI for Developers][1])

今回のスコープではパフォーマンス最適化は主目的ではありませんが、Web Worker化は品質にも関係します。

| 問題                                    | Worker化による効果                 |
| --------------------------------------- | ---------------------------------- |
| main threadの描画負荷で検出間隔が揺れる | 検出timestampが安定しやすい        |
| Pose / Hand / Faceの実行順が不定        | orchestratorで同期しやすい         |
| UI操作でモーションが飛ぶ                | 検出処理を分離できる               |
| ログ記録が重い                          | worker側でraw resultを保存しやすい |

推奨構成は次です。

```text
Main Thread
  - video element
  - requestVideoFrameCallback
  - Three.js rendering
  - final pose application

Worker
  - MediaPipe task instances
  - ROI crop processing
  - reliability estimation
  - temporal state estimation
  - raw result recording
```

MediaPipeの入力画像転送コストには注意が必要ですが、設計上は `FramePacket` と `MotionPacket` を明確に分けると扱いやすくなります。

---

## 11. Data-driven post-processing: 自前の軽量モデルは将来有効

### 11.1 すぐ導入すべきではないが、ログが溜まれば有望

MediaPipeより重い検出モデルを導入するより、**MediaPipe出力を後処理する軽量モデル**の方が現実的です。

候補は次です。

| 手法               | 入力                           | 出力                    | 用途           |
| ------------------ | ------------------------------ | ----------------------- | -------------- |
| temporal MLP       | 過去Nフレームのcanonical state | 現在のclean state       | jitter低減     |
| TCN                | landmark sequence              | smoothed canonical pose | 動作全体の補正 |
| gesture classifier | hand sequence                  | gesture label           | 手振り・指差し |
| anomaly detector   | quality vector sequence        | dropout / swap判定      | 外れ値検出     |

SmoothNetのようなtemporal-only refinement networkは、既存pose estimatorの出力を後処理する思想として参考になります。([ailingzeng.site][11])

ただし、最初からML後処理を入れるべきではありません。まずはログ記録基盤を作り、失敗例を集め、ルールベースで限界が見えた部分だけモデル化するのがよいです。

---

### 11.2 学習対象は「骨回転」ではなく「canonical control」にする

学習モデルを作る場合、直接VRMボーン回転を出すのは避けるべきです。モデル差分が大きく、汎用化しにくいためです。

推奨出力は次です。

```ts
type LearnedMotionCorrection = {
    correctedCanonicalState: CanonicalUpperBodyState;
    reliabilityOverride?: Partial<ReliabilityMap>;
    semanticIntent?: Partial<MotionIntent>;
};
```

これにより、学習モデルはMediaPipe出力の揺れや欠落を補正し、実際のVRM適用は既存のretarget layerに任せられます。

---

## 12. Evaluation layer: 品質改善には再現可能な評価基盤が必須

### 12.1 ライブカメラだけで調整しない

この種のシステムでは、ライブカメラを見ながらパラメータを調整すると、再現性が低くなります。まず、MediaPipe出力と映像metadataを保存し、同じ入力を何度も再生できるようにすべきです。

```ts
type MotionCaptureDebugFrame = {
    mediaTimeMs: number;
    presentedFrames: number;

    camera: {
        width: number;
        height: number;
        settings: MediaTrackSettings;
    };

    mediapipe: {
        pose?: SerializedPoseResult;
        hands?: SerializedHandResult[];
        face?: SerializedFaceResult;
        gesture?: SerializedGestureResult[];
    };

    reliability: ReliabilityMap;
    canonicalState: CanonicalUpperBodyState;
    finalPose: SerializedVrmPose;
};
```

この記録があると、フィルタやsemantic layerを変更した際に、同じ入力に対する出力差分を比較できます。

---

### 12.2 評価指標を定義する

主観評価だけでは調整が難しいため、最低限の定量指標を持つべきです。

| 指標                         | 意味                         |
| ---------------------------- | ---------------------------- |
| landmark dropout rate        | 部位ごとの検出欠落率         |
| left-right swap count        | 左右取り違え回数             |
| border risk duration         | 手・肘・肩が画面端に近い時間 |
| bone length variance         | 推定骨長の揺れ               |
| angular velocity spike count | 最終ボーン回転の急変回数     |
| pose recovery jump           | 再検出時の姿勢ジャンプ量     |
| semantic stability           | gesture labelのちらつき      |
| perceived cuteness score     | 主観評価。最終的には必要     |

特に重要なのは、**最終ボーン回転の角速度スパイク**です。landmarkが少し揺れただけでも、ボーン回転では大きなジャンプになることがあります。

---

### 12.3 テストモーションを固定する

品質改善用の標準テストを作ります。

| テスト               | 狙い                      |
| -------------------- | ------------------------- |
| neutral 10秒         | jitter評価                |
| ゆっくり片手を上げる | shoulder / torso安定性    |
| 手を横に振る         | 手振り検出・semantic clip |
| 指差し               | gesture state安定性       |
| 手を顔前に置く       | face/hand occlusion       |
| 両手を交差           | 左右取り違え              |
| 片手を画面外へ出す   | dropout処理               |
| カメラに手を近づける | depth異常                 |
| 斜め向き             | torso/head整合            |
| 小柄VRoidモデル      | proportion mapping        |

このテストを毎回同じログで再生し、各改善の効果を比較します。

---

## 13. 実装モジュール案

IK以外を中心にした新規実装では、次のモジュール分割が適しています。

```text
src/mocap/
  camera/
    CameraInputController.ts
    CameraQualityController.ts
    FrameClock.ts

  perception/
    MediaPipeOrchestrator.ts
    PosePass.ts
    HandRoiPass.ts
    FaceRoiPass.ts
    GesturePass.ts
    RoiMapper.ts

  reliability/
    LandmarkReliabilityEstimator.ts
    SegmentationConsistency.ts
    BoneLengthConsistency.ts
    TemporalOutlierDetector.ts

  canonical/
    UserCalibration.ts
    BodyLocalTransform.ts
    CanonicalUpperBodyState.ts
    AvatarProportionMapper.ts

  temporal/
    OneEuroFilter.ts
    KalmanStateEstimator.ts
    Hysteresis.ts
    DropoutStateMachine.ts

  semantic/
    MotionIntentEstimator.ts
    GestureStateMachine.ts
    AdditiveMotionClipController.ts

  avatar/
    AvatarMotionProfile.ts
    VrmRetargetProfile.ts
    CorrectivePoseProfile.ts

  evaluation/
    MotionDebugRecorder.ts
    MotionReplayPlayer.ts
    MotionMetrics.ts
```

この構成では、IKは `avatar` 以降の一部に閉じ込められます。上流の品質改善を独立して評価できるため、実装・調整・検証が容易になります。

---

## 14. 実装優先順位

### Phase 1: 記録・再生・指標化

最初にやるべきは、アルゴリズム改善ではなく、ログ基盤です。

| 実装                           | 理由                     |
| ------------------------------ | ------------------------ |
| MediaPipe raw result recording | 再現可能な調整のため     |
| final pose recording           | 出力比較のため           |
| metrics dashboard              | 改善/悪化を判断するため  |
| fixed test sequence            | 主観だけに依存しないため |

---

### Phase 2: FrameClock / CameraQuality

| 実装                          | 効果                         |
| ----------------------------- | ---------------------------- |
| requestVideoFrameCallback駆動 | timestamp整合                |
| getSettings確認               | 実カメラ設定の把握           |
| border risk判定               | 手・肩の画面外問題を早期検出 |
| user framing guide            | 検出精度以前の問題を減らす   |

---

### Phase 3: Reliability layer

| 実装                       | 効果                   |
| -------------------------- | ---------------------- |
| landmark reliability map   | 部位ごとの信用度制御   |
| temporal outlier rejection | 急な飛びを抑制         |
| bone length consistency    | depth異常を検出        |
| segmentation consistency   | 背景誤検出・欠落を扱う |

---

### Phase 4: Temporal state estimator

| 実装                     | 効果               |
| ------------------------ | ------------------ |
| One Euro Filter          | jitter/lagバランス |
| constant velocity Kalman | dropout補間        |
| hysteresis               | 状態ちらつき抑制   |
| recovery blending        | 再検出時の飛び抑制 |

---

### Phase 5: Pose-seeded ROI

| 実装                        | 効果               |
| --------------------------- | ------------------ |
| Pose wristからhand crop生成 | 小さい手の検出改善 |
| crop座標の逆変換            | full-frame整合     |
| left/right ROI固定          | 左右入れ替え抑制   |
| face ROI                    | head姿勢安定化     |

---

### Phase 6: Canonicalization / Avatar profile

| 実装                      | 効果             |
| ------------------------- | ---------------- |
| neutral calibration       | 体型差吸収       |
| online calibration        | 長時間使用で安定 |
| avatar proportion mapping | 小柄VRoid対応    |
| per-model profile         | モデル差分吸収   |

---

### Phase 7: Semantic motion layer

| 実装                      | 効果                       |
| ------------------------- | -------------------------- |
| gesture state machine     | 手指状態の意味づけ         |
| authored upper-body clips | かわいい動きの安定化       |
| additive blending         | raw追従と演出の両立        |
| motion intent             | 破綻時も意味ある動きにする |

---

## 15. 最終推奨構成

IK以外の品質改善を最大限取り入れるなら、最終構成は次です。

| 領域           | 推奨                                                                     |
| -------------- | ------------------------------------------------------------------------ |
| カメラ入力     | `getUserMedia` constraints + `getSettings()` 検証                        |
| フレーム同期   | `requestVideoFrameCallback` 基準                                         |
| MediaPipe実行  | Pose full-frame + Hand/Face ROI pass                                     |
| Pose           | segmentation maskを品質判定に使う                                        |
| Hand           | tracking状態をアプリ側でも管理                                           |
| Face           | transformation matrixを頭部姿勢品質に使う                                |
| 信頼度         | presence / visibility / segmentation / temporal / bone consistencyを合成 |
| 正規化         | body-local canonical stateを中間表現にする                               |
| 体型差         | user calibration + avatar proportion map                                 |
| 時系列         | One Euro + Kalman + hysteresis                                           |
| 欠落処理       | Detected / Unstable / Predicted / Recovering / Lost                      |
| ジェスチャー   | MediaPipe Gesture Recognizerまたは自前分類を補助入力にする               |
| アニメーション | Three.js AnimationMixerで短い上半身clipをadditive blend                  |
| VRM差分        | AvatarMotionProfileでrest pose、proportion、offsetを管理                 |
| 評価           | raw result recording + replay + metrics                                  |

この設計の核心は、**MediaPipe出力を直接モーションに変換しない**ことです。単眼カメラでは、奥行き、手の欠落、左右取り違え、体型差、モデル差分、jitterが避けられません。したがって、最良の実装は「IKを高度化する」だけでなく、**観測値を評価し、正規化し、時系列で推定し、キャラクターらしい動作意図へ変換してから、VRMへ適用する**構成です。

[1]: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google AI for Developers"
[2]: https://developer.mozilla.org/en-US/docs/Web/API/Media_Capture_and_Streams_API/Constraints "Capabilities, constraints, and settings - Web APIs | MDN"
[3]: https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback?utm_source=chatgpt.com "HTMLVideoElement: requestVideoFrameCallback() method"
[4]: https://opencv24-python-tutorials.readthedocs.io/en/latest/py_tutorials/py_calib3d/py_calibration/py_calibration.html?utm_source=chatgpt.com "Camera Calibration — OpenCV-Python Tutorials beta ..."
[5]: https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/?utm_source=chatgpt.com "MediaPipe Holistic — Simultaneous Face, Hand and Pose ..."
[6]: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google AI for Developers"
[7]: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google AI for Developers"
[8]: https://openaccess.thecvf.com/content/ICCV2021/papers/Liu_Normalized_Human_Pose_Features_for_Human_Action_Video_Alignment_ICCV_2021_paper.pdf "Normalized Human Pose Features for Human Action Video Alignment"
[9]: https://www.mdpi.com/1424-8220/22/12/4629 "Noise Reduction in Human Motion-Captured Signals for Computer Animation based on B-Spline Filtering"
[10]: https://direction.bordeaux.inria.fr/~roussel/publications/2012-CHI-one-euro-filter.pdf "1e Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems"
[11]: https://ailingzeng.site/smoothnet "SmoothNet: A Plug-and-Play Network for Refining Human Poses in Videos "
[12]: https://ai.google.dev/edge/mediapipe/solutions/vision/gesture_recognizer/web_js "Gesture recognition guide for Web  |  Google AI Edge  |  Google AI for Developers"
[13]: https://threejs.org/docs/pages/AnimationMixer.html?utm_source=chatgpt.com "AnimationMixer – three.js docs"
[14]: https://threejs.org/docs/pages/QuaternionKeyframeTrack.html?utm_source=chatgpt.com "QuaternionKeyframeTrack – three.js docs"
[15]: https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md "vrm-specification/specification/VRMC_vrm_animation-1.0/how_to_transform_human_pose.md at master · vrm-c/vrm-specification · GitHub"
