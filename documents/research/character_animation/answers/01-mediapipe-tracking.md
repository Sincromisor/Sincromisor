# 調査レポート: `sincromisor-frontend` における MediaPipe Tracking 運用設計

作成日: **2026-06-14**
対象: **Sincromisor `sincro` モード / 単眼 Web カメラ / MediaPipe Pose・Hand・Face・Gesture / Three.js / VRM 1.0 / VRoid Studio 系モデル**

---

## 0. 要旨

結論として、`sincromisor-frontend` のキャラクターアニメーション実装では、**MediaPipe を主推定系として継続採用するのが妥当**です。ただし、MediaPipe の landmark を VRM ボーンへ直接流し込む設計は避け、添付依頼書が示す通り、`ReliabilityMap`、`Body-local canonical state`、`Temporal state estimation`、`Motion intent`、`Avatar profile` を介して VRM pose へ変換するべきです。依頼書の主眼も、MediaPipe 出力を「骨格姿勢」ではなく「不確実性を持つ観測値」として扱うことにあります。

現在の `sincromisor-frontend` は、この方針に沿って拡張しやすい構造をすでに持っています。`package.json` には `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、`onnxruntime-web` が含まれており、`src/features/gaze`、`src/character/ik`、`src/character/retargeting`、`src/pages/motionDebug` も存在します。したがって、新規に巨大な `mocap` 層を作り直すより、既存の `trackingRuntime`、`poseTracking`、`retargeting`、`ik`、`motionDebug` を活かし、その間に信頼度・正規化・時系列推定の層を追加するのが安全です。([GitHub][1])

推奨する最小構成は次です。

```text
Camera frame
  -> FrameClock / CameraQuality
  -> Pose full-frame
  -> Hand / Face ROI or full-frame fallback
  -> MediaPipe observations
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntent
  -> AvatarMotionProfile
  -> Retarget / IK / additive clip
  -> VRM normalized local rotations
