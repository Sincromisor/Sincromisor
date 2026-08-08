# Sincro Character Animation Roadmap

## 目的

本書は、`sincro` モードで動作するキャラクターアニメーションを長期的にどう設計・実装するべきかを整理する。

短期的な既存実装の延長ではなく、単眼 Web カメラ、MediaPipe、VRM 1.0、Three.js、three-vrm という前提で、キャラクターとして自然で破綻しにくい上半身モーションを目指すための方針とロードマップを定める。

この版では、初期調査レポートに加えて `requests/` で依頼した分野別調査と `answers/` の回答、ならびに 2026-07-06 時点のソースコード調査を反映し、層間 contract と現在の残差を整理する。詳細フェーズは設計判断の背景であり、達成済み項目を再検証するための実行チェックリストではない。

## 調査資料

調査報告は次を正本とする。

- [report01.md](report01.md): 上半身モーションキャプチャの実装方式
- [report02.md](report02.md): IK 以外の品質改善手法
- [report03.md](report03.md): 実装順序、破綻回避、パラメータ設計
- [report04-three-vrm.md](report04-three-vrm.md): three-vrm による VRM-1.0 キャラクターアニメーション実装ベストプラクティス

追加調査は次を参照する。

- [requests/README.md](requests/README.md): 分野別調査依頼の一覧と優先関係
- [answers/01-mediapipe-tracking.md](answers/01-mediapipe-tracking.md): MediaPipe tracking / reliability / ROI
- [answers/02-motion-solver-ik.md](answers/02-motion-solver-ik.md): Motion solver / IK / 関節制約
- [answers/03-temporal-filtering.md](answers/03-temporal-filtering.md): 時系列推定 / dropout / latency
- [answers/04-character-motion-design.md](answers/04-character-motion-design.md): ものまねらしさ / semantic motion
- [answers/05-vrm-three-vrm.md](answers/05-vrm-three-vrm.md): VRM / three-vrm / AvatarMotionProfile
- [answers/06-web-realtime-performance.md](answers/06-web-realtime-performance.md): Web realtime / Worker / performance budget
- [answers/07-evaluation-debug-qa.md](answers/07-evaluation-debug-qa.md): 評価基盤 / debug / QA
- [answers/08-calibration-ux.md](answers/08-calibration-ux.md): calibration / UX guide
- [answers/09-canonical-upper-body-state.md](answers/09-canonical-upper-body-state.md): CanonicalUpperBodyState / 座標系

追加調査の結論は一貫している。

MediaPipe の landmark は骨格姿勢の正解値ではなく、不確実な観測値として扱うべきである。最良の構成は、landmark を直接 VRM bone へ流すものではなく、観測値を評価し、体幹基準の canonical state へ変換し、時系列で推定し、キャラクターらしい motion intent へ落としてから、IK / FK / animation clip を合成して VRM へ適用する構成である。

## スコープ

対象:

- `sincro` モードの上半身同期
- 頭部、体幹、肩、腕、手首、指
- MediaPipe Pose / Hand / Face / Gesture の使い方
- VRM 1.0 モデル差分と `AvatarMotionProfile`
- debug、record、replay、metrics、固定テストモーションによる評価基盤
- calibration、camera quality guide、性能劣化時の自然な退避

非対象:

- `chat` モードの会話視線、AI speech gesture の詳細
- WebRTC payload / backend 契約
- 下半身の歩行、足接地、full-body IK
- オフライン高品質モーション生成を主目的にした ML pipeline
- motion debug log の同意、保存期間、匿名化、外部共有などの運用方針

## 現在地

2026-07-06 時点のソースコード調査では、本 roadmap の Phase 1 から Phase 10 の多くは、`motion-debug` と production runtime の observe-only / production application として実装済みまたは部分実装済みである。

ただし、本書の目標アーキテクチャは「最終的にそうあるべき主経路」を示す。現行 production runtime は、低次元 motion pipeline を本番 callback で更新し、`VrmPoseComposer` の full normalized pose application まで実装済みである。full application unavailable は Debug Console / metrics の observation reason として残すだけで、旧 arm / torso / full staged writer は起動しない。残る Debug Console rollback hook は semantic / finger suppression のみであり、既定の `"composer"` 経路から developer control を削除するタスクは実機 baseline と切り離して進める。一方、腕の本番 tracking layer はまだ `SincroPoseRetargetFrame` 起点であり、canonical / temporal から生成した IK target を production 表示の主入力へ置き換える作業は未完了である。

### 実装済みまたは実装済みに近いもの

- `VideoFrameClock` は `requestVideoFrameCallback`、RAF、timer fallback を `TrackerVideoFrameTiming` へ正規化している。
- `MotionDebugRecorder`、NDJSON + gzip/Brotli export、schema validation、layered viewer、`pose-snapshot` / `final-pose-playback` / `mediapipe-raw-result` replay、metrics summary、QA regression baseline / candidate comparison は実装済みである。
- `CanonicalUpperBodyState`、`ReliabilityMap`、`TemporalUpperBodyState`、`MotionIntentState` は TypeScript 型、parser、debug / replay 保存 slot を持つ。
- `ReliabilityMap` は Pose / Hand / Face / ROI / camera quality / Gesture 由来の component を部位別に保持できる。Gesture reliability は normalized label / confidence、Hand side assignment、Hand ROI、camera quality、stable duration から作る。
- production `sincro` の Pose callback は `CameraQualityScore` を生成し、observe-only `ReliabilityMap` の camera component へ同一 frame で接続している。
- `CanonicalUpperBodyState` は Face transformation matrix 由来の canonical head を生成し、matrix 欠損 / invalid 時の Euler fallback warning と reliability weight を扱う。
- `TemporalStateEstimator` は腕と head の `tracked` / `suspect` / `predicted` / `lost` / `recovering`、One Euro Filter、dropout prediction、recovery blend、classification hold を持つ。
- `MinimalAvatarMotionProfile`、完成版 `AvatarMotionProfile`、`VrmPoseComposer` は実装済みで、optional bone fallback、owned bone conflict、quaternion normalize、angular velocity clamp を扱う。
- Pose 起点の Hand / Face ROI、Gesture Recognizer optional pass、Worker / main-thread fallback、ordered degradation policy、performance profile は実装済みである。
- `MotionIntent` と semantic / finger curl composer layer は実装済みで、Gesture Recognizer の raw label は optional gesture observation として `ReliabilityMap.gesture` と MotionIntent へ渡せる。指は低次元 `open / half / closed` と curl group から VRM finger pose へ変換できる。
- `VrmPoseComposer` の full normalized pose application は production upper-body final pose の唯一の writer として常時試行される。旧 arm / torso / full application rollback hook と段階別 fallback path は削除済みで、runtime ownership map と rollback runbook では削除済み残差として整理している。semantic / finger suppression rollback hook だけは Debug Console に残る。
- `TemporalArmSolverBridge` は canonical / temporal arm state と `MinimalAvatarMotionProfile` から shoulder-local IK target を作る実装と単体テストを持つ。
- `NoopMotionPostProcessor`、post-processing snapshot slot、Phase 11 候補を metrics から分類する optimization candidate report は実装済みである。

