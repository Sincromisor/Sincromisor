# Sincro キャラクターアニメーションのロードマップ

## 目的

本書は、`sincro` モードで動作するキャラクターアニメーションを長期的にどう設計・実装するべきかを整理する。

短期的な既存実装の延長ではなく、単眼 Web カメラ、MediaPipe、VRM 1.0、Three.js、three-vrm という前提で、キャラクターとして自然で破綻しにくい上半身モーションを目指すための方針とロードマップを定める。

この版では、初期調査レポートに加えて `requests/` で依頼した分野別調査と `answers/` の回答、ならびに 2026-07-06 時点のソースコード調査を反映し、層間契約と現在の残差を整理する。詳細フェーズは設計判断の背景であり、達成済み項目を再検証するための実行チェックリストではない。

## 調査資料

調査報告は次を正本とする。

- [report01.md](report01.md): 上半身モーションキャプチャの実装方式
- [report02.md](report02.md): IK 以外の品質改善手法
- [report03.md](report03.md): 実装順序、破綻回避、パラメータ設計
- [report04-three-vrm.md](report04-three-vrm.md): three-vrm による VRM-1.0 キャラクターアニメーション実装ベストプラクティス

追加調査は次を参照する。

- [requests/README.md](requests/README.md): 分野別調査依頼の一覧と優先関係
- [answers/01-mediapipe-tracking.md](answers/01-mediapipe-tracking.md): MediaPipe 追跡 / 信頼性 / ROI
- [answers/02-motion-solver-ik.md](answers/02-motion-solver-ik.md): 動作ソルバー / IK / 関節制約
- [answers/03-temporal-filtering.md](answers/03-temporal-filtering.md): 時系列推定 / 一時欠損 / 遅延
- [answers/04-character-motion-design.md](answers/04-character-motion-design.md): ものまねらしさ / 意味に基づく動作動作
- [answers/05-vrm-three-vrm.md](answers/05-vrm-three-vrm.md): VRM / three-vrm / AvatarMotionProfile
- [answers/06-web-realtime-performance.md](answers/06-web-realtime-performance.md): Web リアルタイム / Worker / 処理時間の予算
- [answers/07-evaluation-debug-qa.md](answers/07-evaluation-debug-qa.md): 評価基盤 / デバッグ / QA
- [answers/08-calibration-ux.md](answers/08-calibration-ux.md): 較正 / UX 案内
- [answers/09-canonical-upper-body-state.md](answers/09-canonical-upper-body-state.md): CanonicalUpperBodyState / 座標系

追加調査の結論は一貫している。

MediaPipe の特徴点は骨格姿勢の正解値ではなく、不確実な観測値として扱うべきである。最良の構成は、特徴点を直接 VRM ボーンへ流すものではなく、観測値を評価し、体幹基準の標準状態へ変換し、時系列で推定し、キャラクターらしい動作意図へ落としてから、IK / FK / アニメーションクリップを合成して VRM へ適用する構成である。

## スコープ

対象:

- `sincro` モードの上半身同期
- 頭部、体幹、肩、腕、手首、指
- MediaPipe Pose / Hand / Face / Gesture の使い方
- VRM 1.0 モデル差分と `AvatarMotionProfile`
- デバッグ、記録、再生、評価指標、固定テストモーションによる評価基盤
- 較正、カメラ品質の案内、性能劣化時の自然な退避

非対象:

- `chat` モードの会話視線、AI 発話ジェスチャーの詳細
- WebRTC 送受信データ / バックエンド契約
- 下半身の歩行、足接地、全身 IK
- オフライン高品質モーション生成を主目的にした ML 処理工程
- 動作デバッグログの同意、保存期間、匿名化、外部共有などの運用方針

## 現在地

2026-07-06 時点のソースコード調査では、本取り組み計画の段階 1 から段階 10 の多くは、`motion-debug` と本番実行時の観測専用 / 本番適用として実装済みまたは部分実装済みである。

ただし、本書の目標アーキテクチャは「最終的にそうあるべき主経路」を示す。現行本番実行時は、低次元動作処理工程を本番コールバックで更新し、`VrmPoseComposer` の正規化済み姿勢の全面適用まで実装済みである。全面適用利用不可は診断 Console / 評価指標の観測値理由として残すだけで、旧腕 / 体幹 / 全面段階別の書き込み処理は起動しない。残る診断 Console 切り戻しフックは意味に基づく動作 / 指抑制のみであり、既定の `"composer"` 経路から開発者制御を削除するタスクは実機基準値と切り離して進める。一方、腕の本番追跡層はまだ `SincroPoseRetargetFrame` 起点であり、標準化した / 時系列から生成した IK 目標を本番表示の主入力へ置き換える作業は未完了である。

### 実装済みまたは実装済みに近いもの

- `VideoFrameClock` は `requestVideoFrameCallback`、RAF、タイマー代替処理を `TrackerVideoFrameTiming` へ正規化している。
- `MotionDebugRecorder`、NDJSON + gzip/Brotli 公開、スキーマ検証、層別の閲覧画面、`pose-snapshot` / `final-pose-playback` / `mediapipe-raw-result` 再生、評価指標要約、QA 回帰基準値 / 候補比較は実装済みである。
- `CanonicalUpperBodyState`、`ReliabilityMap`、`TemporalUpperBodyState`、`MotionIntentState` は TypeScript 型、解析処理、デバッグ / 再生保存格納先を持つ。
- `ReliabilityMap` は Pose / Hand / Face / ROI / カメラ品質 / Gesture 由来のコンポーネントを部位別に保持できる。Gesture 信頼性は正規化済み表示名 / 信頼度、Hand 左右の割り当て、Hand ROI、カメラ品質、安定継続時間から作る。
- 本番 `sincro` の Pose コールバックは `CameraQualityScore` を生成し、観測専用 `ReliabilityMap` のカメラ情報の項目へ同一フレームで接続している。
- `CanonicalUpperBodyState` は Face 変換行列由来の標準化した頭部を生成し、行列欠損 / 無効時の Euler 代替処理警告と信頼性重みを扱う。
- `TemporalStateEstimator` は腕と頭部の `tracked` / `suspect` / `predicted` / `lost` / `recovering`、One Euro Filter、一時欠損予測、回復合成、分類保持を持つ。
- `MinimalAvatarMotionProfile`、完成版 `AvatarMotionProfile`、`VrmPoseComposer` は実装済みで、任意ボーン代替処理、所有するボーン競合、クォータニオン正規化、角速度制限を扱う。
- Pose 起点の Hand / Face ROI、Gesture Recognizer 追加の推論処理、Worker / メインスレッド代替処理、順序を固定した機能低下方針、性能プロファイルは実装済みである。
- `MotionIntent` と意味に基づく動作 / 指の曲げ姿勢合成処理層は実装済みで、Gesture Recognizer の元のラベルは任意ジェスチャー観測値として `ReliabilityMap.gesture` と MotionIntent へ渡せる。指は低次元 `open / half / closed` と曲げグループから VRM 指姿勢へ変換できる。
- `VrmPoseComposer` の正規化済み姿勢の全面適用は本番上半身最終姿勢の唯一の書き込み処理として常時試行される。旧腕 / 体幹 / 全面適用切り戻しフックと段階別代替処理パスは削除済みで、実行時の所有権対応表と切り戻し手順書では削除済み残差として整理している。意味に基づく動作 / 指抑制切り戻しフックだけは診断 Console に残る。
- `TemporalArmSolverBridge` は標準化した / 時系列腕状態と `MinimalAvatarMotionProfile` から肩のローカル座標系の IK 目標を作る実装と単体テストを持つ。
- `NoopMotionPostProcessor`、後処理スナップショット格納先、段階 11 候補を評価指標から分類する最適化候補報告は実装済みである。

