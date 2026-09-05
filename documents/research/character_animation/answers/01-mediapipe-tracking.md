# 調査レポート: `sincromisor-frontend` における MediaPipe 追跡運用設計

作成日: **2026-06-14**
対象: **Sincromisor `sincro` モード / 単眼 Web カメラ / MediaPipe Pose・Hand・Face・Gesture / Three.js / VRM 1.0 / VRoid Studio 系モデル**

---

## 0. 要旨

結論として、`sincromisor-frontend` のキャラクターアニメーション実装では、**MediaPipe を主推定系として継続採用するのが妥当**です。ただし、MediaPipe の特徴点を VRM ボーンへ直接流し込む設計は避け、添付依頼書が示す通り、`ReliabilityMap`、身体のローカル座標系での標準状態、時系列状態推定、動作意図、アバタープロファイルを介して VRM 姿勢へ変換するべきです。依頼書の主眼も、MediaPipe 出力を「骨格姿勢」ではなく「不確実性を持つ観測値」として扱うことにあります。

現在の `sincromisor-frontend` は、この方針に沿って拡張しやすい構造をすでに持っています。`package.json` には `@mediapipe/tasks-vision`、`@pixiv/three-vrm`、`three`、`onnxruntime-web` が含まれており、`src/features/gaze`、`src/character/ik`、`src/character/retargeting`、`src/pages/motionDebug` も存在します。したがって、新規に巨大な `mocap` 層を作り直すより、既存の `trackingRuntime`、`poseTracking`、`retargeting`、`ik`、`motionDebug` を活かし、その間に信頼度・正規化・時系列推定の層を追加するのが安全です。([GitHub][1])

推奨する最小構成は次です。

```text
カメラフレーム
  -> FrameClock / CameraQuality
  -> Pose 全画面の
  -> Hand / Face ROI または全画面の代替処理
  -> MediaPipe 観測値
  -> ReliabilityMap
  -> CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntent
  -> AvatarMotionProfile
  -> 動作の変換 / IK / 加算クリップ
  -> VRM 正規化済みのローカル回転
```

この構成は、既存ロードマップが示す目標アーキテクチャとも整合します。特に `ReliabilityEstimator`、`Canonicalizer`、`TemporalStateEstimator`、`MotionIntentEstimator`、`AvatarMotionProfile` を既存責務境界へ追加する方針が明示されています。

---

## 1. 現行 `sincromisor-frontend` との整合性

### 1.1 現行構成で活かすべき部分

GitHub 上の `sincromisor-frontend` には、少なくとも次の実装上の足場があります。

| 領域                   | 現行上の対応箇所                | 今回追加すべき責務                                                |
| ---------------------- | ------------------------------- | ----------------------------------------------------------------- |
| カメラ・推論ランタイム | `features/gaze/trackingRuntime` | `FrameClock`、Worker 実行、MediaPipe 複数段階の推論処理の組み立て |
| MediaPipe 姿勢入力     | `features/gaze/poseTracking`    | Pose スナップショットから `ReliabilityMap` と標準状態への変換     |
| VRM 向け変換           | `character/retargeting`         | 標準状態 → 正規化済み VRM 人型骨格姿勢                            |
| 腕 IK                  | `character/ik`                  | 信頼度を考慮した目標、肘の曲がる方向代替処理、到達距離制限        |
| デバッグ               | `pages/motionDebug`             | 未加工の観測値、信頼性、標準化した、時系列、最終姿勢の記録・再生  |

ロードマップでも、現行実装には `trackingRuntime`、`poseTracking`、`retargeting`、`ik`、`motionDebug` という良い責務境界があるため、それらを破棄せず中間層を太らせる方針が示されています。

### 1.2 最初に作るべきもの

最初に追加すべきものは、高度な IK ではなく **記録・再生・信頼度・時系列状態**です。既存 report03 でも、品質差が最初に出る領域は「信頼度評価」と「時系列処理」であり、実装順は `記録/再生/デバッグ` → `最小キャリブレーション` → `信頼度評価` → `時系列処理` → `基本 IK / retarget` とされています。

