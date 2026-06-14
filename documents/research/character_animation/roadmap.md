# Sincro Character Animation Roadmap

## 目的

本書は、`sincro` モードで動作するキャラクターアニメーションを長期的にどう設計・実装するべきかを整理する。

短期的な既存実装の延長ではなく、単眼 Web カメラ、MediaPipe、VRM 1.0、Three.js という前提で、キャラクターとして自然で破綻しにくい上半身モーションを目指すための方針とロードマップを定める。

## 背景

調査報告は次を正本とする。

- [report01.md](report01.md): 上半身モーションキャプチャの実装方式
- [report02.md](report02.md): IK 以外の品質改善手法
- [report03.md](report03.md): 実装順序、破綻回避、パラメータ設計

3 つの報告書の結論は一貫している。

MediaPipe の landmark は骨格姿勢の正解値ではなく、不確実な観測値として扱うべきである。最良の構成は、landmark を直接 VRM bone へ流すものではなく、観測値を評価し、体幹基準の canonical state へ変換し、時系列で推定し、キャラクターらしい motion intent へ落としてから、IK / FK / animation clip を合成して VRM へ適用する構成である。

## スコープ

対象:

- `sincro` モードの上半身同期
- 頭部、体幹、肩、腕、手首、指
- MediaPipe Pose / Hand / Face / Gesture の使い方
- VRM 1.0 モデル差分と avatar profile
- debug、record、replay、metrics による評価基盤

非対象:

- `chat` モードの会話視線、AI speech gesture の詳細
- WebRTC payload / backend 契約
- 下半身の歩行、足接地、full-body IK
- オフライン高品質モーション生成を主目的にした ML pipeline

## 基本方針

### MediaPipe は観測入力として扱う

MediaPipe Pose / Hand / Face の出力は、単眼カメラ由来の推定値であり、奥行き、肘方向、手首 roll、左右同定、遮蔽に不確実性を持つ。

したがって、次の流れを原則とする。

```text
Camera frame
  -> MediaPipe observations
  -> Reliability map
  -> Body-local canonical state
  -> Temporal state estimation
  -> Motion intent / style
  -> Avatar profile mapping
  -> IK / FK / additive animation
  -> VRM normalized local rotations
```

避けるべき流れは次である。

```text
MediaPipe landmarks
  -> VRM bone rotations
```

### 最適化対象は人体忠実性ではなくキャラクターとしての自然さ

優先順位は次とする。

| 優先度 | 目的                           |
| -----: | ------------------------------ |
|      1 | 破綻しない                     |
|      2 | 安定している                   |
|      3 | キャラクターとして自然に見える |
|      4 | ユーザーの意図が伝わる         |
|      5 | 実人体の姿勢へ忠実             |

胴体・頭・肩は低振幅で安定を優先し、手・指・短い gesture は表現を強めてもよい。信頼度が低いときは動きを止めるのではなく、控えめで自然な pose へ退避する。

### IK は中核ではなく後段の姿勢適用器とする

腕には自前の 2-bone analytic IK を主方式として使う。ただし品質の大部分は IK の前後で決まる。

- IK 前段: reliability、canonicalization、calibration、temporal state
- IK 本体: reach clamp、elbow pole、soft limit、collision safety
- IK 後段: quaternion smoothing、style blending、avatar profile、semantic clip

IK 単体の高度化だけでは、肘反転、手首暴れ、肩崩れ、再検出ジャンプを根本的に解決できない。

### 既存実装は活かしつつ中間層を太らせる

現行実装には、次の良い足場がある。

- `features/gaze/trackingRuntime`: camera / video / Worker / fallback の所有境界
- `features/gaze/poseTracking`: PoseLandmarker 結果から内部 snapshot への変換
- `character/retargeting`: VRM 向け retarget frame の生成
- `character/ik`: normalized bone 向けの腕 IK solver
- `pages/motionDebug`: camera / tracker / VRM retarget の観測ページ

長期設計では、これらを破棄して `src/mocap` のような大きな別構成へ移すより、既存の責務境界を保ちながら、次の中間層を明示的に追加する。

- `FrameClock` / `CameraQuality`
- `ReliabilityMap`
- `CanonicalUpperBodyState`
- `TemporalStateEstimator`
- `MotionIntent`
- `AvatarMotionProfile`
- `MotionDebugRecorder` / `MotionReplayPlayer` / `MotionMetrics`

## 目標アーキテクチャ