```

この構成は、既存ロードマップが示す目標アーキテクチャとも整合します。特に `ReliabilityEstimator`、`Canonicalizer`、`TemporalStateEstimator`、`MotionIntentEstimator`、`AvatarMotionProfile` を既存責務境界へ追加する方針が明示されています。

---

## 1. 現行 `sincromisor-frontend` との整合性

### 1.1 現行構成で活かすべき部分

GitHub 上の `sincromisor-frontend` には、少なくとも次の実装上の足場があります。

| 領域                   | 現行上の対応箇所                | 今回追加すべき責務                                                         |
| ---------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| カメラ・推論ランタイム | `features/gaze/trackingRuntime` | `FrameClock`、Worker 実行、MediaPipe multi-pass orchestration              |
| MediaPipe pose 入力    | `features/gaze/poseTracking`    | Pose snapshot から `ReliabilityMap` と canonical state への変換            |
| VRM 向け変換           | `character/retargeting`         | canonical state → normalized VRM humanoid pose                             |
| 腕 IK                  | `character/ik`                  | confidence-aware target、elbow pole fallback、reach clamp                  |
| デバッグ               | `pages/motionDebug`             | raw observation、reliability、canonical、temporal、final pose の記録・再生 |

ロードマップでも、現行実装には `trackingRuntime`、`poseTracking`、`retargeting`、`ik`、`motionDebug` という良い責務境界があるため、それらを破棄せず中間層を太らせる方針が示されています。

### 1.2 最初に作るべきもの

最初に追加すべきものは、高度な IK ではなく **記録・再生・信頼度・時系列状態**です。既存 report03 でも、品質差が最初に出る領域は「信頼度評価」と「時系列処理」であり、実装順は `記録/再生/デバッグ` → `最小キャリブレーション` → `信頼度評価` → `時系列処理` → `基本 IK / retarget` とされています。

---

## 2. MediaPipe 採用判断

### 2.1 採用理由

MediaPipe を標準候補とする判断は妥当です。MediaPipe は Apache-2.0 ライセンスで公開されており、ブラウザ向けには `@mediapipe/tasks-vision` として Pose / Hand / Face / Gesture 系の task が提供されています。Pose Landmarker は 33 個の pose landmarks と world landmarks、Hand Landmarker は手の landmarks / world landmarks / handedness、Face Landmarker は face landmarks と facial transformation matrices、Gesture Recognizer は gesture categories / handedness / hand landmarks を返せます。([GitHub][2])

ただし、MediaPipe の `detectForVideo()` / `recognizeForVideo()` 系 API は同期実行で UI thread を block し得るため、実運用では Web Worker 分離を前提にした方がよいです。これはパフォーマンスだけでなく、フレーム時刻の揺れや描画落ちによる motion jitter を避ける意味でも重要です。([Google for Developers][3])

### 2.2 MediaPipe は「正解姿勢」ではなく「観測値」

Pose Landmarker の normalized landmark では `x` と `y` が画像内正規化座標、`z` が hip midpoint を原点とする相対的な奥行きで、値が小さいほどカメラに近いと説明されています。また world landmarks は meter 単位で hip midpoint を原点とします。しかし単眼推定である以上、奥行き、肘方向、手首 roll、遮蔽、左右同定は不安定化しやすく、VRM の絶対姿勢としては扱うべきではありません。([Google for Developers][3])

既存 report01 も、最良方針は MediaPipe landmark を直接 VRM bone に流す方式ではなく、観測値として扱い、制約付きキャラクターモーションソルバへ渡す方式だと整理しています。

---

## 3. MediaPipe 出力ごとの信頼度設計

### 3.1 信頼度設計表

| 出力                           | 信用できる条件                                                                               | 信用しない条件                                                                             | 主な用途                                            | 信頼度補助指標                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------- |
| Pose 2D landmarks              | 肩・腰・肘・手首が画面内に入り、presence / visibility が高く、骨長と時系列変化が安定している | 画面端、遮蔽、腕交差、手首だけ飛ぶ、複数人混入、低解像度、motion blur                      | torso frame、肩線、腕の上下・左右、2D wrist target  | `presence`、`visibility`、border proximity、segmentation、temporal innovation |
| Pose world landmarks           | 2D landmark も安定し、肩幅・上腕長・前腕長の比率が大きく崩れていない                         | absolute depth、手先 z の急変、腕を前に出した時の深度過信、体幹スケールの急変              | body-local 方向、arm elevation、forwardness の補助  | bone length consistency、body scale consistency、z compression                |
| Pose `visibility` / `presence` | 部位別 reliability の基礎値として使う                                                        | これだけで採否を決める、低 visibility でも時系列的に自然な観測を即捨てる                   | base reliability                                    | 他指標との合成必須                                                            |
| Hand image landmarks           | 手が十分大きく、crop 内に収まり、tracking が安定し、指同士の構造が自然                       | 手が小さい、顔前で隠れる、画面端、片手がもう片手を隠す、手首位置が Pose wrist と大きく乖離 | palm basis、finger curl、finger splay、thumb oppose | hand size、ROI consistency、palm geometry、temporal innovation                |
| Hand world landmarks           | 指の相対形状・palm orientation の補助として使える                                            | 手首の絶対 3D 位置、腕 IK の主 target として使う                                           | wrist roll 補助、palm normal                        | Pose wrist との整合、hand scale consistency                                   |
| Hand handedness                | Pose wrist と近く、時系列 ID と一致し、左右の手が離れている                                  | 腕交差、両手接近、顔前、鏡像変換の扱いが曖昧、片手 dropout 後の再検出                      | 左右割当の観測値                                    | Pose wrist 距離、前フレーム予測、hysteresis                                   |
| Face landmarks                 | 顔が十分大きく、正面〜軽い横向き、手や髪で隠れていない                                       | 顔が小さい、横向きが強い、手が顔前、複数人、表情用途で過信                                 | head fallback、face ROI 品質                        | face bbox、landmark spread、presence、temporal                                |
| Face transformation matrix     | `numFaces = 1` で tracking が安定し、neutral offset が取れている                             | 顔が一時消失、急旋回、手の遮蔽、行列が前フレームから急変                                   | head orientation 主入力                             | angular innovation、Face/Pose 整合、low-pass                                  |
| Gesture label / confidence     | 手 landmark reliability が高く、同じ gesture が一定時間継続                                  | 1〜2 frame の spike、hand reliability 低、confidence 低、gesture と finger state が矛盾    | semantic motion trigger                             | confidence、minimum duration、debounce、hysteresis                            |

Gesture Recognizer の標準カテゴリには `Closed_Fist`、`Open_Palm`、`Pointing_Up`、`Thumb_Up`、`Victory` などが含まれますが、手が検出されても既知 gesture に該当しない場合は `"None"`、手が検出されない場合は空結果になり得ます。したがって gesture label は、フレーム単位の骨制御ではなく、`MotionIntent` の補助入力として扱うべきです。([Google for Developers][4])

### 3.2 基本方針

`finalWeight` は単一の MediaPipe confidence ではなく、複数指標の合成値にします。

```ts
type PartState = "Tracked" | "Suspect" | "Predicted" | "Lost" | "Recovering";