---

## 2. MediaPipe 採用判断

### 2.1 採用理由

MediaPipe を標準候補とする判断は妥当です。MediaPipe は Apache-2.0 ライセンスで公開されており、ブラウザ向けには `@mediapipe/tasks-vision` として Pose / Hand / Face / Gesture 系のタスクが提供されています。Pose Landmarker は 33 個の姿勢特徴点とワールド座標の特徴点、Hand Landmarker は手の特徴点 / ワールド座標の特徴点 / 左右判定、Face Landmarker は顔の特徴点と顔の変換行列、Gesture Recognizer はジェスチャー分類 / 左右判定 / 手の特徴点を返せます。([GitHub][2])

ただし、MediaPipe の `detectForVideo()` / `recognizeForVideo()` 系 API は同期実行で UIスレッドを停止し得るため、実運用では Web Worker 分離を前提にした方がよいです。これはパフォーマンスだけでなく、フレーム時刻の揺れや描画落ちによる動作細かな揺れを避ける意味でも重要です。([Google for Developers][3])

### 2.2 MediaPipe は「正解姿勢」ではなく「観測値」

Pose Landmarker の正規化済み特徴点では `x` と `y` が画像内正規化座標、`z` が腰中点を原点とする相対的な奥行きで、値が小さいほどカメラに近いと説明されています。またワールド座標の特徴点はメートル単位で腰中点を原点とします。しかし単眼推定である以上、奥行き、肘方向、手首ロール、遮蔽、左右同定は不安定化しやすく、VRM の絶対姿勢としては扱うべきではありません。([Google for Developers][3])

既存 report01 も、最良方針は MediaPipe 特徴点を直接 VRM ボーンに流す方式ではなく、観測値として扱い、制約付きキャラクターモーションソルバへ渡す方式だと整理しています。

---

## 3. MediaPipe 出力ごとの信頼度設計

### 3.1 信頼度設計表

| 出力                           | 信用できる条件                                                                          | 信用しない条件                                                                           | 主な用途                                             | 信頼度補助指標                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| Pose 2D 特徴点                 | 肩・腰・肘・手首が画面内に入り、存在確率 / 可視性が高く、骨長と時系列変化が安定している | 画面端、遮蔽、腕交差、手首だけ飛ぶ、複数人混入、低解像度、動体ぶれ                       | 体幹の座標系、肩線、腕の上下・左右、2D 手首目標      | `presence`、`visibility`、画面端への近さ、領域分割、時系列予測と観測の差 |
| Pose ワールド座標の特徴点      | 2D 特徴点も安定し、肩幅・上腕長・前腕長の比率が大きく崩れていない                       | 絶対奥行き、手先 z の急変、腕を前に出した時の深度過信、体幹スケールの急変                | 身体のローカル座標系の方向、腕仰角、前出し具合の補助 | 骨長の整合性、身体寸法の倍率整合性、z 圧縮                               |
| Pose `visibility` / `presence` | 部位別信頼性の基礎値として使う                                                          | これだけで採否を決める、低可視性でも時系列的に自然な観測を即捨てる                       | 基準信頼性                                           | 他指標との合成必須                                                       |
| Hand 画像座標の特徴点          | 手が十分大きく、切り出し内に収まり、追跡が安定し、指同士の構造が自然                    | 手が小さい、顔前で隠れる、画面端、片手がもう片手を隠す、手首位置が Pose 手首と大きく乖離 | 手のひらの基底、指の曲げ、指指の開き、親指の対向動作 | 手大きさ、ROI 整合性、手のひら幾何計算、時系列予測と観測の差             |
| Hand ワールド座標の特徴点      | 指の相対形状・手のひら向きの補助として使える                                            | 手首の絶対 3D 位置、腕 IK の主目標として使う                                             | 手首ロール補助、手のひらの法線                       | Pose 手首との整合、手倍率整合性                                          |
| Hand 左右判定                  | Pose 手首と近く、時系列 ID と一致し、左右の手が離れている                               | 腕交差、両手接近、顔前、鏡像変換の扱いが曖昧、片手一時欠損後の再検出                     | 左右割当の観測値                                     | Pose 手首距離、前フレーム予測、ヒステリシス                              |
| Face 特徴点                    | 顔が十分大きく、正面〜軽い横向き、手や髪で隠れていない                                  | 顔が小さい、横向きが強い、手が顔前、複数人、表情用途で過信                               | 頭部代替処理、顔 ROI 品質                            | 顔外接矩形、特徴点開き、存在確率、時系列                                 |
| Face 変換行列                  | `numFaces = 1` で追跡が安定し、中立姿勢補正量が取れている                               | 顔が一時消失、急旋回、手の遮蔽、行列が前フレームから急変                                 | 頭部向き主入力                                       | 角度の予測と観測の差、Face/Pose 整合、低域通過                           |
| Gesture 表示名 / 信頼度        | 手特徴点信頼性が高く、同じジェスチャーが一定時間継続                                    | 1〜2 フレームの急増、手信頼性低、信頼度低、ジェスチャーと指状態が矛盾                    | 意味に基づく動作動作発火条件                         | 信頼度、最小継続時間、短時間の変化の抑制、ヒステリシス                   |