### 主な残差

- `mediapipe-raw-result` 再生は実装済みだが、保存されていない未加工格納先は `missing_mediapipe_raw_result` になる。対象領域の切り出しコンテキストや実行時オブジェクトは保存しないため、未加工再生は通常の JSON 格納先で再構成できる範囲に限られる。未加工 Gesture は再生実行時でスナップショットへ正規化できるが、再生から再計算した動作意図の入力にはまだ渡していない。
- 本番実行時の `SincroMotionObserveOnlyPipeline` は信頼性 / 標準化した / 時系列 / 動作意図を更新するが、それ自体は VRM ボーンを書かない。
- 本番表示では `VrmPoseComposer` 正規化済み姿勢の全面適用まで実装済みである。旧腕 / 体幹 / 全面の段階別代替処理パスは削除済みで、全面利用不可は観測値理由として記録するだけで旧書き込み処理を起動しない。診断 Console 限定で残す切り戻しフックは意味に基づく動作 / 指抑制だけであり、その不要化判断は継続対象である。
- 腕 IK の表示主経路はまだ `SincroPoseRetargetFrame` / `SincroPoseMotionSnapshot` の腕目標を起点にする。`TemporalArmSolverBridge` はあるが、身体のローカル座標系の標準化した / 時系列状態からアバター肩のローカル座標系の目標を作る構成への本番統合は継続対象である。
- Gesture 信頼性は実観測接続済みで、時系列コンポーネントも安定継続時間の 160msかけて徐々に増やす処理として入力済みである。実カメラでのちらつき / 誤検出確認は継続対象である。
- 段階 11 は候補抽出まで実装済みだが、制約付き最適化、時系列学習済み補正、ジェスチャー系列分類器、異常検出器などの実後処理は未着手である。

### 現在のフェーズ判定

| フェーズ | 現在地                        | 残る主な差分                                                               |
| -------- | ----------------------------- | -------------------------------------------------------------------------- |
| 段階 1   | 概ね達成                      | 未加工格納先欠損 / ROI コンテキスト制限の運用確認、実ビルド gitCommit 保存 |
| 段階 2   | 腕・体幹・頭部は達成          | 本番 IK 主経路の標準化した / 時系列入力化                                  |
| 段階 3   | 概ね達成                      | カメラ案内 UI と実機調整情報確認                                           |
| 段階 4   | 概ね達成                      | Gesture 信頼性の短時間実機基準値                                           |
| 段階 5   | 概ね達成                      | 頭部時系列の実機細かな揺れ / 回復確認                                      |
| 段階 6   | 姿勢合成処理 / 全面適用は達成 | `TemporalArmSolverBridge` の本番統合、意味に基づく動作 / 指切り戻し削除    |
| 段階 7   | 調整情報 / 較正は部分達成     | 実機 UX と複数 VRM 再生比較の継続確認                                      |
| 段階 8   | 概ね達成                      | Gesture 追加の推論処理の短時間実機基準値                                   |
| 段階 9   | 概ね達成                      | Gesture 信頼性基準値、意味に基づく動作 / 指抑制切り戻しの削除              |
| 段階 10  | 概ね達成                      | 調整情報別の実機確認と回帰運用の継続                                       |
| 段階 11  | 候補抽出のみ達成              | 実後処理 / 学習済み補正は評価指標確認後に着手                              |

### 現行タスクと検証方針

- [task-260712044933-remove-semantic-finger-rollback-hook](../../../tasks/character-sincro-motion/task-260712044933-remove-semantic-finger-rollback-hook/task.md)
  は既定の本番挙動を変えない後始末として、対象を絞ったテスト、フロントエンド確認、参照 0 件の確認で進める。実機基準値は停止要因にしない。
- [task-260712171317-capture-m1-macbook-air-motion-validation-suite](../../../tasks/character-sincro-motion/task-260712171317-capture-m1-macbook-air-motion-validation-suite/task.md)
  は Gesture 追加の推論処理の独立した運用基準値とし、有効 / 無効合計120秒だけを収録する。将来用途の映像や IK / ROI / 較正素材は先取りしない。
- ソルバー、時系列推定、座標変換、保存スキーマを変える場合は対象を絞ったテストと再生を使う。開発者制御の削除や文書同期では、影響箇所のテストと静的確認を使う。
- 複数端末、複数 VRM、長時間収録は、具体的な回帰または調整の再現条件になった時点で個別タスク化する。

## 基本方針

### MediaPipe は観測入力として扱う

MediaPipe Pose / Hand / Face の出力は、単眼カメラ由来の推定値であり、奥行き、肘方向、手首ロール、左右同定、遮蔽に不確実性を持つ。

したがって、次の流れを原則とする。

```text
カメラ / VideoFrame
  -> FrameClock / CameraQuality
  -> MediaPipe 観測値
  -> ReliabilityMap
  -> 身体のローカル座標系のCanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntent
  -> AvatarMotionProfile 対応付け
  -> IK / FK / 加算アニメーション
  -> VrmPoseComposer
  -> VRM 正規化済みローカル姿勢
```

避けるべき流れは次である。