type JointReliability = {
    modelPresence: number;
    modelVisibility?: number;
    tracking?: number;

    border: number;
    segmentation?: number;
    boneLength: number;
    bodyScale: number;
    temporal: number;
    side: number;
    roi: number;

    state: PartState;
    finalWeight: number;
};

type ReliabilityMap = {
    timestampMs: number;

    camera: {
        frameWidth: number;
        frameHeight: number;
        actualFps: number;
        torsoInFrame: number;
        leftHandInFrame: number;
        rightHandInFrame: number;
        borderRisk: number;
        overall: number;
    };

    torso: JointReliability;
    head: JointReliability;
    leftArm: JointReliability;
    rightArm: JointReliability;
    leftHand: JointReliability;
    rightHand: JointReliability;
    gesture: {
        label?: string;
        confidence: number;
        stableDurationMs: number;
        finalWeight: number;
    };
};
```

合成は、初期実装では乗算または幾何平均で十分です。

```ts
finalWeight = clamp01(
    baseMediaPipeWeight *
        borderWeight *
        segmentationWeight *
        boneLengthWeight *
        bodyScaleWeight *
        temporalWeight *
        sideConsistencyWeight *
        roiConsistencyWeight *
        cameraQualityWeight,
);
```

ただし、`finalWeight < threshold` で即座に捨てるのではなく、下流の `TemporalStateEstimator` へ低 weight の観測として渡す方が安定します。roadmap でも、部位ごとに `Tracked`、`Suspect`、`Predicted`、`Lost`、`Recovering` を持ち、dropout 中は予測しながら comfortable pose へ戻す設計が示されています。

---

## 4. 追加信頼度指標の評価

| 指標                       | 優先度 | 計算方法                                                                                | 有効な不具合                                     | 誤判定しやすい条件                             |
| -------------------------- | -----: | --------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| border proximity           |     高 | landmark または ROI bbox から画像端までの正規化距離を sigmoid / smoothstep で weight 化 | 画面端の手・肘・顔の誤検出、crop 欠け            | ユーザーが意図的に画面端へ手を出す             |
| bone length consistency    |     高 | 肩幅、上腕長、前腕長、胴体長を calibration / EMA と比較し、log ratio で penalty         | wrist jump、elbow flip、奥行き破綻               | 2D だけで見ると前後方向動作を誤って短縮と判定  |
| temporal innovation        |     高 | 予測値と観測値の差を body scale と `dt` で正規化                                        | 急な飛び、再検出 jump、左右入替                  | 本当に速い動作。速度上限を部位別にする必要あり |
| segmentation consistency   |     中 | Pose segmentation mask 周辺を sampling し、landmark / limb が人体領域にあるかを見る     | 背景誤検出、肩・腕の欠落、顔前の手               | segmentation 自体が崩れる、服・髪・背景類似色  |
| body scale consistency     |     高 | shoulder width、torso height、head size、hand size の短期/長期比率を比較                | カメラ距離変化、ROI scale mismatch、world z 破綻 | ユーザーが意図的に前後移動                     |
| detection / tracking state |     高 | MediaPipe の detection / presence / tracking 閾値とアプリ側 state machine を合成        | palm detector 再実行直後の jump、tracking loss   | 閾値が高すぎると動きが鈍る                     |
| side consistency           |     高 | Pose wrist、Hand handedness、前フレーム track ID、palm basis の連続性で左右割当         | 左右入替、腕交差、両手接近                       | 鏡像表示と内部座標の符号設計ミス               |
| ROI consistency            |     中 | ROI 経路と full-frame 経路の landmark / bbox 差分を見る                                 | crop 座標変換ミス、ROI の取り違え                | full-frame 側も不安定な場合                    |

Pose segmentation mask は、公式に Pose Landmarker の出力として利用可能であり、`outputSegmentationMasks` オプションで有効化できます。描画用ではなく、landmark が人体領域と整合しているかを見る品質指標として使うのが適切です。([Google for Developers][3])

---

## 5. Pose 起点 Hand / Face ROI 化

### 5.1 推奨構成

MediaPipe Holistic の設計思想では、pose を毎フレーム推定し、その結果から face / hand の ROI prior を作ることで、速い動きへの追従性と左右一貫性を高めます。Google Research の解説でも、pose prediction を ROI prior として使うことが、左手と右手の取り違えや体部位の混同を抑えると説明されています。([Google Research][5])

`Sincromisor` では、Holistic をそのまま使うより、次のような自前 orchestration が扱いやすいです。

```text
1. Pose Landmarker を full-frame で実行
2. left/right wrist と face region から ROI を作る
3. Hand Landmarker を left-hand crop / right-hand crop で実行
4. Face Landmarker を face crop で実行
5. crop 座標を full-frame 座標へ戻す
6. Pose wrist / Face transform / Hand palm basis を ReliabilityMap へ統合
7. body-local canonical state へ変換
```

既存 report01 も、Pose / Hand / Face を分離して使い、自前の Holistic 的統合層を持つ方針を推奨しています。役割分担は「腕の位置は Pose、手首の向きと指は Hand、頭部姿勢は Face」です。

### 5.2 ROI 化すべき条件

| 条件                                | ROI 化の効果                                                        |
| ----------------------------------- | ------------------------------------------------------------------- |
| 手が小さく写る                      | full-frame Hand より手領域の解像度を確保しやすい                    |
| 手が速く動く                        | Pose wrist から探索範囲を限定し、再検出を早めやすい                 |
| 手が顔の近くにある                  | face と hand の混同を減らし、nearFace 状態を検出しやすい            |
| 腕が交差する                        | Pose wrist と時系列 ID を使い、left/right assignment を維持しやすい |
| Hand tracking が頻繁に dropout する | ROI fallback によって再検出の探索範囲を狭められる                   |
| 小柄 VRoid で手先表現が重要         | 指 curl / palm basis の安定性が見た目に効く                         |

roadmap でも Phase 7 として Pose wrist から hand crop、Pose face region から FaceLandmarker ROI を作り、crop 座標を full-frame / body-local へ戻し、handedness を Hand の結果だけに依存しない構成が示されています。

### 5.3 ROI 化しなくてよい条件

| 条件                                   | 方針                                                                  |
| -------------------------------------- | --------------------------------------------------------------------- |
| 手が十分大きく、full-frame Hand が安定 | full-frame のままでもよい                                             |
| CPU / WASM 負荷が厳しい                | Pose full-frame + Hand full-frame を低頻度、ROI は必要時のみ          |
| 初期デバッグ段階                       | full-frame と ROI の両方を記録し、比較可能にする                      |
| Face が常に大きく安定                  | Face full-frame のままでもよい。ただし head matrix の信頼度評価は必要 |

### 5.4 crop 座標を full-frame 座標へ戻す注意点

ROI 経路の最重要点は、**crop 内 landmark をそのまま body-local state に入れない**ことです。必ず次の変換を明示します。

```text
crop normalized coordinate
  -> crop pixel coordinate
  -> full-frame pixel coordinate
  -> full-frame normalized coordinate
  -> camera/body-local coordinate