Gesture Recognizer の標準カテゴリには `Closed_Fist`、`Open_Palm`、`Pointing_Up`、`Thumb_Up`、`Victory` などが含まれますが、手が検出されても既知ジェスチャーに該当しない場合は `"None"`、手が検出されない場合は空結果になり得ます。したがってジェスチャー表示名は、フレーム単位の骨制御ではなく、`MotionIntent` の補助入力として扱うべきです。([Google for Developers][4])

### 3.2 基本方針

`finalWeight` は単一の MediaPipe 信頼度ではなく、複数指標の合成値にします。

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

ただし、`finalWeight < threshold` で即座に捨てるのではなく、下流の `TemporalStateEstimator` へ低重みの観測として渡す方が安定します。取り組み計画でも、部位ごとに `Tracked`、`Suspect`、`Predicted`、`Lost`、`Recovering` を持ち、一時欠損中は予測しながら無理のない自然姿勢へ戻す設計が示されています。

---

## 4. 追加信頼度指標の評価

| 指標                 | 優先度 | 計算方法                                                                            | 有効な不具合                                        | 誤判定しやすい条件                             |
| -------------------- | -----: | ----------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| 画面端への近さ       |     高 | 特徴点または ROI 外接矩形から画像端までの正規化距離を sigmoid / smoothstep で重み化 | 画面端の手・肘・顔の誤検出、切り出し欠け            | ユーザーが意図的に画面端へ手を出す             |
| 骨長の整合性         |     高 | 肩幅、上腕長、前腕長、胴体長を較正 / EMA と比較し、ログ比率で減点                   | 手首急変、肘反転、奥行き破綻                        | 2D だけで見ると前後方向動作を誤って短縮と判定  |
| 時系列予測と観測の差 |     高 | 予測値と観測値の差を身体寸法の倍率と `dt` で正規化                                  | 急な飛び、再検出急変、左右入替                      | 本当に速い動作。速度上限を部位別にする必要あり |
| 領域分割整合性       |     中 | Pose 領域分割マスク周辺を間引き記録し、特徴点 / 四肢が人体領域にあるかを見る        | 背景誤検出、肩・腕の欠落、顔前の手                  | 領域分割自体が崩れる、服・髪・背景類似色       |
| 身体寸法の倍率整合性 |     高 | 肩幅、体幹高さ、頭部大きさ、手大きさの短期/長期比率を比較                           | カメラ距離変化、ROI 倍率不一致、ワールド座標 z 破綻 | ユーザーが意図的に前後移動                     |
| 検出 / 追跡状態      |     高 | MediaPipe の検出 / 存在確率 / 追跡閾値とアプリ側状態機械を合成                      | 手のひら検出器再実行直後の急変、追跡消失            | 閾値が高すぎると動きが鈍る                     |
| 左右整合性           |     高 | Pose 手首、Hand 左右判定、前フレームトラック ID、手のひらの基底の連続性で左右割当   | 左右入替、腕交差、両手接近                          | 鏡像表示と内部座標の符号設計ミス               |
| ROI 整合性           |     中 | ROI 経路と全画面の経路の特徴点 / 外接矩形差分を見る                                 | 切り出し座標変換ミス、ROI の取り違え                | 全画面の側も不安定な場合                       |