```text
MediaPipe 特徴点
  -> VRM ボーン回転
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

胴体・頭・肩は低振幅で安定を優先し、手・指・短いジェスチャーは信頼度が高い範囲で表現を強めてもよい。信頼度が低いときは動きを止めるのではなく、振幅と合成重みを落とし、控えめで自然な姿勢へ退避する。

### CanonicalUpperBodyState を中核契約にする

`CanonicalUpperBodyState` は単なる座標変換層ではない。IK、時系列推定、意味に基づく動作動作、AvatarMotionProfile、評価指標が共有する体幹基準の意味量契約として扱う。

ここに VRM ボーンの回転を入れない。保存するのは、腕がどれだけ上がっているか、体から開いているか、前に出ているか、肘が曲がっているか、手のひらがどちらを向いているか、といった制御意味である。

この契約が曖昧なままだと、`forwardness`、IK 目標、フィルタ単位、評価指標、アバター倍率が後段ごとにずれる。追加調査では、実装設計に入る前に評価基盤と標準状態を先に固めることが推奨されている。

### IK は中核ではなく後段の姿勢適用器とする

腕には既存の 2ボーンの解析的IK を主方式として使う。ただし品質の大部分は IK の前後で決まる。

- IK 前段: 信頼性、標準化、較正、時系列状態
- IK 本体: 到達距離制限、肘の曲がる方向の状態、緩やかな制限、衝突安全性
- IK 後段: クォータニオン平滑化、演出合成、アバターの調整情報、意味に基づく動作クリップ

IK 単体の高度化だけでは、肘反転、手首暴れ、肩崩れ、再検出ジャンプを根本的に解決できない。

### three-vrm は薄い実行時境界にする

three-vrm 層は、MediaPipe や IK の不確実性を解く場所ではない。動作算出処理が確定した最終上半身姿勢を、VRM 1.0 人型骨格実行時へ安全に適用する境界である。

規約:

- ボーン識別子は `VRMHumanBoneName` を使う。
- 通常制御では `vrm.humanoid.setNormalizedPose(finalPose)` を使う。
- `normalizedRestPose` を最終姿勢の初期値にしない。
- 未加工ボーン / ワールド回転コピー / glTF ノード名依存を通常経路に置かない。
- `VrmPoseComposer` を最終姿勢の唯一の書き手にし、同一フレームで複数層が同じボーンを直接上書きしない。
- 所有ボーンは毎フレーム明示的に埋める。一部のボーンだけを含む姿勢の残留に依存しない。
- `setNormalizedPose(finalPose)` の後に `vrm.update(delta)` を 1 回呼ぶ。

## 既存実装を活かす方針

現行実装には、次の良い足場がある。

- `features/gaze/trackingRuntime`: カメラ / 映像 / Worker / 代替処理の所有境界
- `features/gaze/poseTracking`: PoseLandmarker 結果から内部スナップショットへの変換
- `character/retargeting`: VRM 向け動作の変換フレームの生成
- `character/ik`: 正規化済みボーン向けの腕 IK ソルバー
- `character/vrmCharacter`: VRM 実行時との接続
- `pages/motionDebug`: カメラ / 追跡処理 / VRM 動作の変換の観測ページ

長期設計では、これらを破棄して大きな `src/mocap` のような別構成へ移すより、既存の責務境界を保ちながら中間層を明示的に追加する。

2026-07-06 時点では、次の中間層はすでに追加されている。ただし、いくつかは本番表示主経路ではなく観測専用、デバッグ、または意味に基づく動作 / 指抑制用の開発者切り戻しフック付き適用として接続されている。

- `VideoFrameClock` / `CameraQuality`
- `MotionDebugRecorder` / `MotionReplayPlayer` / `MotionMetrics`
- `ReliabilityMap`
- `CanonicalUpperBodyState`
- `TemporalStateEstimator`
- `MinimalAvatarMotionProfile` / `AvatarMotionProfile`
- `MotionIntent`
- `VrmPoseComposer`
- `SincroGestureTracker`
- `TemporalArmSolverBridge`
- `NoopMotionPostProcessor` / 最適化候補報告

残る中間層または移行作業:

- 未加工の結果再生の ROI / Gesture 動作意図制限の解消
- 標準化した / 時系列状態からアバター目標へ写す MotionSolver の本番主経路化
- 意味に基づく動作 / 指抑制切り戻しフックの不要化判断
- 学習済み / 最適化後処理の実適用

## 目標アーキテクチャ

```text
TrackerRuntime
  カメラトラック・映像要素・フレーム時計・Workerの代替経路を所有する

VideoFrameClock
  利用可能なら requestVideoFrameCallback を使う
  mediaTime・presentationTime・presentedFrames・フレーム欠落を記録する

PerceptionOrchestrator
  Poseを全画面で実行する
  PoseからHand・FaceのROIを求める
  Hand・Face・Gestureを低頻度の任意推論として実行する
  必要に応じてPoseのみ、または顔のみの追跡へ切り替える

ReliabilityEstimator
  存在確率・可視性・追跡信頼度を合成する
  画面端のリスク・骨長の整合性・予測と観測の差・左右の整合性・ROIの整合性を加える
  関節ごと・部位ごとの信頼性を出力する

Canonicalizer
  観測値をBodyLocalSpaceへ変換する
  体幹の座標系・腕の特徴量・頭部姿勢・手の特徴量を推定する
  ユーザーのキャリブレーションとカメラの構図の差を吸収する

TemporalStateEstimator
  One Euro・Kalman・ヒステリシスを適用する
  Tracked / Suspect / Predicted / Lost / Recovering を扱う
  安定した標準状態を出力する

MotionIntentEstimator
  tracking / wave / pointing / thumbsUp / peace / nearFace / explain / lost を検出する
  意味に基づく動作の合成比率を選ぶ

AvatarMotionProfile
  VRMの初期姿勢の測定値・体型比率・任意ボーン・制限・表現調整を保存する
  標準状態をアバターのローカル座標系の目標へ対応付ける

MotionSolver
  体幹・頭部・肩・腕・手首・指の姿勢を求める
  追跡姿勢・代替姿勢・手作業で制作した加算クリップを合成する

VrmPoseComposer
  完全なVRM正規化済みローカル姿勢を1つ合成する
  任意ボーンの代替処理・可動域制限・角速度制限を適用する

VrmPoseApplier
  vrm.humanoid.setNormalizedPose(finalPose) を呼ぶ
  続いて vrm.update(delta) を呼ぶ