### 主な残差

- `mediapipe-raw-result` replay は実装済みだが、保存されていない raw slot は `missing_mediapipe_raw_result` になる。ROI crop context や runtime object は保存しないため、raw replay は plain JSON slot で再構成できる範囲に限られる。raw Gesture は replay runtime で snapshot へ正規化できるが、replay-derived intent の入力にはまだ渡していない。
- production runtime の `SincroMotionObserveOnlyPipeline` は reliability / canonical / temporal / intent を更新するが、それ自体は VRM bone を書かない。
- production 表示では `VrmPoseComposer` full normalized pose application まで実装済みである。旧 arm / torso / full の段階別 fallback path は削除済みで、full unavailable は observation reason として記録するだけで旧 writer を起動しない。Debug Console 限定で残す rollback hook は semantic / finger suppression だけであり、その不要化判断は継続対象である。
- 腕 IK の表示主経路はまだ `SincroPoseRetargetFrame` / `SincroPoseMotionSnapshot` の arm targets を起点にする。`TemporalArmSolverBridge` はあるが、body-local canonical / temporal state から avatar shoulder-local target を作る構成への production 統合は継続対象である。
- Gesture reliability は実観測接続済みで、temporal component も stable duration の 160ms ramp として入力済みである。実カメラでの flicker / false-positive 確認は継続対象である。
- Phase 11 は候補抽出まで実装済みだが、constrained optimization、temporal learned correction、gesture sequence classifier、anomaly detector などの実 post-processing は未着手である。

### 現在のフェーズ判定

| フェーズ | 現在地                           | 残る主な差分                                                                  |
| -------- | -------------------------------- | ----------------------------------------------------------------------------- |
| Phase 1  | 概ね達成                         | raw slot 欠損 / ROI context 制限の運用確認、実 build gitCommit 保存           |
| Phase 2  | 腕・体幹・頭部は達成             | production IK 主経路の canonical / temporal 入力化                            |
| Phase 3  | 概ね達成                         | camera guide UI と実機 profile 確認                                           |
| Phase 4  | 概ね達成                         | Gesture reliability の短時間実機 baseline                                     |
| Phase 5  | 概ね達成                         | head temporal の実機 jitter / recovery 確認                                   |
| Phase 6  | composer / full 適用は達成       | `TemporalArmSolverBridge` の production 統合、semantic / finger rollback 削除 |
| Phase 7  | profile / calibration は部分達成 | 実機 UX と複数 VRM replay 比較の継続確認                                      |
| Phase 8  | 概ね達成                         | Gesture optional pass の短時間実機 baseline                                   |
| Phase 9  | 概ね達成                         | Gesture reliability baseline、semantic / finger suppression rollback の削除   |
| Phase 10 | 概ね達成                         | profile 別の実機確認と regression 運用の継続                                  |
| Phase 11 | 候補抽出のみ達成                 | 実 post-processing / learned correction は metrics 確認後に着手               |

### 現行タスクと検証方針

- [task-260712044933-remove-semantic-finger-rollback-hook](../../../tasks/character-sincro-motion/task-260712044933-remove-semantic-finger-rollback-hook/task.md)
  は既定の production 挙動を変えない cleanup として、focused test、frontend check、参照 0 件の確認で進める。実機 baseline は blocker にしない。
- [task-260712171317-capture-m1-macbook-air-motion-validation-suite](../../../tasks/character-sincro-motion/task-260712171317-capture-m1-macbook-air-motion-validation-suite/task.md)
  は Gesture optional pass の独立した運用 baseline とし、on / off 合計120秒だけを収録する。将来用途の映像や IK / ROI / calibration 素材は先取りしない。
- solver、時系列推定、座標変換、保存 schema を変える場合は focused test と replay を使う。developer control の削除や文書同期では、影響箇所の test と静的確認を使う。
- 複数端末、複数 VRM、長時間収録は、具体的な regression または tuning の再現条件になった時点で個別タスク化する。

## 基本方針

### MediaPipe は観測入力として扱う

MediaPipe Pose / Hand / Face の出力は、単眼カメラ由来の推定値であり、奥行き、肘方向、手首 roll、左右同定、遮蔽に不確実性を持つ。

したがって、次の流れを原則とする。