Pose 領域分割マスクは、公式に Pose Landmarker の出力として利用可能であり、`outputSegmentationMasks` オプションで有効化できます。描画用ではなく、特徴点が人体領域と整合しているかを見る品質指標として使うのが適切です。([Google for Developers][3])

---

## 5. Pose 起点 Hand / Face ROI 化

### 5.1 推奨構成

MediaPipe Holistic の設計思想では、姿勢を毎フレーム推定し、その結果から顔 / 手の ROI 事前情報を作ることで、速い動きへの追従性と左右一貫性を高めます。Google Research の解説でも、姿勢予測を ROI 事前情報として使うことが、左手と右手の取り違えや体部位の混同を抑えると説明されています。([Google Research][5])

`Sincromisor` では、Holistic をそのまま使うより、次のような自前処理の組み立てが扱いやすいです。

```text
1. Pose Landmarker を全画面で実行
2. 左・右手首と顔領域から ROI を作る
3. Hand Landmarker を左手・右手の切り出し画像で実行
4. Face Landmarker を顔切り出しで実行
5. 切り出し座標を全画面の座標へ戻す
6. Pose 手首 / Face 変換 / Hand 手のひらの基底を ReliabilityMap へ統合
7. 身体のローカル座標系での標準状態へ変換
```

既存 report01 も、Pose / Hand / Face を分離して使い、自前の Holistic 的統合層を持つ方針を推奨しています。役割分担は「腕の位置は Pose、手首の向きと指は Hand、頭部姿勢は Face」です。

### 5.2 ROI 化すべき条件

| 条件                          | ROI 化の効果                                              |
| ----------------------------- | --------------------------------------------------------- |
| 手が小さく写る                | 全画面の Hand より手領域の解像度を確保しやすい            |
| 手が速く動く                  | Pose 手首から探索範囲を限定し、再検出を早めやすい         |
| 手が顔の近くにある            | 顔と手の混同を減らし、nearFace 状態を検出しやすい         |
| 腕が交差する                  | Pose 手首と時系列 ID を使い、左・右割り当てを維持しやすい |
| Hand 追跡が頻繁に一時欠損する | ROI 代替処理によって再検出の探索範囲を狭められる          |
| 小柄 VRoid で手先表現が重要   | 指曲げ / 手のひらの基底の安定性が見た目に効く             |

取り組み計画でも段階 7 として Pose 手首から手切り出し、Pose 顔領域から FaceLandmarker ROI を作り、切り出し座標を全画面の / 身体のローカル座標系のへ戻し、左右判定を Hand の結果だけに依存しない構成が示されています。

### 5.3 ROI 化しなくてよい条件

| 条件                                 | 方針                                                        |
| ------------------------------------ | ----------------------------------------------------------- |
| 手が十分大きく、全画面の Hand が安定 | 全画面のままでもよい                                        |
| CPU / WASM 負荷が厳しい              | Pose 全画面の + Hand 全画面のを低頻度、ROI は必要時のみ     |
| 初期デバッグ段階                     | 全画面のと ROI の両方を記録し、比較可能にする               |
| Face が常に大きく安定                | Face 全画面のままでもよい。ただし頭部行列の信頼度評価は必要 |

### 5.4 切り出し座標を全画面の座標へ戻す注意点

ROI 経路の最重要点は、**切り出し内特徴点をそのまま身体のローカル座標系の状態に入れない**ことです。必ず次の変換を明示します。