```

実装では、各 ROI に次のメタデータを持たせるべきです。

```ts
type RoiTransform = {
    source: "pose-wrist" | "pose-face" | "full-frame-fallback";
    fullFrameWidth: number;
    fullFrameHeight: number;

    x: number;
    y: number;
    width: number;
    height: number;

    rotationRad: number;
    paddingScale: number;
    mirrored: boolean;
};
```

特に注意すべき点は、左右反転表示と内部座標の分離、crop padding による scale 変化、回転 crop を使う場合の逆変換、ROI 内 world landmarks の扱いです。Hand world landmarks は crop 局所の形状理解には有用ですが、Pose world landmarks と同じ絶対座標系として合成してはいけません。

### 5.5 handedness 補正

Hand Landmarker の handedness はそのまま最終判断にせず、次の assignment score で左右を決めます。

```ts
assignmentCost =
    wPoseDistance * distance(handWristFullFrame, poseWrist) +
    wTemporal * distance(handWristFullFrame, predictedTrackWrist) +
    wHandedness * handednessPenalty +
    wPalm * palmBasisDiscontinuity +
    wRoi * roiMismatchPenalty;
```

左右入替は、単一フレームで切り替えず、`N` frame または `M` ms 継続した場合のみ確定します。腕交差中は `sideConsistencyWeight` を下げ、motion solver 側では前フレーム elbow pole と fallback pole を強めます。

### 5.6 fallback

```text
Hand ROI success
  -> use ROI hand landmarks