```text
Camera / VideoFrame
  -> FrameClock / CameraQuality
  -> MediaPipe observations
  -> ReliabilityMap
  -> Body-local CanonicalUpperBodyState
  -> TemporalStateEstimator
  -> MotionIntent
  -> AvatarMotionProfile mapping
  -> IK / FK / additive animation
  -> VrmPoseComposer
  -> VRM normalized local pose
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

胴体・頭・肩は低振幅で安定を優先し、手・指・短い gesture は信頼度が高い範囲で表現を強めてもよい。信頼度が低いときは動きを止めるのではなく、振幅と blend weight を落とし、控えめで自然な pose へ退避する。

### CanonicalUpperBodyState を中核 contract にする

`CanonicalUpperBodyState` は単なる座標変換層ではない。IK、時系列推定、semantic motion、AvatarMotionProfile、metrics が共有する体幹基準の意味量 contract として扱う。

ここに VRM bone rotation を入れない。保存するのは、腕がどれだけ上がっているか、体から開いているか、前に出ているか、肘が曲がっているか、手のひらがどちらを向いているか、といった制御意味である。

この contract が曖昧なままだと、`forwardness`、IK target、filter 単位、metrics、avatar scale が後段ごとにずれる。追加調査では、実装設計に入る前に評価基盤と canonical state を先に固めることが推奨されている。

### IK は中核ではなく後段の姿勢適用器とする

腕には既存の 2-bone analytic IK を主方式として使う。ただし品質の大部分は IK の前後で決まる。

- IK 前段: reliability、canonicalization、calibration、temporal state
- IK 本体: reach clamp、elbow pole state、soft limit、collision safety
- IK 後段: quaternion smoothing、style blending、avatar profile、semantic clip

IK 単体の高度化だけでは、肘反転、手首暴れ、肩崩れ、再検出ジャンプを根本的に解決できない。

### three-vrm は薄い runtime 境界にする

three-vrm 層は、MediaPipe や IK の不確実性を解く場所ではない。motion solver が確定した最終上半身姿勢を、VRM 1.0 humanoid runtime へ安全に適用する境界である。

規約:

- bone 識別子は `VRMHumanBoneName` を使う。
- 通常制御では `vrm.humanoid.setNormalizedPose(finalPose)` を使う。
- `normalizedRestPose` を final pose の seed にしない。
- raw bone / world rotation copy / glTF node 名依存を通常経路に置かない。
- `VrmPoseComposer` を最終 pose の唯一の書き手にし、同一 frame で複数層が同じ bone を直接上書きしない。
- 所有 bone は毎 frame 明示的に埋める。partial pose の残留に依存しない。
- `setNormalizedPose(finalPose)` の後に `vrm.update(delta)` を 1 回呼ぶ。

## 既存実装を活かす方針

現行実装には、次の良い足場がある。

- `features/gaze/trackingRuntime`: camera / video / Worker / fallback の所有境界
- `features/gaze/poseTracking`: PoseLandmarker 結果から内部 snapshot への変換
- `character/retargeting`: VRM 向け retarget frame の生成
- `character/ik`: normalized bone 向けの腕 IK solver
- `character/vrmCharacter`: VRM runtime との接続
- `pages/motionDebug`: camera / tracker / VRM retarget の観測ページ

長期設計では、これらを破棄して大きな `src/mocap` のような別構成へ移すより、既存の責務境界を保ちながら中間層を明示的に追加する。

2026-07-06 時点では、次の中間層はすでに追加されている。ただし、いくつかは production 表示主経路ではなく observe-only、debug、または semantic / finger suppression 用の developer rollback hook 付き application として接続されている。

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
- `NoopMotionPostProcessor` / optimization candidate report

残る中間層または移行作業:

- raw result replay の ROI / Gesture intent 制限の解消
- canonical / temporal state から avatar target へ写す MotionSolver の production 主経路化
- semantic / finger suppression rollback hook の不要化判断
- learned / optimization post-processing の実適用

## 目標アーキテクチャ

```text
TrackerRuntime
  owns camera track / video element / frame clock / Worker fallback

VideoFrameClock
  uses requestVideoFrameCallback when available
  records mediaTime / presentationTime / presentedFrames / frame drop

PerceptionOrchestrator
  runs Pose full-frame
  derives Hand / Face ROI from Pose
  runs Hand / Face / Gesture as optional lower-fps passes
  falls back to Pose-only or face-only when needed

ReliabilityEstimator
  combines presence / visibility / tracking confidence
  adds border risk / bone-length consistency / temporal innovation / side consistency / ROI consistency
  outputs per-joint and per-part reliability

Canonicalizer
  converts observations into BodyLocalSpace
  estimates torso frame, arm features, head pose, hand features
  absorbs user calibration and camera framing

TemporalStateEstimator
  applies One Euro / Kalman / hysteresis
  handles Tracked / Suspect / Predicted / Lost / Recovering
  outputs stable canonical state

MotionIntentEstimator
  detects tracking / wave / pointing / thumbsUp / peace / nearFace / explain / lost
  chooses semantic blend weights

AvatarMotionProfile
  stores VRM rest metrics, proportions, optional bones, limits, style
  maps canonical state to avatar-local targets

MotionSolver
  solves torso, head, shoulders, arms, wrists, fingers
  blends tracking pose, fallback pose, and additive authored clips

VrmPoseComposer
  composes one complete VRM normalized local pose
  applies optional bone fallback, limits, angular velocity clamp

VrmPoseApplier
  calls vrm.humanoid.setNormalizedPose(finalPose)
  then vrm.update(delta)