```text
TrackerRuntime
  owns camera track / video element / frame clock / Worker fallback

PerceptionOrchestrator
  runs Pose full-frame
  derives Hand / Face ROI from Pose
  runs Hand / Face / Gesture as optional passes

ReliabilityEstimator
  combines presence / visibility / tracking confidence
  adds border risk / bone-length consistency / temporal innovation
  outputs per-joint and per-part reliability

Canonicalizer
  converts observations into body-local state
  estimates torso frame, arm features, head pose, hand features
  absorbs user calibration and camera framing

TemporalStateEstimator
  applies One Euro / Kalman / hysteresis
  handles Tracked / Suspect / Predicted / Lost / Recovering
  outputs stable canonical state

MotionIntentEstimator
  detects tracking / wave / pointing / nearFace / lost
  chooses semantic blend weights

AvatarMotionProfile
  stores VRM rest pose, proportions, optional bones, limits, style
  maps canonical state to avatar-local targets

Retarget / IK / Clip Mixer
  solves torso, head, shoulders, arms, wrists, fingers
  blends tracking pose and additive authored clips
  applies normalized local rotations to VRM
```

## ロードマップ

### Phase 1: 記録・再生・評価基盤

最初に作るべきものはアルゴリズム改善ではなく、再現可能な評価基盤である。

実装:

- `motion-debug` で MediaPipe snapshot、retarget frame、final pose、video metadata を保存する。
- 保存した debug log を同じ pipeline へ再入力できる replay mode を作る。
- neutral jitter、elbow flip count、recovery jump、angular velocity spike、reach clamp occupancy を計測する。
- 固定テストモーションを用意し、同じ入力でパラメータ差分を比較できるようにする。

完了条件:

- ライブカメラなしで、同一入力ログから同一 retarget 結果を再現できる。
- `motion-debug` で主要 metrics を確認できる。
- 調整前後の品質差を主観だけでなく数値で比較できる。

### Phase 2: FrameClock / CameraQuality

`requestAnimationFrame` 基準の推論 loop から、動画フレーム基準の clock へ移行する。

実装:

- `HTMLVideoElement.requestVideoFrameCallback()` を使い、`mediaTime`、`presentationTime`、`presentedFrames` を保持する。
- `MediaStreamTrack.getSettings()` を記録し、実解像度・実 fps・facing mode を debug snapshot に載せる。
- frame drop、border risk、torso in frame、hands in frame を camera quality として評価する。
- UX へ出す場合は、内部用語ではなくユーザーが直せるガイドへ変換する。

完了条件:

- Face / Pose / Hand / Gesture の timestamp が同一 video frame に紐付く。
- dropped frame と camera framing の問題を debug 上で切り分けられる。

### Phase 3: Reliability layer

MediaPipe confidence をそのまま使わず、制御用の信頼度を部位別に再定義する。

実装:

- `ReliabilityMap` を導入し、joint / part ごとの weight を出す。
- presence、visibility、tracking confidence、border proximity、bone-length consistency、temporal innovation を合成する。
- shoulder、elbow、wrist、head、hand、finger で別の reliability を持つ。
- IK weight、filter weight、semantic trigger、fallback 判定が同じ reliability を読むようにする。

完了条件:

- 悪い観測値を即破棄せず、低 weight として下流へ渡せる。
- 手が画面端、顔前、遮蔽、急ジャンプした場合に、部位別に動きが自然に弱まる。

### Phase 4: CanonicalUpperBodyState

MediaPipe 座標を直接 avatar target にせず、体幹基準の canonical state へ変換する。

実装:

- torso frame を `shoulderCenter`、`hipCenter`、Face matrix、前フレームから安定推定する。
- 腕を `elevation`、`openness`、`forwardness`、`elbowFlexionHint` へ落とす。
- head を Face matrix 主入力、Pose nose / ears / eyes を fallback として扱う。
- wrist は Pose wrist を位置の主入力、Hand palm basis を向きと指の補助入力にする。
- world landmarks の z は弱く使い、絶対 3D 座標として過信しない。

完了条件:

- `CanonicalUpperBodyState` を debug snapshot に表示できる。
- wrist absolute position ではなく、body-local な意味量で腕の動きを説明できる。

### Phase 5: Temporal state estimator

平滑化を単一の後処理ではなく、状態推定として設計する。

実装:

- 部位ごとに `Tracked`、`Suspect`、`Predicted`、`Lost`、`Recovering` を持つ。
- wrist target は One Euro + confidence-aware update を使う。
- dropout 中は constant velocity 予測を減衰させ、comfortable pose へ戻す。
- elbow pole は実測、前フレーム、fallback pole を状態に応じて blend する。
- final quaternion は log-space smoothing を使う。

完了条件:

- 手が 200-700ms 程度消えても腕が急に neutral へ落ちない。
- 再検出時の角度ジャンプを 10-15 度以下へ抑える。
- neutral 10 秒で胴体・頭・手首の jitter を計測できる。

### Phase 6: AvatarMotionProfile / calibration

VRM モデル差分とユーザー体型差を品質問題として扱う。

実装:

- VRM load 時に rest local rotation、bone length、shoulder width、head size、optional bones を計測する。
- `AvatarMotionProfile` に reach scale、depth compression、elbow outward bias、shoulder damping、wrist roll influence を持たせる。
- 初期 calibration は T pose ではなく、正面自然姿勢 + 軽い A pose を基本にする。
- online calibration は高信頼度・near-neutral 時だけ、肩幅や neutral yaw を低速更新する。

完了条件:

- 小柄 VRoid、頭が大きいモデル、upperChest なしモデルで同じ replay log を比較できる。
- profile 差分により、腕の伸び切り、顔めり込み、肩崩れを調整できる。

### Phase 7: Pose-seeded Hand / Face ROI

Pose を全体検出、Hand / Face を ROI 検出として扱う。

実装:

- Pose wrist から left / right hand crop を作る。
- Pose face region から FaceLandmarker ROI を作る。
- crop 座標を full-frame 座標へ戻し、body-local canonical state へ統合する。
- handedness は Hand の結果だけに依存せず、Pose wrist と時系列 ID で補正する。

完了条件:

- 手が小さい、速く動く、顔に近い、腕が交差するケースで dropout と左右入れ替えを減らせる。
- ROI 経路が失敗しても full-frame / Pose-only fallback へ落ちる。

### Phase 8: Hand / Gesture / Semantic motion

完全追従ではなく、ユーザーの動作意図が伝わるキャラクター motion として扱う。

実装:

- Hand Landmarker から palm basis、finger curl、finger splay、thumb oppose を推定する。
- 指は全関節 3D rotation ではなく、まず `open / half / closed` と curl 系へ落とす。
- Gesture Recognizer または自前判定で `Open_Palm`、`Closed_Fist`、`Pointing_Up`、`Thumb_Up`、`Victory` を扱う。
- `MotionIntent` を導入し、`tracking`、`wave`、`pointing`、`nearFace`、`lost` を判定する。
- Three.js `AnimationMixer` で短い上半身 additive clip を blend する。

完了条件:

- 手振り、指差し、サムズアップ、顔近くの手が、追従の揺れではなく意味ある motion として見える。
- gesture label のちらつきが hysteresis と minimum duration で抑えられる。

### Phase 9: Optional optimization / learned post-processing

ログと metrics が揃った後にだけ検討する。

候補:

- IK 初期解に対する数回の軽量 constrained optimization
- canonical state を補正する temporal MLP / TCN
- gesture sequence classifier
- anomaly detector

方針:

- 学習モデルの出力は VRM bone rotation ではなく canonical control にする。
- モデル差分や avatar profile を ML に背負わせない。
- まず rule-based pipeline の限界を replay log で確認する。

## 破綻回避の優先順位

最初に潰すべき破綻は次とする。

| 優先度 | 破綻                | 対応層                                   |
| -----: | ------------------- | ---------------------------------------- |
|      1 | 胴体・頭部の jitter | FrameClock、Reliability、Temporal        |
|      2 | 肘反転              | Canonical arm、Pole state、IK constraint |
|      3 | 肩崩れ / 肩めり込み | Avatar profile、shoulder / chest 分配    |
|      4 | 手首 roll 暴れ      | Hand reliability、wrist roll damping     |
|      5 | 腕の伸び切り        | reach scale、depth compression、clamp    |
|      6 | 指のちらつき        | curl state、hysteresis、semantic gesture |
|      7 | 左右入れ替え        | Pose-seeded ROI、side consistency        |
|      8 | 再検出時のジャンプ  | dropout state、recovery blending         |

## 現行設計文書への反映方針

本書は research roadmap であり、現在有効な設計正本ではない。

実装へ進むときは、次の設計文書を更新する。

- [../../design/frontend/character/tracking.md](../../design/frontend/character/tracking.md)
    - FrameClock、CameraQuality、Reliability、ROI、Worker orchestration
- [../../design/frontend/character/motion.md](../../design/frontend/character/motion.md)
    - CanonicalUpperBodyState、TemporalStateEstimator、MotionIntent、AvatarMotionProfile
- [../../design/frontend/character/overview.md](../../design/frontend/character/overview.md)
    - `sincro` mode の責務境界と最終アーキテクチャ

破壊的な責務変更や大きな設計判断を行う場合は、ADR を追加する。

## 実装判断の原則

- 生 landmark を controller / VRM 適用層へ漏らさない。
- debug で観測値、信頼度、canonical state、retarget frame、applied pose を分けて見えるようにする。
- 信頼度が低いときは突然止めず、振幅と blend weight を落とす。
- 大きい部位ほど安定、小さい部位ほど表現を許す。
- VRM モデル差分は例外ではなく profile と fallback で扱う。
- まず再現可能性、次に安定性、最後に表現力を上げる。