```

## 座標系と契約

`CanonicalUpperBodyState` では、次の空間を混同しない。

| 空間                     | 主な用途                                 | 注意                                              |
| ------------------------ | ---------------------------------------- | ------------------------------------------------- |
| `ImageSpace2D`           | 画面内位置、画面端にあるリスク、重ね表示 | プレビュー鏡像と内部左右を混同しない              |
| `MediaPipeWorldSpace`    | 相対方向、骨長整合性、z 補助             | 絶対 3D として過信しない                          |
| `CameraObservationSpace` | Pose / Hand / Face の統合                | 外部契約へ漏らさない                              |
| `BodyLocalSpace`         | 標準状態                                 | 後段が共有する中心契約                            |
| `AvatarControlSpace`     | IK 目標、演出補正                        | VRM ボーンの回転ではない                          |
| `VRMNormalizedLocalPose` | three-vrm への適用                       | `VRMHumanBoneName` をキーとするクォータニオン姿勢 |

左右の定義:

- 標準状態の `left` / `right` は、画面左・右ではなく被写体の解剖学的左 / 右とする。
- 自撮りプレビューの鏡像は UI 表示だけの属性にする。
- Hand の左右判定だけで左右を確定せず、Pose 手首、前フレーム ID、左右連続性を併用する。

腕の主要標準化した値:

| 値                | 値域 / 型       | 用途                                          |
| ----------------- | --------------- | --------------------------------------------- |
| `reach`           | `0..1.15`       | 到達距離制限 / 過伸展                         |
| `elevationRad`    | `[-pi/2, pi/2]` | 腕持ち上げ                                    |
| `openness`        | `[-1, 1]`       | 横開き / 交差                                 |
| `forwardness`     | `0..1`          | 前出し。ワールド座標 z 単独ではなく複合スコア |
| `elbowFlexionRad` | `[0, pi]`       | 曲がる方向 / 伸展判定                         |
| `armConfidence`   | `0..1`          | IK 重み / フィルタ / 代替処理                 |
| `classification`  | 列挙値          | 左右 / 前 / 斜め / 不明                       |

標準状態は再生 / デバッグログの保存単位でもあるため、保存形式は JSON 化しやすいタプル / 数値 / 列挙値を基本にし、`THREE.Vector3` や `THREE.Quaternion` の実行時オブジェクトを直接保存しない。

各標準化した部位には、最低限次を持たせる。

- `confidence`: その部位の制御信頼度
- `source`: `pose` / `hand` / `face` / `previous` / `predicted` / `neutral` / `mixed`
- `warnings`: 前反転除外、左右の入れ替え疑わしい、一時欠損、回復合成など
- `outOfRangeFields`: 値域違反や値の制限された標準化したフィールド
- `calibration`: 再生再現に必要な較正 ID と主要値

頭部 / 手首 / 手の入力優先順位:

- 頭部向きは Face 変換行列を主入力にし、Pose 鼻 / 耳 / 目を代替処理にする。
- 腕 / 手首目標は Pose 手首を主入力にし、Hand 手首を腕 IK 目標の主値にしない。
- Hand Landmarker は手のひらの基底、指の曲げ、指指の開き、親指の対向動作、ジェスチャー補助に使う。
- 指は全関節 3D 回転ではなく、まず `open / half / closed` と曲げ / 指の開き / 対向運動の低次元表現へ落とす。

## タスク化前の大フェーズ

本章は、詳細な `Phase 1` から `Phase 11` をそのままタスクへ分解する前に、親タスクまたは取り組み計画として扱うための大きな順序を定める。

既存の `TASK-3100` 系では、`sincro` モードの顔 / 姿勢追跡、Worker 化、簡易 2ボーン IK、`motion-debug`、診断 Console 観測性がすでに整っている。本取り組み計画はそれを破棄せず、現行基盤を段階 0 として固定した上で、評価可能性、契約、安定化、表現力の順に積み上げる。

| 大フェーズ                               | 対応する詳細フェーズ                  | 目的                                                                                                         | フェーズゲート                                                                                                                                |
| ---------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 段階 0: 現行 `sincro` 基盤の確定         | 既存 `TASK-3100` 系、特に `TASK-3116` | 現行の顔 / 姿勢 / IK / デバッグ基盤を長期改善の出発点として固定する。                                        | `motion-debug`、診断 Console、設計文書が現行実装を説明でき、未実機確認や既知限界がタスク文書に残っている。                                    |
| 段階 A: 評価・再現性・契約               | `Phase 1`、`Phase 2`                  | 変更前後を比較できる再生 / 評価指標と、後段が共有する `CanonicalUpperBodyState` を先に固める。               | 同一入力ログで同一結果を再生でき、標準状態がデバッグ / 再生 / 評価指標に保存され、後段が同じ名前・単位を読む。                                |
| 段階 B: 入力時刻・観測品質・信頼度       | `Phase 3`、`Phase 4`                  | カメラフレーム基準の時刻、実カメラ品質、部位別信頼性を導入し、不安定な観測値を説明可能にする。               | Pose / Hand / Face / Gesture の時刻と信頼度低下理由をデバッグで追え、悪い観測が即破棄ではなく低重みとして下流へ渡る。                         |
| 段階 C: 時系列安定化・安全な姿勢合成     | `Phase 5`、`Phase 6`                  | 一時欠損、再検出ジャンプ、肘反転、手首ロール暴れを、状態推定と `VrmPoseComposer` で抑える。                  | `Tracked` / `Suspect` / `Predicted` / `Lost` / `Recovering` を再生で確認でき、同一フレームの最終姿勢書き手が `VrmPoseComposer` に集約される。 |
| 段階 D: モデル差分・ユーザー差分への適応 | `Phase 7`、`Phase 8`                  | VRM 個体差、ユーザー体型、カメラ画面内の構図、Hand / Face ROI を扱い、安定した上半身同期の対応範囲を広げる。 | 複数 VRM と同一再生ログを比較でき、較正失敗時の再試行、任意ボーン代替処理、ROI 失敗時代替処理が成立している。                                 |
| 段階 E: 意図表現・性能劣化・QA           | `Phase 9`、`Phase 10`                 | 完全追従ではなく意図が伝わる動作として磨き、端末負荷が上がっても段階的に品質を落とす。                       | `MotionIntent`、ジェスチャーヒステリシス、指低次元制御、機能低下調整情報、固定テストモーション、評価指標回帰が `motion-debug` と接続される。  |
| 段階 F: 任意最適化                       | `Phase 11`                            | 規則に基づく処理工程の限界が再生 / 評価指標で見えた後にだけ、軽量最適化や学習済み後処理を検討する。          | 学習・最適化の入力と出力が標準化した制御に閉じ、VRM ボーンの回転やアバターの調整情報の責務を ML に背負わせない判断ができている。              |

新規タスクは大フェーズを再分解せず、現在残っている1つの変更または1つの検証目的だけを扱う。検証は変更リスクに合わせ、デバッグ / 再生 / 評価指標 / 手動確認を一律の完了条件にしない。

順序を入れ替える場合でも、次の依存は守る。

- 表現力を上げる前に、再生 / 評価指標と標準化した契約を作る。
- ソルバーや IK の高度化前に、信頼性と時系列状態を通す。
- `MotionSolver` が倍率 / 奥行き / 到達距離を読む前に、少なくとも既定値を持つ `MinimalAvatarMotionProfile` を作る。
- 較正 / 調整情報は、VRM 側構造と人間側観測基準を分けた後に行う。
- ROI、ジェスチャー、指、ML は、失敗時代替処理と機能低下が説明できる状態で追加する。

## ロードマップ

以下は、大フェーズを構成する詳細フェーズである。

### 段階 1: 動作評価検証基盤

最初に作るべきものはアルゴリズム改善ではなく、再現可能な評価基盤である。

現状:

- `MotionDebugRecorder`、スキーマ検証、NDJSON 公開、gzip/Brotli 圧縮、層別の閲覧画面、評価指標要約、QA 回帰は実装済みである。
- 再生は `pose-snapshot`、`final-pose-playback`、`mediapipe-raw-result` を持つ。未加工の結果は通常の JSON の Pose / Hand / Face / Gesture 格納先をスキーマ検証し、motion-debug 実行時が Pose / Hand / Face を再正規化できる。
- 未加工の結果再生では、保存されていない未加工格納先を姿勢スナップショットで補完しない。対象領域の切り出しコンテキスト、MediaPipe 実行時オブジェクト、転送可能なオブジェクトは保存対象外であり、未加工 Gesture はスナップショット化できるが再生から再計算した動作意図にはまだ接続していない。
- 概要情報はスキーマバージョン、入力元、機密情報を除去済みのカメラ設定、処理工程設定、パッケージバージョン、設定ハッシュを保存する。`gitCommit` はスキーマ上任意だが、現行概要情報ではまだ埋めていない。

実装:

- `motion-debug` に `MotionDebugRecorder` を追加する。
- デバッグログは `NDJSON + gzip/Brotli` を基本形にする。
- 1 行目に概要情報、以降にフレーム記録を保存する。
- 概要情報にはスキーマバージョン、ビルド / パッケージバージョン、設定ハッシュ、入力元、機密情報を除去済みのカメラ設定、処理工程設定、アバターの調整情報を保存する。
- カメラ設定の `deviceId` / `groupId` は公開時にハッシュ化または省略し、生の識別子をログに残さない。
- フレーム記録には映像時刻、カメラメタデータ、MediaPipe 未加工の結果、信頼性、標準化した、時系列、動作意図、ソルバースナップショット、最終姿勢、適用済み姿勢、評価指標を保存できるようにする。
- `MotionReplayPlayer` を作り、ライブカメラなしで同じ処理工程に同じ入力を再投入できるようにする。
- 再生モードは MediaPipe 未加工の結果、姿勢スナップショット、最終姿勢再生を分ける。映像再推論再生は後段でよい。
- 標準化した / 時系列 / 動作意図は保存済み格納先を優先し、旧ログで欠損している場合だけ再生実行時で再計算する。最終姿勢再生は見た目の QA / 回帰プレビュー用とする。
- 中立姿勢の細かな揺れ、肘の反転回数、復帰時の急変、角速度の急増、到達距離制限の適用割合、追跡欠落時間、追加遅延、左右の入れ替わり回数を計測する。
- P0 固定テストモーションとして、中立姿勢 10 秒、片手をゆっくり上げる、両手をゆっくり上げる、片手を画面外へ出して戻す、腕を交差する、速い手振りを用意する。
- 評価指標には合格 / 警告 / 不合格の初期閾値を持たせる。初期値は再生結果で調整するが、閾値なしの主観比較だけで完了扱いにしない。
- 固定テストモーションと評価指標要約を回帰固定データとして保存できるようにする。

完了条件:

- ライブカメラなしで、同一入力ログから同一動作の変換結果を再現できる。
- `motion-debug` で MediaPipe 未加工、信頼性、標準化した、時系列、ソルバー、最終姿勢を層別に見られる。
- 調整前後の品質差を主観だけでなく数値で比較できる。
- 再生ログがスキーマ検証でき、旧スキーマはバージョンで分岐できる。
- P0 固定テストモーションの評価指標要約を保存し、基準値 / 候補の合格 / 警告 / 不合格を比較できる。

### 段階 2: CanonicalUpperBodyState 契約

次に、後段が共有する座標系と語彙を固める。

現状:

- `CanonicalUpperBodyState` の保存契約、解析処理、腕の `reach` / `elevationRad` / `openness` / `forwardness` / `elbowFlexionRad` / `classification` は実装済みである。
- 体幹の座標系は Pose と任意 Face / 前フレームの値状態を使って推定され、腕の標準化した特徴量は再生 / デバッグログに保存できる。
- `head` 格納先は型と解析処理に加えて実時間の標準化した生成にも接続済みである。Face 変換行列を主入力にし、行列欠損 / 無効時は低信頼度の Euler 代替処理と警告を残す。
- 時系列 / MotionIntent / 評価指標は標準化したを読む。`TemporalArmSolverBridge` は標準化した / 時系列の身体のローカル座標系の腕状態から肩のローカル座標系の IK 目標を生成できるが、本番表示用追跡層はまだ `SincroPoseRetargetFrame` / `SincroPoseMotionSnapshot` 起点である。

実装:

- `CanonicalUpperBodyState` の TypeScript 型を定義する。
- `ImageSpace2D`、`MediaPipeWorldSpace`、`BodyLocalSpace`、`AvatarControlSpace`、`VRMNormalizedLocalPose` の責務を文書化する。
- 再生 / デバッグ保存用の標準化した型はタプル / 数値 / 列挙値で定義し、実行時オブジェクト依存を避ける。
- 体幹の座標系を `shoulderCenter`、`hipCenter`、Face 行列、前フレーム、較正済み中立姿勢から推定する。
- `bodyFront` の符号反転を前フレームと Face ヨーで抑制する。
- 腕を `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification` へ落とす。
- `forwardness` は身体のローカル座標系の方向、ワールド座標 z 補助、投影短縮、手大きさから作る複合スコアにする。
- 標準化した部位ごとに `confidence`、`source`、`warnings`、`outOfRangeFields` を持たせる。
- 較正スナップショットは ID だけでなく、再生再現に必要な中立姿勢ヨー、肩幅、体幹倍率、手基準値の主要値を保存する。
- 標準状態に VRM ボーンの回転を入れない。
- `motion-debug` で標準化した値、値域外、急変、左右入れ替えを表示する。

完了条件:

- `CanonicalUpperBodyState` を診断用スナップショットと再生ログに保存できる。
- 手首絶対位置ではなく、身体のローカル座標系で表す意味量で腕の動きを説明できる。
- IK、時系列、MotionIntent、AvatarMotionProfile が同じ標準化した名と単位を読む。
- 標準化した層より後段で MediaPipe 特徴点を再解釈しない。
- デバッグ / 再生で標準状態の入力元、警告、値域外、較正理由を確認できる。

### 段階 3: FrameClock / CameraQuality / 性能基準値

`requestAnimationFrame` 基準の推論ループから、動画フレーム基準の時計へ移行する。

現状:

- `VideoFrameClock` は `requestVideoFrameCallback`、RAF、タイマー代替処理を持つ。
- `TrackerVideoFrameTiming` は `mediaTimeMs`、`presentationTimeMs`、`expectedDisplayTimeMs`、`presentedFrames`、`droppedPresentedFrames` を保持できる。
- `CameraQualityScore` は `motion-debug` の実時間のスナップショット / 記録 / 再生閲覧画面に加え、本番観測専用の処理工程の `ReliabilityMap` 入力にも接続されている。
- 入力元 none / 顔のみの / Handのみ相当ではスコアを捏造せず、既存 `camera_quality_missing` 代替処理に戻す。

実装:

- `HTMLVideoElement.requestVideoFrameCallback()` を使う `VideoFrameClock` を追加する。
- 未対応環境では `requestAnimationFrame + video.currentTime`、さらに低 fps タイマー代替処理を使う。
- 推論起動は映像フレーム基準、描画は RAF 基準に分離する。
- `mediaTime`、`presentationTime`、`expectedDisplayTime`、`presentedFrames`、`droppedPresentedFrames` を記録する。
- `MediaStreamTrack.getSettings()` を保存し、実解像度、実 fps、カメラの向き、トラック状態を診断用スナップショットに載せる。
- `CameraQualityScore` を導入し、解像度、実行頻度、体幹が画面内に収まるか、手が画面内に収まるか、画面端にあるリスク、手が小さく写るリスク、動体ぶれリスクを評価する。
- `detectForVideo()` 系の同期推論は Worker 分離を標準にし、メインスレッド代替処理は低 fps / デバッグ用に限定する。
- 処理時間の予算と機能低下状態をデバッグに保存する。

完了条件:

- Pose / Hand / Face / Gesture の時刻が同一映像フレームに紐付く。
- 欠落フレーム、推論遅延、カメラ画面内の構図の問題をデバッグ上で切り分けられる。
- UIスレッドの詰まり、Worker 往復、転送コストを評価指標として確認できる。
- UX へ出すカメラ案内は「少し下がってください」「部屋を明るくしてください」のようなユーザーが直せる行動文に変換できる。

### 段階 4: ReliabilityMap

MediaPipe 信頼度をそのまま使わず、制御用の信頼度を部位別に再定義する。

現状:

- `ReliabilityMap` v1 は関節 / 部位 / ジェスチャー格納先、コンポーネント一式、理由 / 警告コード、解析処理を持つ。
- Pose / Hand / Face / ROI / カメラ品質 / 前フレームの値姿勢由来のコンポーネントを合成できる。本番観測専用の処理工程でもカメラ品質コンポーネントは同一 Pose フレームのスコアを読む。
- `motion-debug` ではカメラ品質を含めた信頼性を保存できる。
- Gesture 信頼性は実 Gesture Recognizer の正規化済み観測値から合成できる。`ReliabilityMap.gesture` は最上位ラベル信頼度、Hand 左右の割り当て、Hand ROI、カメラ品質、安定継続時間を持ち、Gesture 追加の推論処理が省略 / 未検出の場合だけ中立姿勢の仮値になる。`components.temporal` は `stableDurationMs / 160` の制限した値で、有効再初期化フレームはスコア 0 / `unstable_observation`、160ms 以上は理由なしとする。

実装:

- `ReliabilityMap` を導入し、関節 / 部位ごとの重みと状態を出す。
- 存在確率、可視性、追跡信頼度、画面端への近さ、骨長整合性、身体寸法整合性、時系列予測と観測の差、左右整合性、ROI 整合性、カメラ品質を合成する。
- 肩、肘、手首、頭部、手、指、ジェスチャーで別の信頼性を持つ。
- `finalWeight < threshold` で即破棄せず、低重みの観測として下流へ渡す。
- IK 重み、フィルタ重み、意味に基づく動作発火条件、代替処理判定が同じ信頼性を読むようにする。
- 領域分割マスクは任意の品質指標として扱い、常時ログ保存はしない。

完了条件:

- 悪い観測値を即破棄せず、低重みとして TemporalStateEstimator へ渡せる。
- 手が画面端、顔前、遮蔽、急ジャンプした場合に、部位別に動きが自然に弱まる。
- 左右入れ替え、骨長破綻、再検出ジャンプを信頼性のどの要素が下げたかデバッグで説明できる。

### 段階 5: TemporalStateEstimator

平滑化を単一の後処理ではなく、状態推定として設計する。

現状:

- 腕の `tracked` / `suspect` / `predicted` / `lost` / `recovering`、One Euro Filter、一時欠損予測、無理のない姿勢代替処理、回復合成、分類保持は実装済みである。
- `recoveringBlendMs` は 180-400ms に値の制限され、既定値は 260ms である。
- 標準化した頭部が実時間ので埋まるため、頭部時系列は通常入力でも動く。行列欠損 / 無効時は標準化した警告と信頼度値の制限を通じて低信頼度入力として扱う。

実装:

- 部位ごとに `Tracked`、`Suspect`、`Predicted`、`Lost`、`Recovering` を持つ。
- 手首目標、頭部回転、標準化したスカラー、指の曲げに One Euro Filter を使う。
- 一時欠損中の手首 / 頭部には短期等速度予測と速度の減衰を使う。
- 肘の曲がる方向は実測、前フレーム、代替処理曲がる方向を状態に応じて合成する。
- ジェスチャー表示名、指状態、前出し具合 / 開き具合分類にはヒステリシス / 短時間の変化の抑制を使う。
- 最終クォータニオンは slerp または対数空間での平滑化を使い、成分 lerp を避ける。
- `Recovering` では観測値へ急変せず 180-400ms 程度で合成復帰する。

完了条件:

- 手が 200-700ms 程度消えても腕が急に中立姿勢へ落ちない。
- 再検出時の角度ジャンプを 10-15 度以下へ抑える。
- 中立姿勢 10 秒で胴体・頭・手首の細かな揺れを計測できる。
- 低信頼度時に「止まる」のではなく、無理のない自然姿勢へ滑らかに退避する。

### 段階 6: MotionSolver / IK / VrmPoseComposer

既存 IK の数学を活かしつつ、目標、曲がる方向、制約、姿勢合成の責務を明確化する。

現状:

- 既存 2ボーン IK、`MinimalAvatarMotionProfile`、`VrmPoseComposer` は実装済みである。
- 姿勢合成処理は代替処理 / 追跡 / 意味に基づく動作 / 待機動作 / 演出層、任意ボーン代替処理、所有するボーン競合、クォータニオン正規化、角速度制限を扱う。
- 本番実行時では `VrmPoseComposer` 試行、意味に基づく動作・指の適用、正規化済み姿勢の全面適用が実装済みである。`vrm.humanoid.setNormalizedPose(finalPose)` は上半身最終姿勢を 1 回適用し、利用不可 / 無効 / 欠損調整情報では古くなった finalPose を使わず、旧腕 / 体幹段階別の代替処理パスにも戻らない。
- 診断 Console 限定の切り戻しフックは意味に基づく動作 / 指抑制だけを残す。削除済み段階別の代替処理パス、手順、残リスクはタスク成果物の切り戻し手順書 / 後始末一覧に記録されている。
- `TemporalArmSolverBridge` は身体のローカル座標系の標準化した / 時系列状態と `MinimalAvatarMotionProfile` からアバター肩のローカル座標系の IK 目標、到達距離制限、状態に応じた重み、診断用スナップショットを作れる。
- 本番の姿勢合成処理追跡層はまだ最新動作の変換フレームを基準姿勢にしており、IK 目標は身体のローカル座標系の標準化した / 時系列状態だけから作る主経路には完全移行していない。

この段階は `AvatarMotionProfile` の完成版を待つ必要はないが、IK 目標の倍率 / 奥行き / 到達距離を決めるため、段階 6 開始時点で `MinimalAvatarMotionProfile` を先に用意する。`MinimalAvatarMotionProfile` は VRM 読み込み時の任意ボーン、肩幅、上腕 / 前腕の長さ、頭部大きさ、既定到達距離倍率、奥行き圧縮、肩減衰、手首ロール反映率を持つ。

実装:

- 既存 2ボーンの解析的IK を主方式として継続する。
- IK 目標は身体のローカル座標系での標準状態からアバター肩のローカル座標系のへ写す。
- Pose 手首を腕 IK 目標の主入力にし、Hand は手のひらの基底 / 指 / ジェスチャーの補助にする。
- 到達距離制限、奥行き圧縮、左右方向 / 上下方向倍率、腕到達距離倍率を `AvatarMotionProfile` から読む。
- `ArmPoleState` として `Stable`、`Uncertain`、`Extended`、`Lost`、`Recovering` を導入する。
- 曲がる方向は測定済み / 前フレームの値 / 代替処理を状態別に合成し、急反転を重みを緩やかに低下 / 完全に除外する。
- 肩、`upperArm`、`lowerArm`、手首、指に緩やかな制限と角速度制限を入れる。
- 手首ロールは強く抑制し、前腕ねじれと手首ねじれに分配する。
- `VrmPoseComposer` を追加し、追跡 / 代替処理 / 意味に基づく動作 / 待機動作 / 演出 / 制限を 1 つの `VRMPose` へ合成する。
- 姿勢合成処理後段で任意ボーン代替処理、最終値の制限、クォータニオン正規化を行う。

完了条件:

- `VRMHumanBoneName` をキーとするの正規化済みローカル姿勢として最終姿勢が成立している。
- `MinimalAvatarMotionProfile` から到達距離倍率、奥行き圧縮、左右方向 / 上下方向倍率、任意ボーン対応能力を読める。
- 同一フレームで AnimationMixer、IK、意味に基づく動作クリップが同じボーンを直接上書きしない。
- `upperChest` なし、肩ボーンなし、指ボーン一部欠落の VRM でも破綻せず代替処理できる。
- 肘反転、腕の伸び切り、肩崩れ、手首ロール暴れが評価指標と再生で比較できる。

### 段階 7: AvatarMotionProfile / 較正 / UX

VRM モデル差分とユーザー体型差を品質問題として扱う。

現状:

- 完成版 `AvatarMotionProfile` は VRM 読み込み時に対応機能、初期姿勢のローカル回転、骨の長さ、手 / 指のボーン列、体幹配分、腕 / 手首 / 指既定値、リスク、警告を生成する。
- `MinimalAvatarMotionProfile` は診断 Console と姿勢合成処理試行 / 選択したボーンの適用の軽量調整情報として使われる。
- 初回 / 継続的なキャリブレーションモジュールと診断用スナップショットは存在するが、実機 UX、複数 VRM 再生比較、失敗手順再試行の運用確認は継続対象である。

実装:

- VRM 読み込み時に初期姿勢のローカル回転、骨の長さ、肩幅、頭部大きさ、手大きさ、任意ボーン、制約影響を計測する。
- `AvatarMotionProfile` に到達距離倍率、奥行き圧縮、左右方向 / 上下方向倍率、肘外向き偏りの補正、肩減衰、手首ロール反映率、指の曲げ倍率を持たせる。
- 体幹の任意代替処理は `spine + chest + upperChest`、`spine + chest`、背骨のみで分配を変える。
- 初期較正は T 姿勢ではなく、4-5 秒の 3-step を標準にする。
- 3-step は「正面自然姿勢」「軽い A 姿勢」「軽く開いた手」とし、顔左右は任意手順にする。
- 較正状態は `ready` / `ready_without_hands` / `retry_recommended` / `failed` に分ける。
- `ready_without_hands` を許容し、手指だけ不安定な場合でも腕・頭・体幹の同期を開始できるようにする。
- 継続的なキャリブレーションは人間側の中立姿勢ヨー / 肩幅 / 身体寸法の倍率 / 手開いた基準値だけを高信頼度・中立姿勢に近い時に低速更新する。体幹 / 頭部 / 腕の信頼度、画面端にあるリスク、動体ぶれリスク、骨長の整合性、低い腕の活動量を検査とする。
- 継続的なキャリブレーションは `candidate` と `committed` を分け、3-5 秒以上安定した候補だけ committed に反映する。
- 徐々に生じるずれ検査として、肩幅、身体寸法の倍率、中立姿勢ヨー、頭部ピッチ / ロール、手倍率には初期較正からの許容逸脱範囲を持たせる。
- VRM 初期姿勢の回転、骨の長さ、人型骨格対応付け、左右判定対応付け、関節制限、手のひらの基底軸定義は継続的なキャリブレーションで変えない。

完了条件:

- 小柄 VRoid、頭が大きいモデル、`upperChest` なしモデルで同じ再生ログを比較できる。
- 調整情報差分により、腕の伸び切り、顔めり込み、肩崩れを調整できる。
- 較正失敗時に全体をやり直さず、失敗手順だけ再試行できる。
- ユーザー向け UI は内部用語を見せず、修正可能な行動として案内できる。
- 較正状態、再試行理由、継続的なキャリブレーション更新停止理由、徐々に生じるずれ値の制限を再生 / デバッグで確認できる。

### 段階 8: Poseを手がかりにした Hand / Face ROI

Pose を全体検出、Hand / Face を ROI 検出として扱う。

現状:

- Worker / メインスレッド代替処理ともに Pose 起点の Hand / Face ROI 追加の推論処理を持つ。
- ROI 実行・省略・一時停止は追跡処理統計と信頼性コンポーネントに保存できる。
- Hand / Face ROI が失敗または省略されたフレームでも未検出 / 省略済みスナップショットを配信し、後段が未実行と未検出を区別できる。
- Gesture Recognizer 追加の推論処理は本番 `sincro` に接続済みであり、Pose / Hand が有効なフレームだけ低頻度で実行される。顔のみ / 自然な待機姿勢 / Hand 一時停止では未検出スナップショットまたは省略要約に落ちる。

実装:

- Pose 手首から左 / 右手切り出しを作る。
- Pose 顔領域から FaceLandmarker ROI を作る。
- 切り出し座標を全画面の座標へ戻し、身体のローカル座標系での標準状態へ統合する。
- 左右判定は Hand の結果だけに依存せず、Pose 手首と時系列 ID で補正する。
- ROI 失敗時は全画面の / Poseのみ代替処理へ落とす。
- Hand / Face / Gesture は端末負荷に応じて低頻度 / イベントに応じたにできるようにする。

完了条件:

- 手が小さい、速く動く、顔に近い、腕が交差するケースで一時欠損と左右入れ替えを減らせる。
- ROI 座標変換ミスや左右取り違えを再生 / デバッグで検出できる。
- ROI 経路が失敗してもキャラクター全体が固まらない。

### 段階 9: MotionIntent / 意味に基づく動作動作 / 指

完全追従ではなく、ユーザーの動作意図が伝わるキャラクター動作として扱う。

現状:

- `MotionIntentState` と `MotionIntentEstimator` は実装済みで、時系列 / 信頼性 / 手 / 任意ジェスチャーを入力にできる。
- 意味に基づく動作の姿勢層と指の曲げ姿勢レイヤーは姿勢合成処理入力として実装済みである。
- 指は Hand スナップショットの低次元特徴量と `AvatarMotionProfile.fingers` からグループ化した曲げを生成する。
- MediaPipe `GestureRecognizer` の実行時実行接続は実装済みであり、元のラベルは `GestureIntentObservation` へ正規化して `ReliabilityMap.gesture` と `MotionIntentEstimator` へ渡す。MotionIntent のジェスチャー検査は `ReliabilityMap.gesture.finalWeight`、Hand 信頼性、Finger 信頼性を優先して読む。

実装:

- `MotionIntent` を導入し、`tracking`、`wave`、`pointing`、`thumbsUp`、`peace`、`nearFace`、`explain`、`clapLike`、`guarded`、`lost`、`fallback` を扱う。
- Gesture Recognizer は主制御器ではなく、MotionIntent の補助入力にする。
- ジェスチャーは信頼度、手信頼性、最小継続時間、待機期間、ヒステリシスで安定化する。
- 手振りは `Open_Palm` だけで発火させず、肩から顔の高さ、左右速度の符号反転、継続時間を条件にする。
- 指は `open / half / closed` から始め、親指、人差し指、中指、薬指小指グループの曲げへ拡張する。
- Three.js `AnimationMixer` や制作済みクリップは評価用用に使い、最終的には姿勢差分として `VrmPoseComposer` に渡す。
- 意味に基づく動作クリップは全身上書きではなく、追跡姿勢への加算 / 部分上書きとして扱う。

完了条件:

- 手振り、指差し、サムズアップ、ピース、顔近くの手が、追従の揺れではなく意味ある動作として見える。
- ジェスチャー表示名のちらつきがヒステリシスと最小継続時間で抑えられる。
- 追跡低下中も意味に基づく動作 / 代替処理 / 無理のない自然姿勢の合成で自然に退避できる。

### 段階 10: 性能安定性の強化 / QA / 機能低下

実装後の安定運用に向けて、端末差分と機能低下方針を固める。

現状:

- 高性能デスクトップ端末、標準ノートパソコン、携帯端末 / Safari、デバッグモード相当の性能プロファイルと順序を固定した機能低下方針は実装済みである。
- 機能低下段階は `full`、`gesture-reduced-fps`、`optional-pass-reduced-fps`、`roi-hand-paused`、`pose-reduced-fps`、`face-only`、`comfortable-idle` を持つ。
- `gesture-reduced-fps` は実 Gesture 追加の推論処理の実効実行頻度に反映され、メインスレッド代替処理ではジェスチャー fps を低く値の制限する。
- 再生評価指標は追跡処理許容時間、欠落フレーム、機能低下フレーム、ROI 一時停止を集計できる。
- 調整情報別の実機確認と回帰運用は継続対象である。

実装:

- 端末クラス別にカメラ解像度、Pose fps、Hand / Face fps、Gesture fps、デバッグログ粒度を切り替える。
- 高性能デスクトップ端末、標準ノートパソコン、携帯端末 / Safari、デバッグモードの調整情報を用意する。
- 機能低下順序を定義する。
    1. Gesture の fps / イベント判定を下げる。
    2. Hand / Face 追加の推論処理を低頻度にする。
    3. ROI / 手を一時停止し、Poseのみ上半身にする。
    4. Pose fps / カメラ解像度を下げる。
    5. 顔のみ / 待機動作 / 無理のない自然姿勢に退避する。
- デバッグログは数値指標をリングバッファで常時持ち、PNG / 重ね表示 / 全情報の出力は明示取得または低頻度にする。
- 固定テストモーション、主観評価フォーム、評価指標回帰を `motion-debug` と接続する。

完了条件:

- 端末負荷が上がっても UIスレッドが固まらず、同期品質が段階的に落ちる。
- 機能低下の理由と現在の処理工程調整情報をデバッグで確認できる。
- 再生ログと固定テストモーションで回帰を検出できる。

### 段階 11: 任意最適化 / 学習済み後処理

有効取り組み計画には含めない。既存の規則に基づく処理工程で同じ回帰が継続して再現され、対象を絞った調整では解消できない場合だけ、失敗評価指標と再生ログを入力に個別タスクを起票する。

採用する場合も、出力は標準化した制御に閉じ、VRM ボーンの回転やアバターの調整情報の責務を学習済みモデルに移さない。

## 破綻回避の優先順位

最初に潰すべき破綻は次とする。

| 優先度 | 破綻                   | 対応層                                               |
| -----: | ---------------------- | ---------------------------------------------------- |
|      1 | 胴体・頭部の細かな揺れ | FrameClock、信頼性、時系列                           |
|      2 | 再検出時のジャンプ     | 一時欠損状態、回復合成、未加工の結果再生             |
|      3 | 肘反転                 | 標準化した腕、Pole 状態、IK 制約                     |
|      4 | 肩崩れ / 肩めり込み    | AvatarMotionProfile、肩 / 胸分配                     |
|      5 | 腕の伸び切り           | 到達距離倍率、奥行き圧縮、値の制限                   |
|      6 | 手首ロール暴れ         | Hand 信頼性、手首ロール減衰、前腕ねじれ              |
|      7 | 指のちらつき           | 曲げ状態、ヒステリシス、意味に基づく動作ジェスチャー |
|      8 | 左右入れ替え           | Poseを手がかりにした ROI、左右整合性、被写体の左右   |
|      9 | 性能劣化で固まる       | Worker、機能低下方針、デバッグリングバッファ         |

## 評価指標

最低限の評価指標:

| 評価指標               | 主な入力                                       |
| ---------------------- | ---------------------------------------------- |
| 中立姿勢での細かな揺れ | 標準化した体幹 / 頭部 / 手首、最終 VRMPose     |
| 肘の反転回数           | 肘の曲がる方向、上腕・前腕クォータニオン       |
| 復帰時の急変角度       | 時系列状態、最終 VRMPose                       |
| 角速度の急増           | 適用済み正規化済み姿勢                         |
| 到達距離制限の発生率   | IK 目標、到達比率、値の制限結果                |
| 追跡消失継続時間       | ReliabilityMap、時系列状態                     |
| 左右入れ替え件数       | 被写体の左右割り当て、Hand 左右判定            |
| カメラ画面内の構図失敗 | CameraQualityScore、画面端にあるリスク         |
| 機能低下継続時間       | 性能プロファイル、機能低下状態                 |
| ジェスチャーちらつき   | MotionIntent、ジェスチャー表示名、安定継続時間 |

評価指標はデバッグ画面に表示するだけでなく、再生実行時の比較結果として保存できるようにする。

## 現行設計文書への反映方針

本書は調査取り組み計画であり、現在有効な設計正本ではない。

実装へ進むときは、次の設計文書を更新する。

- [../../design/frontend/character/tracking.md](../../design/frontend/character/tracking.md)
    - FrameClock、CameraQuality、信頼性、ROI、Worker 処理の組み立て、機能低下
- [../../design/frontend/character/motion.md](../../design/frontend/character/motion.md)
    - CanonicalUpperBodyState、TemporalStateEstimator、MotionIntent、AvatarMotionProfile、MotionSolver
- [../../design/frontend/character/overview.md](../../design/frontend/character/overview.md)
    - `sincro` モードの責務境界と最終アーキテクチャ
- `documents/design/frontend/character/vrm.md` または既存 VRM 関連文書
    - three-vrm 姿勢適用規約、VrmPoseComposer、任意ボーン代替処理

該当文書が存在しない場合は、既存の `frontend/character/` 文書構成に合わせて追加または統合する。破壊的な責務変更や大きな設計判断を行う場合は、ADR を追加する。

## 実装判断の原則

- 生特徴点を制御処理 / VRM 適用層へ漏らさない。
- デバッグで観測値、信頼度、標準状態、時系列状態、動作の変換 / ソルバー、適用済み姿勢を分けて見えるようにする。
- ソルバー、時系列推定、座標変換の品質改善は再生で比較する。配線整理、開発者制御の削除、文書同期は対象を絞ったテストと静的確認で検証する。
- 信頼度が低いときは突然止めず、振幅と合成重みを落とす。
- 大きい部位ほど安定、小さい部位ほど表現を許す。
- 手先の似ている感を優先し、奥行き、手首ロール、肘曲がる方向は丸めてよい。
- VRM モデル差分は例外ではなく調整情報と代替処理で扱う。
- three-vrm 層で不確実な観測値を解釈しない。
- `VrmPoseComposer` 以外に最終ボーン姿勢の書き手を増やさない。
- まず再現可能性、次に安定性、最後に表現力を上げる。