Hand ROI fail
  -> full-frame Hand fallback

Full-frame Hand fail
  -> Pose wrist + Pose elbow only

Pose wrist unstable
  -> Temporal predicted wrist

Long dropout
  -> comfortable hand pose / neutral fingers
```

Face も同様に、

```text
Face ROI success
  -> Face transformation matrix

Face ROI fail
  -> full-frame Face fallback

Face fail
  -> Pose nose / ears / eyes fallback

Pose head fallback unstable
  -> previous head rotation -> neutral
```

Face Landmarker の transformation matrix は head orientation の主入力として有用ですが、`numFaces = 1` のときだけ smoothing が適用される設定があるため、`sincro` モードでは原則 1 人入力として扱うのが適切です。([Google for Developers][6])

---

## 6. 推奨実行構成

### 6.1 PerceptionOrchestrator

```text
FrameClock
  - requestVideoFrameCallback based timestamp
  - presentedFrames / dropped frame tracking

Pose pass
  - full-frame
  - every video frame or target fps
  - segmentation mask optional but recommended for debug/reliability

Hand pass
  - ROI pass from Pose wrist
  - full-frame fallback
  - tracking state managed by app

Face pass
  - ROI pass from Pose face region
  - full-frame fallback
  - outputFacialTransformationMatrixes enabled

Gesture pass
  - run only when hand reliability is sufficient
  - lower frequency is acceptable
  - output used for MotionIntent, not direct bone control
```

Hand Landmarker は `minHandDetectionConfidence`、`minHandPresenceConfidence`、`minTrackingConfidence` を持ち、Video mode では presence が閾値を下回ると palm detection を再実行し、tracking が成功している場合は検出を skip する設計です。したがって、アプリ側でも `DetectedStable`、`DetectedUnstable`、`Predicted`、`Recovering`、`Lost` のような状態機械を持つべきです。([Google for Developers][7])

### 6.2 CanonicalUpperBodyState

MediaPipe 座標を直接 VRM target にせず、体幹基準の意味量へ変換します。

```ts
type CanonicalArmState = {
    elevation: number; // 腕を上げている度合い
    openness: number; // 体から横に開いている度合い
    forwardness: number; // 前に出している度合い。z単独では決めない
    elbowFlexionHint: number; // 肘曲げ角の補助
    wristTarget: THREE.Vector3;
    wristRollHint: number;
    confidence: number;
};