```text
切り出し正規化済み座標
  -> 切り出し画素座標
  -> 全画面の画素座標
  -> 全画面の正規化座標
  -> カメラ・身体のローカル座標
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

特に注意すべき点は、左右反転表示と内部座標の分離、切り出し余白による倍率変化、回転切り出しを使う場合の逆変換、ROI 内ワールド座標の特徴点の扱いです。Hand ワールド座標の特徴点は切り出し局所の形状理解には有用ですが、Pose ワールド座標の特徴点と同じ絶対座標系として合成してはいけません。

### 5.5 左右判定補正

Hand Landmarker の左右判定はそのまま最終判断にせず、次の割り当てスコアで左右を決めます。

```ts
assignmentCost =
    wPoseDistance * distance(handWristFullFrame, poseWrist) +
    wTemporal * distance(handWristFullFrame, predictedTrackWrist) +
    wHandedness * handednessPenalty +
    wPalm * palmBasisDiscontinuity +
    wRoi * roiMismatchPenalty;
```

左右入替は、単一フレームで切り替えず、`N` フレームまたは `M` ms 継続した場合のみ確定します。腕交差中は `sideConsistencyWeight` を下げ、動作算出処理側では前フレーム肘の曲がる方向と代替処理曲がる方向を強めます。

### 5.6 代替処理

```text
Hand ROI 成功
  -> ROIの手の特徴点を使う

Hand ROIの失敗
  -> 全画面の Hand 代替処理

全画面Handの失敗
  -> Pose 手首 + Pose 肘のみ

Pose 手首不安定
  -> 時系列予測値手首

長時間の観測欠落
  -> 無理のない手の姿勢・指の中立姿勢
```

Face も同様に、

```text
Face ROI 成功
  -> Face 変換行列

Face ROIの失敗
  -> 全画面の Face 代替処理

Faceの失敗
  -> Pose 鼻 / 耳 / 目代替処理

Pose 頭部代替処理不安定
  -> 前フレームの頭部姿勢回転 -> 中立姿勢
```

Face Landmarker の変換行列は頭部向きの主入力として有用ですが、`numFaces = 1` のときだけ平滑化が適用される設定があるため、`sincro` モードでは原則 1 人入力として扱うのが適切です。([Google for Developers][6])

---

## 6. 推奨実行構成

### 6.1 PerceptionOrchestrator

```text
FrameClock
  - requestVideoFrameCallbackを基準とする時刻
  - presentedFrames / 欠落フレーム追跡

Pose 推論処理
  - 全画面の
  - 映像の各フレーム、または目標fpsで実行
  - 領域分割マスクは任意だが、デバッグ・信頼性評価では推奨

Hand 推論処理
  - Poseの手首から求めたROIで推論
  - 全画面の代替処理
  - 追跡状態はアプリで管理する

Face 推論処理
  - Poseの顔領域から求めたROIで推論
  - 全画面の代替処理
  - outputFacialTransformationMatrixes 有効

Gesture 推論処理
  - 手の信頼性が十分な場合だけ実行する
  - 低頻度で実行してよい
  - 出力はMotionIntentに使い、ボーンを直接制御しない