```

## 座標系と contract

`CanonicalUpperBodyState` では、次の空間を混同しない。

| 空間                     | 主な用途                         | 注意                                     |
| ------------------------ | -------------------------------- | ---------------------------------------- |
| `ImageSpace2D`           | 画面内位置、border risk、overlay | preview mirror と内部左右を混同しない    |
| `MediaPipeWorldSpace`    | 相対方向、骨長整合性、z 補助     | 絶対 3D として過信しない                 |
| `CameraObservationSpace` | Pose / Hand / Face の統合        | 外部 contract へ漏らさない               |
| `BodyLocalSpace`         | canonical state                  | 後段が共有する中心 contract              |
| `AvatarControlSpace`     | IK target、style 補正            | VRM bone rotation ではない               |
| `VRMNormalizedLocalPose` | three-vrm への適用               | `VRMHumanBoneName` keyed quaternion pose |

左右の定義:

- canonical の `left` / `right` は、画面左・右ではなく被写体の解剖学的 left / right とする。
- 自撮り preview の mirror は UI 表示だけの属性にする。
- Hand の handedness だけで左右を確定せず、Pose wrist、前フレーム ID、side continuity を併用する。

腕の主要 canonical 値:

| 値                | 値域 / 型       | 用途                                   |
| ----------------- | --------------- | -------------------------------------- |
| `reach`           | `0..1.15`       | reach clamp / overextension            |
| `elevationRad`    | `[-pi/2, pi/2]` | arm raise                              |
| `openness`        | `[-1, 1]`       | 横開き / 交差                          |
| `forwardness`     | `0..1`          | 前出し。world z 単独ではなく複合スコア |
| `elbowFlexionRad` | `[0, pi]`       | pole / extension 判定                  |
| `armConfidence`   | `0..1`          | IK weight / filter / fallback          |
| `classification`  | enum            | side / front / diagonal / unknown      |

canonical state は replay / debug log の保存単位でもあるため、保存形式は JSON 化しやすい tuple / number / enum を基本にし、`THREE.Vector3` や `THREE.Quaternion` の runtime object を直接保存しない。

各 canonical part には、最低限次を持たせる。

- `confidence`: その部位の制御信頼度
- `source`: `pose` / `hand` / `face` / `previous` / `predicted` / `neutral` / `mixed`
- `warnings`: front flip reject、left-right swap suspect、dropout、recovery blend など
- `outOfRangeFields`: 値域違反や clamp された canonical field
- `calibration`: replay 再現に必要な calibration id と主要値

head / wrist / hand の入力優先順位:

- head orientation は Face transformation matrix を主入力にし、Pose nose / ears / eyes を fallback にする。
- arm / wrist target は Pose wrist を主入力にし、Hand wrist を腕 IK target の主値にしない。
- Hand Landmarker は palm basis、finger curl、finger splay、thumb oppose、gesture 補助に使う。
- 指は全関節 3D rotation ではなく、まず `open / half / closed` と curl / splay / oppose の低次元表現へ落とす。

## タスク化前の大フェーズ

本章は、詳細な `Phase 1` から `Phase 11` をそのままタスクへ分解する前に、親タスクまたは initiative として扱うための大きな順序を定める。

既存の `TASK-3100` 系では、`sincro` mode の face / pose tracking、Worker 化、簡易 2-bone IK、`motion-debug`、Debug Console 観測性がすでに整っている。本 roadmap はそれを破棄せず、現行基盤を Phase 0 として固定した上で、評価可能性、contract、安定化、表現力の順に積み上げる。

| 大フェーズ                                | 対応する詳細フェーズ                  | 目的                                                                                                              | フェーズゲート                                                                                                                                        |
| ----------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0: 現行 `sincro` 基盤の確定         | 既存 `TASK-3100` 系、特に `TASK-3116` | 現行の face / pose / IK / debug 基盤を長期改善の出発点として固定する。                                            | `motion-debug`、Debug Console、設計文書が現行実装を説明でき、未実機確認や既知限界がタスク文書に残っている。                                           |
| Phase A: 評価・再現性・contract           | `Phase 1`、`Phase 2`                  | 変更前後を比較できる replay / metrics と、後段が共有する `CanonicalUpperBodyState` を先に固める。                 | 同一入力ログで同一結果を replay でき、canonical state が debug / replay / metrics に保存され、後段が同じ名前・単位を読む。                            |
| Phase B: 入力時刻・観測品質・信頼度       | `Phase 3`、`Phase 4`                  | camera frame 基準の時刻、実 camera quality、部位別 reliability を導入し、不安定な観測値を説明可能にする。         | Pose / Hand / Face / Gesture の timestamp と confidence 低下理由を debug で追え、悪い観測が即破棄ではなく低 weight として下流へ渡る。                 |
| Phase C: 時系列安定化・安全な姿勢合成     | `Phase 5`、`Phase 6`                  | dropout、再検出ジャンプ、肘反転、手首 roll 暴れを、状態推定と `VrmPoseComposer` で抑える。                        | `Tracked` / `Suspect` / `Predicted` / `Lost` / `Recovering` を replay で確認でき、同一 frame の final pose 書き手が `VrmPoseComposer` に集約される。  |
| Phase D: モデル差分・ユーザー差分への適応 | `Phase 7`、`Phase 8`                  | VRM 個体差、ユーザー体型、camera framing、Hand / Face ROI を扱い、安定した上半身同期の対応範囲を広げる。          | 複数 VRM と同一 replay log を比較でき、calibration 失敗時の再試行、optional bone fallback、ROI 失敗時 fallback が成立している。                       |
| Phase E: 意図表現・性能劣化・QA           | `Phase 9`、`Phase 10`                 | 完全追従ではなく意図が伝わる motion として磨き、端末負荷が上がっても段階的に品質を落とす。                        | `MotionIntent`、gesture hysteresis、finger 低次元制御、degradation profile、固定テストモーション、metrics regression が `motion-debug` と接続される。 |
| Phase F: 任意最適化                       | `Phase 11`                            | rule-based pipeline の限界が replay / metrics で見えた後にだけ、軽量最適化や learned post-processing を検討する。 | 学習・最適化の入力と出力が canonical control に閉じ、VRM bone rotation や avatar profile の責務を ML に背負わせない判断ができている。                 |

新規タスクは大フェーズを再分解せず、現在残っている1つの変更または1つの検証目的だけを扱う。検証は変更リスクに合わせ、debug / replay / metrics / 手動確認を一律の完了条件にしない。

順序を入れ替える場合でも、次の依存は守る。

- 表現力を上げる前に、replay / metrics と canonical contract を作る。
- solver や IK の高度化前に、reliability と temporal state を通す。
- `MotionSolver` が scale / depth / reach を読む前に、少なくとも default 値を持つ `MinimalAvatarMotionProfile` を作る。
- calibration / profile は、VRM 側構造と人間側観測基準を分けた後に行う。
- ROI、gesture、finger、ML は、失敗時 fallback と degradation が説明できる状態で追加する。

## ロードマップ

以下は、大フェーズを構成する詳細フェーズである。

### Phase 1: Motion evaluation harness

最初に作るべきものはアルゴリズム改善ではなく、再現可能な評価基盤である。

現状:

- `MotionDebugRecorder`、schema validation、NDJSON export、gzip/Brotli compression、layered viewer、metrics summary、QA regression は実装済みである。
- replay は `pose-snapshot`、`final-pose-playback`、`mediapipe-raw-result` を持つ。raw result は plain JSON の Pose / Hand / Face / Gesture slot を schema validation し、motion-debug runtime が Pose / Hand / Face を再正規化できる。
- raw result replay では、保存されていない raw slot を pose snapshot で補完しない。ROI crop context、MediaPipe runtime object、transferable object は保存対象外であり、raw Gesture は snapshot 化できるが replay-derived intent にはまだ接続していない。
- manifest は schema version、source、scrub 済み camera settings、pipeline config、package versions、config hash を保存する。`gitCommit` は schema 上 optional だが、現行 manifest ではまだ埋めていない。

実装:

- `motion-debug` に `MotionDebugRecorder` を追加する。
- debug log は `NDJSON + gzip/Brotli` を基本形にする。
- 1 行目に manifest、以降に frame record を保存する。
- manifest には schema version、build / package versions、config hash、source、scrub 済み camera settings、pipeline config、avatar profile を保存する。
- camera settings の `deviceId` / `groupId` は export 時に hash 化または省略し、生の識別子を log に残さない。
- frame record には video timestamp、camera metadata、MediaPipe raw result、reliability、canonical、temporal、intent、solver snapshot、final pose、applied pose、metrics を保存できるようにする。
- `MotionReplayPlayer` を作り、ライブカメラなしで同じ pipeline に同じ入力を再投入できるようにする。
- replay mode は MediaPipe raw result、pose snapshot、final pose playback を分ける。video re-inference replay は後段でよい。
- canonical / temporal / intent は saved slot を優先し、旧 log で欠損している場合だけ replay runtime で再計算する。final pose playback は visual QA / regression preview 用とする。
- `neutral jitter`、`elbow flip count`、`recovery jump`、`angular velocity spike`、`reach clamp occupancy`、`tracking loss duration`、`added latency`、`side swap count` を計測する。
- P0 固定テストモーションとして、neutral 10 秒、片手をゆっくり上げる、両手をゆっくり上げる、片手を画面外へ出して戻す、腕を交差する、速い手振りを用意する。
- metrics には pass / warn / fail の初期閾値を持たせる。初期値は replay 結果で調整するが、閾値なしの主観比較だけで完了扱いにしない。
- 固定テストモーションと metrics summary を regression fixture として保存できるようにする。

完了条件:

- ライブカメラなしで、同一入力ログから同一 retarget 結果を再現できる。
- `motion-debug` で MediaPipe raw、reliability、canonical、temporal、solver、final pose を層別に見られる。
- 調整前後の品質差を主観だけでなく数値で比較できる。
- replay log が schema validation でき、旧 schema は version で分岐できる。
- P0 固定テストモーションの metrics summary を保存し、baseline / candidate の pass / warn / fail を比較できる。

### Phase 2: CanonicalUpperBodyState contract

次に、後段が共有する座標系と語彙を固める。

現状:

- `CanonicalUpperBodyState` の保存 contract、parser、腕の `reach` / `elevationRad` / `openness` / `forwardness` / `elbowFlexionRad` / `classification` は実装済みである。
- torso frame は Pose と optional Face / previous state を使って推定され、腕の canonical feature は replay / debug log に保存できる。
- `head` slot は型と parser に加えて live canonical 生成にも接続済みである。Face transformation matrix を主入力にし、matrix 欠損 / invalid 時は低 confidence の Euler fallback と warning を残す。
- Temporal / MotionIntent / metrics は canonical を読む。`TemporalArmSolverBridge` は canonical / temporal の body-local arm state から shoulder-local IK target を生成できるが、production 表示用 tracking layer はまだ `SincroPoseRetargetFrame` / `SincroPoseMotionSnapshot` 起点である。

実装:

- `CanonicalUpperBodyState` の TypeScript 型を定義する。
- `ImageSpace2D`、`MediaPipeWorldSpace`、`BodyLocalSpace`、`AvatarControlSpace`、`VRMNormalizedLocalPose` の責務を文書化する。
- replay / debug 保存用の canonical 型は tuple / number / enum で定義し、runtime object 依存を避ける。
- torso frame を `shoulderCenter`、`hipCenter`、Face matrix、前フレーム、calibrated neutral から推定する。
- `bodyFront` の符号反転を前フレームと Face yaw で抑制する。
- 腕を `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification` へ落とす。
- `forwardness` は body-local direction、world z 補助、投影短縮、hand size から作る複合スコアにする。
- canonical part ごとに `confidence`、`source`、`warnings`、`outOfRangeFields` を持たせる。
- calibration snapshot は id だけでなく、replay 再現に必要な neutral yaw、shoulder width、torso scale、hand baseline の主要値を保存する。
- canonical state に VRM bone rotation を入れない。
- `motion-debug` で canonical 値、値域外、急変、左右入れ替えを表示する。

完了条件:

- `CanonicalUpperBodyState` を debug snapshot と replay log に保存できる。
- wrist absolute position ではなく、body-local な意味量で腕の動きを説明できる。
- IK、Temporal、MotionIntent、AvatarMotionProfile が同じ canonical 名と単位を読む。
- canonical 層より後段で MediaPipe landmark を再解釈しない。
- debug / replay で canonical の source、warning、out-of-range、calibration reason を確認できる。

### Phase 3: FrameClock / CameraQuality / performance baseline

`requestAnimationFrame` 基準の推論 loop から、動画フレーム基準の clock へ移行する。

現状:

- `VideoFrameClock` は `requestVideoFrameCallback`、RAF、timer fallback を持つ。
- `TrackerVideoFrameTiming` は `mediaTimeMs`、`presentationTimeMs`、`expectedDisplayTimeMs`、`presentedFrames`、`droppedPresentedFrames` を保持できる。
- `CameraQualityScore` は `motion-debug` の live snapshot / recording / replay viewer に加え、production observe-only pipeline の `ReliabilityMap` 入力にも接続されている。
- source none / Face-only / Hand-only 相当では score を捏造せず、既存 `camera_quality_missing` fallback に戻す。

実装:

- `HTMLVideoElement.requestVideoFrameCallback()` を使う `VideoFrameClock` を追加する。
- 未対応環境では `requestAnimationFrame + video.currentTime`、さらに低 fps timer fallback を使う。
- 推論起動は video frame 基準、描画は RAF 基準に分離する。
- `mediaTime`、`presentationTime`、`expectedDisplayTime`、`presentedFrames`、`droppedPresentedFrames` を記録する。
- `MediaStreamTrack.getSettings()` を保存し、実解像度、実 fps、facing mode、track state を debug snapshot に載せる。
- `CameraQualityScore` を導入し、resolution、cadence、torso in frame、hands in frame、border risk、hand small risk、motion blur risk を評価する。
- `detectForVideo()` 系の同期推論は Worker 分離を標準にし、main thread fallback は低 fps / debug 用に限定する。
- performance budget と degradation state を debug に保存する。

完了条件:

- Pose / Hand / Face / Gesture の timestamp が同一 video frame に紐付く。
- dropped frame、推論遅延、camera framing の問題を debug 上で切り分けられる。
- UI thread の詰まり、Worker round trip、transfer cost を metrics として確認できる。
- UX へ出す camera guide は「少し下がってください」「部屋を明るくしてください」のようなユーザーが直せる行動文に変換できる。

### Phase 4: ReliabilityMap

MediaPipe confidence をそのまま使わず、制御用の信頼度を部位別に再定義する。

現状:

- `ReliabilityMap` v1 は joint / part / gesture slot、component set、reason / warning code、parser を持つ。
- Pose / Hand / Face / ROI / camera quality / previous pose 由来の component を合成できる。production observe-only pipeline でも camera quality component は同一 Pose frame の score を読む。
- `motion-debug` では camera quality を含めた reliability を保存できる。
- Gesture reliability は実 Gesture Recognizer の normalized observation から合成できる。`ReliabilityMap.gesture` は top label confidence、Hand side assignment、Hand ROI、camera quality、stable duration を持ち、Gesture optional pass が skip / lost の場合だけ neutral placeholder になる。`components.temporal` は `stableDurationMs / 160` の clamp 値で、valid reset frame は score 0 / `unstable_observation`、160ms 以上は reason なしとする。

実装:

- `ReliabilityMap` を導入し、joint / part ごとの weight と state を出す。
- presence、visibility、tracking confidence、border proximity、bone-length consistency、body-scale consistency、temporal innovation、side consistency、ROI consistency、camera quality を合成する。
- shoulder、elbow、wrist、head、hand、finger、gesture で別の reliability を持つ。
- `finalWeight < threshold` で即破棄せず、低 weight の観測として下流へ渡す。
- IK weight、filter weight、semantic trigger、fallback 判定が同じ reliability を読むようにする。
- segmentation mask は任意の品質指標として扱い、常時ログ保存はしない。

完了条件:

- 悪い観測値を即破棄せず、低 weight として TemporalStateEstimator へ渡せる。
- 手が画面端、顔前、遮蔽、急ジャンプした場合に、部位別に動きが自然に弱まる。
- 左右入れ替え、骨長破綻、再検出ジャンプを reliability のどの要素が下げたか debug で説明できる。

### Phase 5: TemporalStateEstimator

平滑化を単一の後処理ではなく、状態推定として設計する。

現状:

- 腕の `tracked` / `suspect` / `predicted` / `lost` / `recovering`、One Euro Filter、dropout prediction、comfortable fallback、recovery blend、classification hold は実装済みである。
- `recoveringBlendMs` は 180-400ms に clamp され、既定値は 260ms である。
- canonical head が live で埋まるため、head temporal は通常入力でも動く。matrix 欠損 / invalid 時は canonical warning と confidence clamp を通じて低信頼度入力として扱う。

実装:

- 部位ごとに `Tracked`、`Suspect`、`Predicted`、`Lost`、`Recovering` を持つ。
- wrist target、head rotation、canonical scalar、finger curl に One Euro Filter を使う。
- dropout 中の wrist / head には短期 constant-velocity prediction と velocity damping を使う。
- elbow pole は実測、前フレーム、fallback pole を状態に応じて blend する。
- gesture label、finger state、forwardness / openness classification には hysteresis / debounce を使う。
- final quaternion は slerp または log-space smoothing を使い、成分 lerp を避ける。
- `Recovering` では観測値へ snap せず 180-400ms 程度で blend 復帰する。

完了条件:

- 手が 200-700ms 程度消えても腕が急に neutral へ落ちない。
- 再検出時の角度ジャンプを 10-15 度以下へ抑える。
- neutral 10 秒で胴体・頭・手首の jitter を計測できる。
- 低 confidence 時に「止まる」のではなく、comfortable pose へ滑らかに退避する。

### Phase 6: MotionSolver / IK / VrmPoseComposer

既存 IK の数学を活かしつつ、target、pole、constraint、pose 合成の責務を明確化する。

現状:

- 既存 2-bone IK、`MinimalAvatarMotionProfile`、`VrmPoseComposer` は実装済みである。
- composer は fallback / tracking / semantic / idle / style layer、optional bone fallback、owned bone conflict、quaternion normalize、angular velocity clamp を扱う。
- production runtime では `VrmPoseComposer` dry-run、semantic / finger application、full normalized pose application が実装済みである。`vrm.humanoid.setNormalizedPose(finalPose)` は upper body final pose を 1 回適用し、unavailable / invalid / missing profile では stale finalPose を使わず、旧 arm / torso staged fallback path にも戻らない。
- Debug Console 限定の rollback hook は semantic / finger suppression だけを残す。削除済み staged fallback path、手順、残リスクは task artifact の rollback runbook / cleanup inventory に記録されている。
- `TemporalArmSolverBridge` は body-local canonical / temporal state と `MinimalAvatarMotionProfile` から avatar shoulder-local IK target、reach clamp、state-based weight、debug snapshot を作れる。
- production の composer tracking layer はまだ latest retarget frame を base pose にしており、IK target は body-local canonical / temporal state だけから作る主経路には完全移行していない。

この Phase は `AvatarMotionProfile` の完成版を待つ必要はないが、IK target の scale / depth / reach を決めるため、Phase 6 開始時点で `MinimalAvatarMotionProfile` を先に用意する。`MinimalAvatarMotionProfile` は VRM load 時の optional bone、shoulder width、upper / lower arm length、head size、default reach scale、depth compression、shoulder damping、wrist roll influence を持つ。

実装:

- 既存 2-bone analytic IK を主方式として継続する。
- IK target は body-local canonical state から avatar shoulder-local へ写す。
- Pose wrist を腕 IK target の主入力にし、Hand は palm basis / finger / gesture の補助にする。
- reach clamp、depth compression、lateral / vertical scale、arm reach scale を `AvatarMotionProfile` から読む。
- `ArmPoleState` として `Stable`、`Uncertain`、`Extended`、`Lost`、`Recovering` を導入する。
- pole は measured / previous / fallback を状態別に blend し、急反転を soft downweight / hard reject する。
- shoulder、upperArm、lowerArm、wrist、finger に soft limit と angular velocity clamp を入れる。
- wrist roll は強く抑制し、forearm twist と wrist twist に分配する。
- `VrmPoseComposer` を追加し、tracking / fallback / semantic / idle / style / limit を 1 つの `VRMPose` へ合成する。
- composer 後段で optional bone fallback、final clamp、quaternion normalize を行う。

完了条件:

- `VRMHumanBoneName` keyed の normalized local pose として final pose が成立している。
- `MinimalAvatarMotionProfile` から reach scale、depth compression、lateral / vertical scale、optional bone capability を読める。
- 同一 frame で AnimationMixer、IK、semantic clip が同じ bone を直接上書きしない。
- `upperChest` なし、shoulder bone なし、finger bone 一部欠落の VRM でも破綻せず fallback できる。
- 肘反転、腕の伸び切り、肩崩れ、手首 roll 暴れが metrics と replay で比較できる。

### Phase 7: AvatarMotionProfile / calibration / UX

VRM モデル差分とユーザー体型差を品質問題として扱う。

現状:

- 完成版 `AvatarMotionProfile` は VRM load 時に capabilities、rest local rotation、bone length、hand / finger chain、torso distribution、arm / wrist / finger defaults、risk、warnings を生成する。
- `MinimalAvatarMotionProfile` は Debug Console と composer dry-run / selected-bone application の軽量 profile として使われる。
- initial / online calibration module と debug snapshot は存在するが、実機 UX、複数 VRM replay 比較、失敗 step retry の運用確認は継続対象である。

実装:

- VRM load 時に rest local rotation、bone length、shoulder width、head size、hand size、optional bones、constraint 影響を計測する。
- `AvatarMotionProfile` に reach scale、depth compression、lateral / vertical scale、elbow outward bias、shoulder damping、wrist roll influence、finger curl scale を持たせる。
- torso の optional fallback は `spine + chest + upperChest`、`spine + chest`、`spine only` で分配を変える。
- 初期 calibration は T pose ではなく、4-5 秒の 3-step を標準にする。
- 3-step は「正面自然姿勢」「軽い A pose」「軽く開いた手」とし、顔左右は任意 step にする。
- calibration status は `ready` / `ready_without_hands` / `retry_recommended` / `failed` に分ける。
- `ready_without_hands` を許容し、手指だけ不安定な場合でも腕・頭・体幹の同期を開始できるようにする。
- online calibration は人間側の neutral yaw / shoulder width / body scale / hand open baseline だけを高信頼度・near-neutral 時に低速更新する。torso / head / arm の信頼度、border risk、motion blur risk、bone length consistency、低い arm activity を gate とする。
- online calibration は `candidate` と `committed` を分け、3-5 秒以上安定した候補だけ committed に反映する。
- drift guard として、shoulder width、body scale、neutral yaw、head pitch / roll、hand scale には初期 calibration からの許容逸脱範囲を持たせる。
- VRM rest rotation、bone length、humanoid mapping、handedness mapping、関節 limit、palm basis 軸定義は online calibration で変えない。

完了条件:

- 小柄 VRoid、頭が大きいモデル、`upperChest` なしモデルで同じ replay log を比較できる。
- profile 差分により、腕の伸び切り、顔めり込み、肩崩れを調整できる。
- calibration 失敗時に全体をやり直さず、失敗 step だけ再試行できる。
- ユーザー向け UI は内部用語を見せず、修正可能な行動として案内できる。
- calibration status、retry reason、online calibration freeze reason、drift clamp を replay / debug で確認できる。

### Phase 8: Pose-seeded Hand / Face ROI

Pose を全体検出、Hand / Face を ROI 検出として扱う。

現状:

- Worker / main-thread fallback ともに Pose 起点の Hand / Face ROI optional pass を持つ。
- ROI 実行・skip・pause は tracker stats と reliability component に保存できる。
- Hand / Face ROI が失敗または skip された frame でも lost / skipped snapshot を publish し、後段が未実行と未検出を区別できる。
- Gesture Recognizer optional pass は production `sincro` に接続済みであり、Pose / Hand が有効な frame だけ lower-fps に実行される。face-only / comfortable-idle / Hand pause では lost snapshot または skip summary に落ちる。

実装:

- Pose wrist から left / right hand crop を作る。
- Pose face region から FaceLandmarker ROI を作る。
- crop 座標を full-frame 座標へ戻し、body-local canonical state へ統合する。
- handedness は Hand の結果だけに依存せず、Pose wrist と時系列 ID で補正する。
- ROI 失敗時は full-frame / Pose-only fallback へ落とす。
- Hand / Face / Gesture は端末負荷に応じて lower fps / event-driven にできるようにする。

完了条件:

- 手が小さい、速く動く、顔に近い、腕が交差するケースで dropout と左右入れ替えを減らせる。
- ROI 座標変換ミスや左右取り違えを replay / debug で検出できる。
- ROI 経路が失敗してもキャラクター全体が固まらない。

### Phase 9: MotionIntent / semantic motion / fingers

完全追従ではなく、ユーザーの動作意図が伝わるキャラクター motion として扱う。

現状:

- `MotionIntentState` と `MotionIntentEstimator` は実装済みで、temporal / reliability / hand / optional gesture を入力にできる。
- semantic pose layer と finger curl pose layer は composer input として実装済みである。
- 指は Hand snapshot の低次元 feature と `AvatarMotionProfile.fingers` から grouped curl を生成する。
- MediaPipe `GestureRecognizer` の runtime 実行接続は実装済みであり、raw label は `GestureIntentObservation` へ正規化して `ReliabilityMap.gesture` と `MotionIntentEstimator` へ渡す。MotionIntent の gesture gate は `ReliabilityMap.gesture.finalWeight`、Hand reliability、Finger reliability を優先して読む。

実装:

- `MotionIntent` を導入し、`tracking`、`wave`、`pointing`、`thumbsUp`、`peace`、`nearFace`、`explain`、`clapLike`、`guarded`、`lost`、`fallback` を扱う。
- Gesture Recognizer は主制御器ではなく、MotionIntent の補助入力にする。
- gesture は confidence、hand reliability、minimum duration、cooldown、hysteresis で安定化する。
- 手振りは `Open_Palm` だけで発火させず、肩から顔の高さ、左右速度の符号反転、継続時間を条件にする。
- 指は `open / half / closed` から始め、親指、人差し指、中指、薬指小指グループの curl へ拡張する。
- Three.js `AnimationMixer` や authored clip は staging 用に使い、最終的には pose delta として `VrmPoseComposer` に渡す。
- semantic clip は全身上書きではなく、tracking pose への additive / partial override として扱う。

完了条件:

- 手振り、指差し、サムズアップ、ピース、顔近くの手が、追従の揺れではなく意味ある motion として見える。
- gesture label のちらつきが hysteresis と minimum duration で抑えられる。
- tracking 低下中も semantic / fallback / comfortable pose の blend で自然に退避できる。

### Phase 10: Performance hardening / QA / degradation

実装後の安定運用に向けて、端末差分と degrade 方針を固める。

現状:

- high-end desktop、standard laptop、mobile / Safari、debug mode 相当の performance profile と ordered degradation policy は実装済みである。
- degradation stage は `full`、`gesture-reduced-fps`、`optional-pass-reduced-fps`、`roi-hand-paused`、`pose-reduced-fps`、`face-only`、`comfortable-idle` を持つ。
- `gesture-reduced-fps` は実 Gesture optional pass の effective cadence に反映され、main-thread fallback では gesture fps を低く clamp する。
- replay metrics は tracker budget、dropped frame、degradation frame、ROI pause を集計できる。
- profile 別の実機確認と regression 運用は継続対象である。

実装:

- 端末クラス別に camera resolution、Pose fps、Hand / Face fps、Gesture fps、debug log 粒度を切り替える。
- high-end desktop、standard laptop、mobile / Safari、debug mode の profile を用意する。
- degradation order を定義する。
    1. Gesture の fps / event 判定を下げる。
    2. Hand / Face optional pass を lower fps にする。
    3. ROI / hand を一時停止し、Pose-only upper body にする。
    4. Pose fps / camera resolution を下げる。
    5. face-only / idle / comfortable pose に退避する。
- debug log は numeric metrics を ring buffer で常時持ち、PNG / overlay / full dump は明示 capture または低頻度にする。
- 固定テストモーション、主観評価フォーム、metrics regression を `motion-debug` と接続する。

完了条件:

- 端末負荷が上がっても UI thread が固まらず、同期品質が段階的に落ちる。
- degradation の理由と現在の pipeline profile を debug で確認できる。
- replay log と固定テストモーションで regression を検出できる。

### Phase 11: Optional optimization / learned post-processing

active roadmap には含めない。既存の rule-based pipeline で同じ regression が継続して再現され、focused tuning では解消できない場合だけ、失敗 metric と replay log を入力に個別タスクを起票する。

採用する場合も、出力は canonical control に閉じ、VRM bone rotation や avatar profile の責務を learned model に移さない。

## 破綻回避の優先順位

最初に潰すべき破綻は次とする。

| 優先度 | 破綻                | 対応層                                              |
| -----: | ------------------- | --------------------------------------------------- |
|      1 | 胴体・頭部の jitter | FrameClock、Reliability、Temporal                   |
|      2 | 再検出時のジャンプ  | dropout state、recovery blending、raw result replay |
|      3 | 肘反転              | Canonical arm、Pole state、IK constraint            |
|      4 | 肩崩れ / 肩めり込み | AvatarMotionProfile、shoulder / chest 分配          |
|      5 | 腕の伸び切り        | reach scale、depth compression、clamp               |
|      6 | 手首 roll 暴れ      | Hand reliability、wrist roll damping、forearm twist |
|      7 | 指のちらつき        | curl state、hysteresis、semantic gesture            |
|      8 | 左右入れ替え        | Pose-seeded ROI、side consistency、anatomical side  |
|      9 | 性能劣化で固まる    | Worker、degradation policy、debug ring buffer       |

## Metrics

最低限の metrics:

| metric                 | 主な入力                                      |
| ---------------------- | --------------------------------------------- |
| neutral jitter         | canonical torso / head / wrist、final VRMPose |
| elbow flip count       | elbow pole、upper/lower arm quaternion        |
| recovery jump angle    | Temporal state、final VRMPose                 |
| angular velocity spike | applied normalized pose                       |
| reach clamp occupancy  | IK target、reach ratio、clamp result          |
| tracking loss duration | ReliabilityMap、Temporal state                |
| side swap count        | anatomical side assignment、Hand handedness   |
| camera framing failure | CameraQualityScore、border risk               |
| degradation duration   | performance profile、degradation state        |
| gesture flicker        | MotionIntent、gesture label、stable duration  |

metrics は debug 画面に表示するだけでなく、replay 実行時の比較結果として保存できるようにする。

## 現行設計文書への反映方針

本書は research roadmap であり、現在有効な設計正本ではない。

実装へ進むときは、次の設計文書を更新する。

- [../../design/frontend/character/tracking.md](../../design/frontend/character/tracking.md)
    - FrameClock、CameraQuality、Reliability、ROI、Worker orchestration、degradation
- [../../design/frontend/character/motion.md](../../design/frontend/character/motion.md)
    - CanonicalUpperBodyState、TemporalStateEstimator、MotionIntent、AvatarMotionProfile、MotionSolver
- [../../design/frontend/character/overview.md](../../design/frontend/character/overview.md)
    - `sincro` mode の責務境界と最終アーキテクチャ
- `documents/design/frontend/character/vrm.md` または既存 VRM 関連文書
    - three-vrm pose 適用規約、VrmPoseComposer、optional bone fallback

該当文書が存在しない場合は、既存の `frontend/character/` 文書構成に合わせて追加または統合する。破壊的な責務変更や大きな設計判断を行う場合は、ADR を追加する。

## 実装判断の原則

- 生 landmark を controller / VRM 適用層へ漏らさない。
- debug で観測値、信頼度、canonical state、temporal state、retarget / solver、applied pose を分けて見えるようにする。
- solver、時系列推定、座標変換の品質改善は replay で比較する。配線整理、developer control の削除、文書同期は focused test と静的確認で検証する。
- 信頼度が低いときは突然止めず、振幅と blend weight を落とす。
- 大きい部位ほど安定、小さい部位ほど表現を許す。
- 手先の似ている感を優先し、奥行き、手首 roll、肘 pole は丸めてよい。
- VRM モデル差分は例外ではなく profile と fallback で扱う。
- three-vrm 層で不確実な観測値を解釈しない。
- `VrmPoseComposer` 以外に最終 bone pose の書き手を増やさない。
- まず再現可能性、次に安定性、最後に表現力を上げる。