type CanonicalUpperBodyState = {
    torso: {
        rotation: THREE.Quaternion;
        confidence: number;
    };
    head: {
        rotation: THREE.Quaternion;
        confidence: number;
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
```

単眼カメラでは奥行きが不安定なため、`forwardness` は Pose world z 単独で決めず、手の見かけサイズ、腕の 2D 短縮、肘・手首の相対位置、時系列連続性を混ぜます。小柄 VRoid や頭が大きいキャラクターでは、奥行き方向を圧縮する `armDepthCompression` を `AvatarMotionProfile` に持たせるのが有効です。

---

## 7. TemporalStateEstimator

### 7.1 平滑化ではなく状態推定として扱う

単純に landmark 座標へ low-pass filter をかけるだけでは、肘反転、手首 roll 暴れ、再検出 jump は十分に抑えられません。推奨は、部位ごとに状態を持つことです。

```ts
type TrackedPart<T> = {
    state: "Tracked" | "Suspect" | "Predicted" | "Lost" | "Recovering";
    value: T;
    velocity?: T;
    reliability: number;
    lostDurationMs: number;
    recoveringDurationMs: number;
};
```

| 状態         | 処理                                           |
| ------------ | ---------------------------------------------- |
| `Tracked`    | 観測値を通常反映                               |
| `Suspect`    | 観測値を弱く反映し、前フレームを重視           |
| `Predicted`  | constant velocity を減衰させながら予測         |
| `Lost`       | comfortable pose / neutral へゆっくり戻す      |
| `Recovering` | 再検出値へ即スナップせず 200〜400ms 程度で復帰 |

roadmap では、手が 200〜700ms 程度消えても腕が急に neutral へ落ちないこと、再検出時の角度ジャンプを 10〜15 度以下へ抑えることが完了条件として示されています。

### 7.2 フィルタの使い分け

| 対象             | 推奨                                                    |
| ---------------- | ------------------------------------------------------- |
| wrist target     | One Euro Filter + confidence-aware update               |
| elbow pole       | outlier rejection + previous pole + fallback pole blend |
| torso            | 強めの low-pass。低振幅・低周波                         |
| head             | Face matrix + neutral offset + angular low-pass         |
| wrist roll       | Hand palm basis を弱く反映。急変は抑制                  |
| finger curl      | One Euro + hysteresis                                   |
| gesture state    | debounce + minimum duration                             |
| final quaternion | log-space smoothing                                     |

report02 でも、One Euro Filter だけで全てを解決せず、wrist、elbow hint、torso、hand openness、gesture、final quaternion で適用方法を分ける方針が整理されています。

---

## 8. AvatarMotionProfile

VRoid Studio 系モデルでは、現実の人間と比べて頭が大きい、肩幅が狭い、腕が短い、袖や髪が大きい、といった差があります。これは推定精度ではなく、retarget 時の破綻要因です。したがって、VRM load 時に次を測定し、`AvatarMotionProfile` として保持します。

```ts
type AvatarMotionProfile = {
    shoulderWidth: number;
    upperArmLength: { left: number; right: number };
    lowerArmLength: { left: number; right: number };
    headSize: number;

    hasChest: boolean;
    hasUpperChest: boolean;
    hasShoulderBones: boolean;

    reachScale: number;
    depthCompression: number;
    elbowOutwardBias: number;
    shoulderDamping: number;
    wristRollInfluence: number;
    faceProximityPenalty: number;
};
```

初期キャリブレーションは T pose ではなく、正面自然姿勢 + 軽い A pose が適切です。report03 では、正面自然姿勢、腕を 20〜30° 開いた軽い A pose、両手を胸〜腰の高さで開く手順により、4〜6 秒程度で shoulder width、upper/lower arm length、head neutral、hand scale を取る手順が推奨されています。

---

## 9. 代替モデル・補助モデル比較

この調査では、技術性能より先に **ライセンス、再配布、モデル weight 条件、Web 実行性**を評価します。

| 候補                                         | ライセンス適合性                                          | モデル weight / 再配布                                                          | Web 実行                                                                  | 性能・精度                                       | 実装コスト | Sincromisor 判定                               |
| -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------ | ---------: | ---------------------------------------------- |
| MediaPipe Tasks Pose / Hand / Face / Gesture | Apache-2.0。最も扱いやすい                                | `.task` model をプロジェクト内配置可能。ただし配布時は model license 表示を確認 | Web JS / WASM 対応                                                        | 上半身、手、顔、gesture を一貫して扱える         |     低〜中 | **標準採用**                                   |
| MediaPipe Holistic / Holistic 相当構成       | MediaPipe 系。Apache-2.0 前提で扱いやすい                 | 公式 task / model の成熟度確認が必要                                            | Holistic Landmarker は 543 landmarks を扱う統合 task として案内されている | Pose + Face + Hands の統合思想が今回用途に合う   |         中 | **設計思想を採用。実装は個別 task 統合を優先** |
| MoveNet                                      | TensorFlow Hub / TF.js 系で Apache-2.0                    | 利用しやすい                                                                    | TF.js で Web 実行可能                                                     | 高速だが標準は 17 keypoints。手指・顔が不足      |         低 | **主方式には不採用。軽量 pose fallback 候補**  |
| TF.js BlazePose / pose-detection             | Apache-2.0 系                                             | 利用しやすい                                                                    | TF.js / MediaPipe runtime                                                 | 33 body keypoints。MediaPipe Pose と役割が重なる |         中 | **MediaPipe Tasks 不採用時の代替候補**         |
| RTMPose / MMPose                             | MMPose は Apache-2.0。個別 model / dataset 条件確認が必要 | weight ごとの確認が必要                                                         | 標準は PyTorch。ONNX 化 + onnxruntime-web は可能性あり                    | 高精度・高速モデルあり。WholeBody 系も候補       |         高 | **研究比較 / 将来候補。MVP では不採用**        |
| OpenPose                                     | 非商用研究目的中心。公開プロダクト組み込みに不適          | 商用利用は別ライセンスが必要                                                    | Web には重い。GPU 前提寄り                                                | body / hand / face は強力                        |         高 | **非採用候補。弱点理解の参考のみ**             |

MoveNet は高速ですが、標準的には 17 keypoints を返す pose estimator であり、VRM 上半身制御に必要な手指・顔・頭部姿勢情報を単独では満たしません。TensorFlow の `pose-detection` パッケージでも、PoseNet / MoveNet は 17 keypoints、BlazePose は 33 keypoints と整理されています。([TensorFlow][8])

MMPose / RTMPose は研究・サーバーサイドでは有力です。MMPose は Apache-2.0 の PyTorch toolbox で、body 2D、body 3D、face、hand、wholebody など広いモデルを扱えます。一方、Web ブラウザ組み込みでは model 変換、runtime、weight 条件、端末性能、worker / WASM / WebGPU 対応を個別に詰める必要があり、MediaPipe より初期実装コストが高くなります。([GitHub][9])

OpenPose は body / hand / face の総合推定としては有名ですが、公式 license は非商用の内部研究目的に制限される条項があり、公開プロダクトへ組み込む標準候補としては不適です。([GitHub][10])

---

## 10. Sincromisor で最初に実装すべき最小構成

### 10.1 Phase A: 記録・再生・可視化

最初に `pages/motionDebug` を拡張し、次を記録します。

```ts
type MotionDebugFrame = {
    timestampMs: number;
    video: {
        mediaTimeMs: number;
        presentedFrames: number;
        width: number;
        height: number;
    };

    raw: {
        pose?: unknown;
        hands?: unknown;
        face?: unknown;
        gesture?: unknown;
    };

    roi: RoiTransform[];
    reliability: ReliabilityMap;
    canonical: CanonicalUpperBodyState;
    temporalState: unknown;
    retargetFrame: unknown;
    finalBoneRotations: Record<string, [number, number, number, number]>;
};
```

完了条件は、ライブカメラなしで同一 debug log を replay し、同一 retarget 結果を再現できることです。これはロードマップでも Phase 1 として最優先に置かれています。

### 10.2 Phase B: `ReliabilityMap`

MediaPipe confidence をそのまま使わず、最低限次を合成します。

```text
presence / visibility
+ border proximity
+ bone length consistency
+ temporal innovation
+ body scale consistency
+ detection / tracking state
+ side consistency
```

依頼書でも、MediaPipe confidence だけでなく border proximity、bone length consistency、temporal innovation、segmentation consistency、body scale consistency、detection / tracking state を組み合わせることが調査項目として指定されています。

### 10.3 Phase C: `CanonicalUpperBodyState`

最初の canonical state は、以下だけでよいです。

```ts
type MinimalCanonicalUpperBodyState = {
    torsoRotation: THREE.Quaternion;
    headRotation: THREE.Quaternion;

    leftArm: {
        elevation: number;
        openness: number;
        forwardness: number;
        elbowFlexionHint: number;
        confidence: number;
    };

    rightArm: {
        elevation: number;
        openness: number;
        forwardness: number;
        elbowFlexionHint: number;
        confidence: number;
    };

    leftHand?: {
        palmRotation: THREE.Quaternion;
        openness: number;
        gesture?: string;
        confidence: number;
    };

    rightHand?: {
        palmRotation: THREE.Quaternion;
        openness: number;
        gesture?: string;
        confidence: number;
    };
};
```

この時点では、全指関節の 3D rotation を作る必要はありません。まず `open / half / closed`、finger curl、palm basis、gesture intent へ落とすのが安全です。roadmap でも Phase 8 で、指は全関節 3D rotation ではなく、まず `open / half / closed` と curl 系に落とす方針が示されています。

### 10.4 Phase D: Pose-seeded ROI

最初の実装順は次が現実的です。

```text
1. Pose full-frame
2. Hand full-frame
3. Hand result と Pose wrist の対応付け
4. Pose wrist から ROI を作り、Hand ROI pass を追加
5. ROI fail 時に full-frame Hand へ fallback
6. Face full-frame
7. Pose face ROI から Face ROI pass を追加
8. Gesture は hand reliability が高い場合だけ MotionIntent へ渡す
```

Pose-seeded ROI は最初から必須ではありませんが、手が小さい、速く動く、顔に近い、腕が交差するケースで dropout と左右入れ替えを減らす重要機能です。

---

## 11. 初期パラメータ案

| 項目                          |                      初期値案 | 備考                               |
| ----------------------------- | ----------------------------: | ---------------------------------- |
| Pose `numPoses`               |                             1 | `sincro` は 1 人入力前提           |
| Face `numFaces`               |                             1 | smoothing の都合上、まず 1 人      |
| border margin                 |                    0.05〜0.08 | normalized image coordinate        |
| hand min apparent size        |             画像短辺の 6〜10% | 下回ると hand reliability を下げる |
| temporal innovation threshold | shoulder width 正規化で部位別 | wrist は緩め、torso/head は厳しめ  |
| hand predicted duration       |                    200〜700ms | いきなり neutral に戻さない        |
| recovering duration           |                    200〜400ms | 再検出 snap 防止                   |
| wrist roll influence          |                      0.2〜0.5 | palm basis を過信しない            |
| arm depth compression         |                      0.5〜0.7 | 小柄 VRoid / 単眼 z 対策           |
| torso smoothing               |                          強め | 胴体 jitter は最も目立つ           |
| gesture minimum duration      |                    150〜300ms | gesture label flicker 防止         |

---

## 12. リスクと確認事項

1. **MediaPipe model asset の配布条件確認**
   MediaPipe 本体は Apache-2.0 ですが、実際に同梱する `.task` model については、配布時に model card / license 表示を確認するべきです。

2. **Worker 分離と model load 戦略**
   `detectForVideo()` 系が UI thread を block し得るため、Pose / Hand / Face / Gesture の同時実行は Worker 前提で設計するべきです。([Google for Developers][3])

3. **ROI 実装の座標変換ミス**
   crop padding、左右反転、回転 crop、normalized / pixel 座標の混在は、handedness 入れ替えや手首 jump の原因になります。ROI metadata を debug log に必ず残すべきです。

4. **代替モデルはすぐ置き換えに使わない**
   MoveNet は情報量不足、RTMPose / MMPose は Web 統合・weight 条件確認コストが高く、OpenPose はライセンス不適合です。初期実装では MediaPipe を主軸とし、代替モデルは評価基盤が整ってから replay log で比較するのが妥当です。

---

## 13. 最終提案

`Sincromisor` の `sincro` モードでは、次の方針で進めるのが最も堅実です。

1. **MediaPipe Tasks を標準採用する**
   Pose / Hand / Face / Gesture を個別 task として使い、自前で Holistic 的に統合する。

2. **landmark-to-bone を禁止する**
   直接 VRM bone rotation を作らず、`ReliabilityMap` → `CanonicalUpperBodyState` → `TemporalStateEstimator` → `AvatarMotionProfile` → `IK / FK / VRM pose` の順に変換する。

3. **Pose は全体、Hand / Face は ROI + fallback**
   Pose full-frame を基準に、wrist / face ROI を切る。ただし ROI 失敗時は full-frame、Pose-only、temporal prediction、comfortable pose へ段階的に fallback する。

4. **信頼度は部位別・状態付きで下流へ渡す**
   `Tracked / Suspect / Predicted / Lost / Recovering` を持ち、低信頼度の観測を即破棄せず、重み付きで時系列推定へ渡す。

5. **最初の成果物は motionDebug の record/replay/metrics**
   アルゴリズム調整より先に、同じ入力で同じ結果を再現できる基盤を作る。これにより、ROI 化、filter、IK、avatar profile の効果を定量比較できる。

この方針であれば、MediaPipe の Apache-2.0 という導入しやすさを維持しつつ、単眼カメラ由来の奥行き不確実性、肘方向の反転、手首 roll、遮蔽、左右入れ替えを `sincromisor-frontend` の既存構造へ段階的に吸収できます。

[1]: https://raw.githubusercontent.com/Sincromisor/Sincromisor/main/sincromisor-frontend/package.json "raw.githubusercontent.com"
[2]: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE?utm_source=chatgpt.com "Apache License 2.0 - google-ai-edge/mediapipe"
[3]: https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js "Pose landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[4]: https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer "Gesture recognition task guide  |  Google AI Edge  |  Google for Developers"
[5]: https://research.google/blog/mediapipe-holistic-simultaneous-face-hand-and-pose-prediction-on-device/?utm_source=chatgpt.com "MediaPipe Holistic — Simultaneous Face, Hand and Pose ..."
[6]: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js "Face landmark detection guide for Web  |  Google AI Edge  |  Google for Developers"
[7]: https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js "Hand landmarks detection guide for Web  |  Google AI Edge  |  Google for Developers"
[8]: https://www.tensorflow.org/hub/tutorials/movenet?utm_source=chatgpt.com "MoveNet: Ultra fast and accurate pose detection model."
[9]: https://github.com/open-mmlab/mmpose?utm_source=chatgpt.com "open-mmlab/mmpose: OpenMMLab Pose Estimation ..."
[10]: https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/LICENSE?utm_source=chatgpt.com "license - CMU-Perceptual-Computing-Lab/openpose"