```

Hand Landmarker は `minHandDetectionConfidence`、`minHandPresenceConfidence`、`minTrackingConfidence` を持ち、映像モードでは存在確率が閾値を下回ると手のひら検出を再実行し、追跡が成功している場合は検出を省略する設計です。したがって、アプリ側でも `DetectedStable`、`DetectedUnstable`、`Predicted`、`Recovering`、`Lost` のような状態機械を持つべきです。([Google for Developers][7])

### 6.2 CanonicalUpperBodyState

MediaPipe 座標を直接 VRM 目標にせず、体幹基準の意味量へ変換します。

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

単眼カメラでは奥行きが不安定なため、`forwardness` は Pose ワールド座標 z 単独で決めず、手の見かけサイズ、腕の 2D 短縮、肘・手首の相対位置、時系列連続性を混ぜます。小柄 VRoid や頭が大きいキャラクターでは、奥行き方向を圧縮する `armDepthCompression` を `AvatarMotionProfile` に持たせるのが有効です。

---

## 7. TemporalStateEstimator

### 7.1 平滑化ではなく状態推定として扱う

単純に特徴点座標へ低域通過フィルタをかけるだけでは、肘反転、手首ロール暴れ、再検出急変は十分に抑えられません。推奨は、部位ごとに状態を持つことです。

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
| `Predicted`  | 等速度を減衰させながら予測                     |
| `Lost`       | 無理のない自然姿勢 / 中立姿勢へゆっくり戻す    |
| `Recovering` | 再検出値へ即スナップせず 200〜400ms 程度で復帰 |

取り組み計画では、手が 200〜700ms 程度消えても腕が急に中立姿勢へ落ちないこと、再検出時の角度ジャンプを 10〜15 度以下へ抑えることが完了条件として示されています。

### 7.2 フィルタの使い分け

| 対象               | 推奨                                                             |
| ------------------ | ---------------------------------------------------------------- |
| 手首目標           | One Euro Filter + 信頼度を考慮した更新                           |
| 肘の曲がる方向     | 外れ値の除外 + 前フレームの値曲がる方向 + 代替処理曲がる方向合成 |
| 体幹               | 強めの低域通過。低振幅・低周波                                   |
| 頭部               | Face 行列 + 中立姿勢補正量 + 角度の低域通過                      |
| 手首ロール         | Hand 手のひらの基底を弱く反映。急変は抑制                        |
| 指の曲げ           | One Euro + ヒステリシス                                          |
| ジェスチャー状態   | 短時間の変化の抑制 + 最小継続時間                                |
| 最終クォータニオン | 対数空間での平滑化                                               |

report02 でも、One Euro Filter だけで全てを解決せず、手首、肘手掛かり、体幹、手開き具合、ジェスチャー、最終クォータニオンで適用方法を分ける方針が整理されています。

---

## 8. AvatarMotionProfile

VRoid Studio 系モデルでは、現実の人間と比べて頭が大きい、肩幅が狭い、腕が短い、袖や髪が大きい、といった差があります。これは推定精度ではなく、動作の変換時の破綻要因です。したがって、VRM 読み込み時に次を測定し、`AvatarMotionProfile` として保持します。

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

初期キャリブレーションは T 姿勢ではなく、正面自然姿勢 + 軽い A 姿勢が適切です。report03 では、正面自然姿勢、腕を 20〜30° 開いた軽い A 姿勢、両手を胸〜腰の高さで開く手順により、4〜6 秒程度で肩幅、上腕・前腕長さ、頭部中立姿勢、手倍率を取る手順が推奨されています。

---

## 9. 代替モデル・補助モデル比較

この調査では、技術性能より先に **ライセンス、再配布、モデル重み条件、Web 実行性**を評価します。

| 候補                                         | ライセンス適合性                                              | モデル重み / 再配布                                                              | Web 実行                                                              | 性能・精度                                     | 実装コスト | Sincromisor 判定                               |
| -------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------- | ---------: | ---------------------------------------------- |
| MediaPipe Tasks Pose / Hand / Face / Gesture | Apache-2.0。最も扱いやすい                                    | `.task` モデルをプロジェクト内配置可能。ただし配布時はモデルライセンス表示を確認 | Web JS / WASM 対応                                                    | 上半身、手、顔、ジェスチャーを一貫して扱える   |     低〜中 | **標準採用**                                   |
| MediaPipe Holistic / Holistic 相当構成       | MediaPipe 系。Apache-2.0 前提で扱いやすい                     | 公式タスク / モデルの成熟度確認が必要                                            | Holistic Landmarker は 543 特徴点を扱う統合タスクとして案内されている | Pose + Face + Hands の統合思想が今回用途に合う |         中 | **設計思想を採用。実装は個別タスク統合を優先** |
| MoveNet                                      | TensorFlow Hub / TF.js 系で Apache-2.0                        | 利用しやすい                                                                     | TF.js で Web 実行可能                                                 | 高速だが標準は 17 特徴点。手指・顔が不足       |         低 | **主方式には不採用。軽量姿勢代替処理候補**     |
| TF.js BlazePose / pose-detection             | Apache-2.0 系                                                 | 利用しやすい                                                                     | TF.js / MediaPipe 実行時                                              | 33 身体特徴点。MediaPipe Pose と役割が重なる   |         中 | **MediaPipe Tasks 不採用時の代替候補**         |
| RTMPose / MMPose                             | MMPose は Apache-2.0。個別モデル / データセット条件確認が必要 | 重みごとの確認が必要                                                             | 標準は PyTorch。ONNX 化 + onnxruntime-web は可能性あり                | 高精度・高速モデルあり。WholeBody 系も候補     |         高 | **研究比較 / 将来候補。MVP では不採用**        |
| OpenPose                                     | 非商用研究目的中心。公開プロダクト組み込みに不適              | 商用利用は別ライセンスが必要                                                     | Web には重い。GPU 前提寄り                                            | 身体 / 手 / 顔は強力                           |         高 | **非採用候補。弱点理解の参考のみ**             |

MoveNet は高速ですが、標準的には 17 特徴点を返す姿勢推定処理であり、VRM 上半身制御に必要な手指・顔・頭部姿勢情報を単独では満たしません。TensorFlow の `pose-detection` パッケージでも、PoseNet / MoveNet は 17 特徴点、BlazePose は 33 特徴点と整理されています。([TensorFlow][8])

MMPose / RTMPose は研究・サーバーサイドでは有力です。MMPose は Apache-2.0 の PyTorch ツール集で、身体 2D、身体 3D、顔、手、全身など広いモデルを扱えます。一方、Web ブラウザ組み込みではモデル変換、実行時、重み条件、端末性能、処理担当 / WASM / WebGPU 対応を個別に詰める必要があり、MediaPipe より初期実装コストが高くなります。([GitHub][9])

OpenPose は身体 / 手 / 顔の総合推定としては有名ですが、公式ライセンスは非商用の内部研究目的に制限される条項があり、公開プロダクトへ組み込む標準候補としては不適です。([GitHub][10])

---

## 10. Sincromisor で最初に実装すべき最小構成

### 10.1 段階 A: 記録・再生・可視化

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

完了条件は、ライブカメラなしで同一デバッグログを再生し、同一動作の変換結果を再現できることです。これはロードマップでも段階 1 として最優先に置かれています。

### 10.2 段階 B: `ReliabilityMap`

MediaPipe 信頼度をそのまま使わず、最低限次を合成します。

```text
存在確率 / 可視性
+ 画面端への近さ
+ 骨長の整合性
+ 時系列予測と観測の差
+ 身体寸法の倍率整合性
+ 検出 / 追跡状態
+ 左右整合性
```

依頼書でも、MediaPipe 信頼度だけでなく画面端への近さ、骨長の整合性、時系列予測と観測の差、領域分割整合性、身体寸法の倍率整合性、検出 / 追跡状態を組み合わせることが調査項目として指定されています。

### 10.3 段階 C: `CanonicalUpperBodyState`

最初の標準状態は、以下だけでよいです。

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

この時点では、全指関節の 3D 回転を作る必要はありません。まず `open / half / closed`、指の曲げ、手のひらの基底、ジェスチャー動作意図へ落とすのが安全です。取り組み計画でも段階 8 で、指は全関節 3D 回転ではなく、まず `open / half / closed` と曲げ系に落とす方針が示されています。

### 10.4 段階 D: Poseを手がかりにした ROI

最初の実装順は次が現実的です。

```text
1. Pose 全画面の
2. Hand 全画面の
3. Hand 結果と Pose 手首の対応付け
4. Pose 手首から ROI を作り、Hand ROI 推論処理を追加
5. ROI失敗時に全画面のHandへ切り替える
6. Face 全画面の
7. Pose 顔 ROI から Face ROI 推論処理を追加
8. Gesture は手信頼性が高い場合だけ MotionIntent へ渡す
```

Poseを手がかりにした ROI は最初から必須ではありませんが、手が小さい、速く動く、顔に近い、腕が交差するケースで一時欠損と左右入れ替えを減らす重要機能です。

---

## 11. 初期パラメータ案

| 項目                         |           初期値案 | 備考                           |
| ---------------------------- | -----------------: | ------------------------------ |
| Pose `numPoses`              |                  1 | `sincro` は 1 人入力前提       |
| Face `numFaces`              |                  1 | 平滑化の都合上、まず 1 人      |
| 画面端余白                   |         0.05〜0.08 | 正規化済み画像座標             |
| 手最小見かけの大きさ         |  画像短辺の 6〜10% | 下回ると手信頼性を下げる       |
| 時系列予測と観測の差しきい値 | 肩幅正規化で部位別 | 手首は緩め、胴体・頭部は厳しめ |
| 手予測値継続時間             |         200〜700ms | いきなり中立姿勢に戻さない     |
| 復帰中継続時間               |         200〜400ms | 再検出急変防止                 |
| 手首ロール反映率             |           0.2〜0.5 | 手のひらの基底を過信しない     |
| 腕奥行き圧縮                 |           0.5〜0.7 | 小柄 VRoid / 単眼 z 対策       |
| 体幹平滑化                   |               強め | 胴体細かな揺れは最も目立つ     |
| ジェスチャー最小継続時間     |         150〜300ms | ジェスチャー表示名ちらつき防止 |

---

## 12. リスクと確認事項

1. **MediaPipe モデル資材の配布条件確認**
   MediaPipe 本体は Apache-2.0 ですが、実際に同梱する `.task` モデルについては、配布時にモデルカード / ライセンス表示を確認するべきです。

2. **Worker 分離とモデル読み込み戦略**
   `detectForVideo()` 系が UIスレッドを停止し得るため、Pose / Hand / Face / Gesture の同時実行は Worker 前提で設計するべきです。([Google for Developers][3])

3. **ROI 実装の座標変換ミス**
   切り出し余白、左右反転、回転切り出し、正規化済み / 画素座標の混在は、左右判定入れ替えや手首急変の原因になります。ROI メタデータをデバッグログに必ず残すべきです。

4. **代替モデルはすぐ置き換えに使わない**
   MoveNet は情報量不足、RTMPose / MMPose は Web 統合・重み条件確認コストが高く、OpenPose はライセンス不適合です。初期実装では MediaPipe を主軸とし、代替モデルは評価基盤が整ってから再生ログで比較するのが妥当です。

---

## 13. 最終提案

`Sincromisor` の `sincro` モードでは、次の方針で進めるのが最も堅実です。

1. **MediaPipe Tasks を標準採用する**
   Pose / Hand / Face / Gesture を個別タスクとして使い、自前で Holistic 的に統合する。

2. **特徴点からボーンへのを禁止する**
   直接 VRM ボーンの回転を作らず、`ReliabilityMap` → `CanonicalUpperBodyState` → `TemporalStateEstimator` → `AvatarMotionProfile` → `IK / FK / VRM pose` の順に変換する。

3. **Pose は全体、Hand / Face は ROI + 代替処理**
   Pose 全画面のを基準に、手首 / 顔 ROI を切る。ただし ROI 失敗時は全画面の、Poseのみ、時系列予測、無理のない自然姿勢へ段階的に代替処理する。

4. **信頼度は部位別・状態付きで下流へ渡す**
   `Tracked / Suspect / Predicted / Lost / Recovering` を持ち、低信頼度の観測を即破棄せず、重み付きで時系列推定へ渡す。

5. **最初の成果物は motionDebug の記録・再生・評価指標**
   アルゴリズム調整より先に、同じ入力で同じ結果を再現できる基盤を作る。これにより、ROI 化、フィルタ、IK、アバターの調整情報の効果を定量比較できる。

この方針であれば、MediaPipe の Apache-2.0 という導入しやすさを維持しつつ、単眼カメラ由来の奥行き不確実性、肘方向の反転、手首ロール、遮蔽、左右入れ替えを `sincromisor-frontend` の既存構造へ段階的に吸収できます。

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
