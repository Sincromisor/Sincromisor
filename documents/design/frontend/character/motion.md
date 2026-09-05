# フロントエンドのキャラクター動作

## 要約

- キャラクター動作は `CharacterBehaviorSnapshot` を入力に、頭部 / 目 / 顔 / 身体 / 腕を低振幅で合成する。
- `chat` では会話の存在感を優先し、`sincro` では顔 / 姿勢の変換を優先する。
- 各制御処理は MediaPipe の生値ではなく、動作の変換済みの VRM 向け値を読む。
- 本番実行時の現在のボーン / 表情 / ルート位置書き込み順序はタスク成果物
  [runtime-motion-ownership-map](../../../../tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md)
  を参照する。現時点では `VRMCharacterManager.update()` の本番書き込み順序を変更しない。
- 体幹 / 肩の姿勢合成処理所有移行計画はタスク成果物
  [torso-shoulder-composer-migration-plan](../../../../tasks/character-sincro-motion/task-260629225951-torso-shoulder-composer-ownership-migration-plan/artifacts/torso-shoulder-composer-migration-plan.md)
  を参照する。体幹 / 肩移行は腕姿勢合成処理適用フラグとは別段階で扱う。

## 対象範囲

- 対象:
    - 口形同期
    - 感情表情
    - 視線・まばたき
    - 待機 / 傾聴 / AI 発話ジェスチャー
    - 姿勢の変換の適用境界
- 非対象:
    - 追跡処理実行時
    - WebRTC シグナリング

## 責務

- `src/character/behavior`
    - `CharacterBehaviorState` と目 / 顔 / 頭部制御処理を置き、会話・VAD・視線由来の状態解釈を担当する。
- `src/character/retargeting`
    - `SincroFaceRetargeter` / `SincroPoseRetargeter` と動作の変換フレーム / 目標型を置く。
- `src/character/canonical`
    - 後段動作処理工程が共有する `CanonicalUpperBodyState` 契約を置く。
    - 保存対象は身体のローカル座標系の意味量に限定し、VRM ボーン回転、Three.js オブジェクト、MediaPipe ランドマークオブジェクトは含めない。
- `src/character/calibration`
    - `InitialSincroCalibrationSession` と段階評価を置き、初期較正の状態 / 再試行理由 / 標準化したスナップショット変換を担当する。
    - 評価入力は `ReliabilityMap`、任意 `CameraQualityScore`、任意 `CanonicalUpperBodyState`、`validDurationMs` に閉じ、MediaPipe 未加工のランドマークやブラウザカメラ API は読まない。
- `src/character/reliability`
    - 後続推定処理 / 再生 / 時系列状態が共有する `ReliabilityMap` v1 契約を置く。
    - MediaPipe 信頼度をそのまま制御重みにせず、関節 / 部位 / ジェスチャーごとの保存可能な信頼度スナップショットとして扱う。
    - 段階 8 以降の `PoseReliabilityEstimator` は `SincroPoseMotionSnapshot` と任意 `SincroHandMotionSnapshot` / `SincroFaceMotionSnapshot` / `GestureIntentObservation` / `CameraQualityScore`、任意 `previous.pose` / `previous.mediaTimeMs` / `previous.reliability`、呼び出し元指定の `mediaTimeMs`、`video` 大きさから `ReliabilityMap` を作る純粋な関数とする。Hand / Face / ジェスチャー入力が省略された旧経路では該当格納先は姿勢のみの仮の値を維持し、入力があるフレームだけ `source: "hand"` / `"face"` / `"gesture"` の信頼性を埋める。
    - Face 信頼性の ROI コンポーネントは `face.roi.confidence` を正本にし、Face 中心整合性は追跡処理側の全画面代替処理判断に閉じる。Hand 信頼性の ROI コンポーネントは `calculateRoiConsistency({ expected: hand.roi.referencePoint, observed: hand.fullFrameWrist })` を正本にする。
    - ROI 理由はスナップショット自体が無い旧経路では既存仮の値、スナップショットはあるが `roi` フィールドが無い旧スナップショット / 旧再生ログでは `not_available_in_pose_snapshot`、ROI メタデータの失敗警告では `roi_missing` / `roi_inconsistent` に固定する。`roi_missing` と `not_available_in_pose_snapshot` は同じ欠損に同時付与しない。
    - ジェスチャー信頼性は `gestureReliabilityEstimator.ts` が `GestureIntentObservation`、Hand スナップショット、前回 `ReliabilityMap.gesture`、CameraQualityScore、呼び出し元指定 `mediaTimeMs` から作る。`components.tracking` は左右最上位ラベル信頼度の最大値、`side` は Hand 左右の割り当てとの整合、`roi` は Hand ROI メタデータ、`cameraQuality` は既存カメラ情報の項目を読む。`temporal` は `clamp(stableDurationMs / 160, 0, 1)` で、有効な 0〜159ms は `unstable_observation`、160ms 以上は理由なし、ジェスチャー欠損だけ `no_observation` とする。`finalWeight` は5 コンポーネントの最小値で、別建て上限は持たない。`schemaVersion` は v1 を維持し、旧ログの時系列スコア 0 / `no_observation` も解析する。
- `src/features/gaze/handTracking`
    - 段階 8 の HandLandmarker 観測層を置く。
    - `SincroHandMotionSnapshot` は手のひらの法線・方向、指の曲げ / 指の開き、親指の対向動作、開き具合、左右判定要約、ROI 観測値、全画面手首だけを保存する低次元契約であり、MediaPipe ランドマークオブジェクト、切り抜きオブジェクト、未加工のランドマークは持たない。
    - Hand 特徴量のスカラーと信頼度は `0..1` に値の制限し、手のひらタプルは正規化済み 3 要素タプルに固定する。ランドマーク欠損または信頼度 `< 0.2` の手開き具合は `unknown` とする。
    - Hand 手首は信頼性 / 手のひら / 指特徴量の材料であり、腕 IK の主目標にはしない。腕 IK 目標は `TemporalUpperBodyState` と `MinimalAvatarMotionProfile` から作る時系列橋渡し出力を主入力とし、時系列 / プロファイル / ソルバー測定値の欠損や橋渡し invalid/lost 時だけ `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` へ姿勢スナップショットによる代替処理する。
    - ジェスチャー Recognizer / MotionIntent は Hand スナップショットとは別の任意観測専用入力として扱い、Hand スナップショット自体へジェスチャー表示名は流さない。段階 9 の指ボーン適用は Hand スナップショットの低次元指特徴量と MotionIntent から意味に基づく動作のレイヤーを作る後段補助処理に閉じる。
- `src/features/gaze/trackingRuntime/roiTracking`
    - 段階 8 の Hand / Face 追跡処理入力境界として、Pose 手首 / 肩由来の ROI 矩形と切り抜き内の座標系の / 全画面座標変換を置く。
    - ROI 観測値は JSON 保存可能な `number`、文字列列挙値、通常のオブジェクト、`[number, number]` タプルだけで構成し、MediaPipe ランドマークオブジェクト、ImageBitmap / canvas、Three.js オブジェクト、クラスのインスタンスは含めない。
    - ROI 警告は ReliabilityMap の警告列挙値とは別型で保持する。動作処理工程は後続信頼性タスクの明示変換が入るまで ROI 警告を IK 重みや動作の変換重みに直接接続しない。
- `src/character/temporal`
    - 標準化した / 信頼性の後段で共有する `TemporalUpperBodyState` v1 契約を置く。
    - 保存対象は時系列状態、標準化した腕スカラー、身体のローカル座標系の手首 / 肘タプル、速度、復帰中混合に限定し、VRM ボーン回転、クォータニオン、IK ソルバー出力は含めない。
- `src/character/runtime/sincroMotionObserveOnlyPipeline.ts`
    - 本番 `sincro` 実行時の Face / Pose コールバックから任意 `CameraQualityScore`、
      `ReliabilityMap`、`CanonicalUpperBodyState`、`TemporalUpperBodyState`、`MotionIntentState` を計算し、
      `SincroMotionPipelineState` へ保存する観測専用サービスを置く。
    - `mediaTimeMs` は TrackerRuntime の映像フレーム時刻情報を優先し、欠損時だけ制御処理 / 受け取り側側の
      コールバック受信時刻を明示的に渡す。サービス / 推定処理内部では `performance.now()` を読まない。
    - 本サービスは VRM ボーン / 表情 / ルート位置、`VRMCharacterManager.update()` の制御処理
      呼び出し順序、`CharacterBehaviorSnapshot` 構造、`composerDryRun` を変更しない。試行姿勢合成処理と
      実適用は後続タスクの責務に残す。
    - 顔のみのコールバックは Pose が無い間 `not_computed` 要約に留め、旧姿勢のみのフレームは Face / Hand
      信頼性を仮の値として扱う。`CameraQualityScore` 欠損、ReliabilityMap 欠損、任意 ROI 欠損を
      本番コールバックの例外にはしない。
    - 本番 `sincro` の `SincroCameraQualityRuntime` は Pose コールバックでだけカメラ品質を生成し、
      `updatePose()` / `updateFace()` / `updateHand()` の下流再計算時に最新スコアを
      `createPoseReliabilityMap()` へ渡す。由来 `none` 相当の停止スナップショットではスコアを作らず、
      最新スコアと上限付きの時刻情報 / 姿勢サンプル履歴を再初期化して `camera_quality_missing` 代替処理を使う。
    - Degradation 中の顔のみのコールバックは状態を保持する時系列 / 意図推定処理を進めない。Pose コールバックが
      `mediaTimeMs` 付きで再到着したフレームだけ下流推定処理を進め、回復時は
      `TemporalUpperBodyState` の `recovering` または自然な姿勢代替処理状態を経由して急な姿勢変化を抑える。
    - 本番 `sincro` では Hand スナップショットを `onHandMotion` から `SincroMotionPipelineState.hand` へ保存し、ジェスチャースナップショットは `onGestureMotion` から `GestureIntentObservation` と診断 Console 要約へ正規化する。ジェスチャーコールバック単独では Pose / 標準化した / 時系列 / 意図を再計算せず、次の Pose / 信頼性更新で `ReliabilityMap.gesture` へ接続する。診断 Console へは Hand 利用可否、由来、ROI 警告、開き具合、信頼度と、ジェスチャー利用可否、左右最上位ラベル、信頼度、由来、警告、inferenceFps の要約だけを出す。未加工のランドマーク、切り抜きオブジェクト、Hand 手首座標、ジェスチャー未加工のカテゴリ一覧、左右判定の未加工オブジェクトは常時 UI スナップショットに保存しない。
    - Hand スナップショットは ReliabilityMap / MotionIntent / 指特徴量の観測専用入力に留める。腕 IK 目標は本番動作の変換で時系列橋渡し出力を主入力にし、時系列 / プロファイル / ソルバー測定値の欠損や橋渡し invalid/lost 時だけ `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` へ姿勢スナップショットによる代替処理する。Hand 手首で主目標も代替処理目標も上書きしない。
- `src/character/motionIntent`
    - 標準化した / 時系列 / 信頼性 / 手 / ジェスチャーの後段で共有する `MotionIntentState` v1 契約を置く。
    - 保存対象は左右腕と体幹の動作意図、信頼度 / 信頼性 / 表現量、入力由来、警告、ジェスチャー Recognizer 元のラベルの説明用フィールドに限定し、VRM ボーン回転、意味に基づく動作範囲制限、指ボーン回転は含めない。
    - `motionIntentEstimator.ts` は `MotionIntentEstimator` / `createMotionIntentState()` の既存 import 互換入口と公開型再公開だけを担当する。
    - `motionIntentEstimatorTypes.ts` は推定処理入力 / 設定、左右記憶、候補、フレームコンテキストの型境界を担当する。公開型は共通窓口から再公開する。
    - `motionIntentEstimatorConfig.ts` は既定時刻情報 / しきい値と正規化を担当し、しきい値の範囲補正を推定処理本体から分離する。
    - `motionIntentCandidateDetectors.ts` はジェスチャー / 顔の近く / 手振り / 動作代替処理の候補生成を担当する。
    - `motionIntentGlobalDetectors.ts` は拍手に近い動作、防御姿勢、左右入れ替わり警告など左右横断の観測判定を担当する。
    - `motionIntentSideState.ts` は追跡 / 未検出 / 代替処理 / 意味に基づく動作意図の左右状態組み立て処理と警告重複排除を担当する。
    - `motionIntentSideMachine.ts` は左右記憶、意味に基づく動作保持、待機期間、代替処理継続時間、候補安定化を担当し、候補生成とは分ける。
    - `createFingerCurlPoseLayer()` は `SincroHandMotionSnapshot`、`MotionIntentState`、完成版 `AvatarMotionProfile`、呼び出し元指定 `mediaTimeMs`、任意前回の指診断用スナップショットだけを入力にする。MediaPipe 未加工のランドマーク、ジェスチャー Recognizer 未加工の結果、VRM Object3D、元のボーンノードは読まない。
- `src/character/motionPostProcessing`
    - 段階 11 の後続後処理 / 軽量最適化が共有する `MotionPostProcessingResult` v1 契約を置く。
    - `sincro.motion-post-processing.v1` は補正対象を `CanonicalUpperBodyState`、`TemporalUpperBodyState`、`MotionIntentState` に限定する。VRM 正規化済み姿勢、VRM ボーン回転、IK クォータニオン、アバタープロファイル、MediaPipe 未加工の結果、Three.js 実行時オブジェクトは出力に含めない。
    - v1 実行時は `NoopMotionPostProcessor` だけを接続し、`processor: { id: "noop", version: "v1", mode: "disabled" }`、`warnings: ["processor_disabled"]`、`corrections: []`、`output: {}` を返す。入力標準化した / 時系列 / 意図は出力へ複製しない。
    - `MotionPostProcessingInput.mediaTimeMs` は呼び出し元指定を正本にし、補助処理 / 処理器内で `performance.now()` や `Date.now()` は呼ばない。
    - 段階 11 系列分類器基準は `MotionSequenceWindow` と `classifyMotionSequence()` に分ける。ウィンドウは `TemporalUpperBodyState`、`MotionIntentState`、`ReliabilityMap`、`SincroHandMotionSnapshot` だけを低次元サンプルとして保持し、MediaPipe 未加工のランドマーク、ジェスチャー Recognizer 未加工の結果、VideoFrame / ImageBitmap、Three.js 実行時オブジェクトは受け取らない。
    - `sincro.motion-sequence-window.v1` は最大 1200ms / 90 サンプルの短いウィンドウから左右ごとの意図遷移、意味に基づく動作保持、ジェスチャーちらつき、追跡消失、左右入れ替え疑わしい、手首速度符号反転、手開始・終了遷移を集約する。Hand 利用可否は系列特徴量専用で、`MotionPostProcessingResult.inputAvailability` へは写さない。
    - `sincro.motion-sequence-classifier.v1` は学習済み分類器ではなく規則に基づく基準とする。出力イベントは `wave_sequence`、`gesture_flicker`、`side_swap_anomaly`、`tracking_loss_anomaly`、`stable_semantic_hold` に固定し、`gesture_flicker` / `side_swap_anomaly` / `tracking_loss_anomaly` だけを補正として返す。
    - 系列分類器は補正専用補助処理であり、`MotionIntentEstimator.update()`、ライブ実行時、再生実行時の状態を自動で書き換えない。`wave_sequence` と `stable_semantic_hold` は観測イベントに留め、後処理 `output` は `{}` のままにする。
- `src/character/ik`
    - `SincroArmIkSolver` とソルバー疎通確認 / 制約 / 幾何計算 / 曲がる方向を置く。
    - `ArmPoleState` v1 は `"stable"`、`"uncertain"`、`"extended"`、`"lost"`、`"recovering"` の小文字列挙値とし、IK 曲がる方向解決処理が決定する。TemporalStateEstimator は VRM クォータニオン / IK 曲がる方向を扱わない。
    - 段階 11 制約付き IK 改善は `SincroArmIkSolver.solveRefined()` の開発者専用 / 明示的に有効化する API として置く。既定の `solve()` と本番実行時の姿勢適用は変更せず、motion-debug UI 切り替えも別タスクに残す。
    - 改善候補は元の手首を索引 `0` に固定し、以降は到達距離倍率、仰角補正量、奥行き倍率の決定的順序で最大 5 件だけ評価する。候補手首は奥行き倍率、仰角補正量、到達距離倍率の順に適用し、元の手首から腕長比 `maxTargetDeltaRatio` を超える候補は破棄する。
    - 改善コストは既存ソルバーの到達距離制限、曲がる方向理由コード、collisionAvoided、upper/lower クォータニオン制限、元のからの正規化済み差分だけを読む。評価中に `lastPoleDirection` は更新せず、選ばれた候補の肘の曲がる方向だけを最後にコミットする。
    - `SincroArmIkRefinementResult` は再生 / 単体テストで保存しやすい通常のオブジェクト診断用スナップショットとし、候補索引、コスト、拒否理由、選択済み / 元のコストを含める。本番接続、記録格納先、motion-debug 操作面への露出は後続タスクの責務とする。
- `src/character/vrmPose`
    - `VrmPoseComposer` と VRM 正規化済みローカル姿勢契約を置く。
    - v1 は腕周辺ボーンと体幹代替処理を対象にし、`leftUpperArm` / `leftLowerArm` / `leftHand`、`rightUpperArm` / `rightLowerArm` / `rightHand`、存在する場合の肩 / 指代替処理対応能力、`spine` / `chest` / `upperChest` の体幹配分を扱う。頭部 / 首 / 脚 / 表情はまだ姿勢合成処理へ移さない。
    - 入力層は `fallback`、`tracking`、`semantic`、`idle`、`style` の順に合成し、`limit` は層ではなく姿勢合成処理内部の最終制限 / 値の制限段階として扱う。
- `src/character/vrmCharacter`
    - 腕 / 脚 / 体幹 / 動作調停処理と `VRMCharacterManager` を置く。
- `FaceMorphController`
    - `telop_ch` 由来のモーラ / 母音で口形を駆動する。
    - `sincro` ではAI発話中だけモーラ / 母音の口形を優先し、それ以外はユーザー口形動作の変換を適用する。
    - AI発話中にモーラ / 母音が未着の場合は口形をニュートラルにし、ユーザー口形へ戻さない。
- `FaceEmotionController`
    - `expression_code` を VRM 表情にマップする。
- `EyeBehaviorController`
    - 視線表情または目ボーン代替処理で視線を制御する。
- `HeadBoneController`
    - 視線 / 動作の変換 / カメラ代替処理を元に首・頭部回転を適用する。
- `CharacterMotionOrchestrator`
    - 待機呼吸、傾聴姿勢、AI 発話拍に合わせたジェスチャー、動作方針を統括する。
- `ArmBoneController`
    - 待機ジェスチャーと任意姿勢の変換の腕補正を加算する。
    - `world_3d_ik` では `SincroArmIkSolver` が返すローカルクォータニオンを優先し、同じ腕の待機 / 発話ジェスチャーは競合させない。
    - 本番 `VRMCharacterManager.update()` では全面 `VrmPoseComposer` 適用が唯一の上半身の最終姿勢を書き込む処理である。全面適用利用不可フレームでも、この制御処理を腕切り戻し代替処理として自動実行しない。
    - 直接書き込み処理はロード直後の初期姿勢と独立した制御処理利用のために残す。診断 Console から `composerArmApplicationMode` を切り替える段階別の上書きパス、`composer_arm_application_*` 警告、選択済み腕上書きは削除済みである。
- `SincroPoseRetargeter`
    - 姿勢目標の信頼度検査、IK モード選択、平滑化、代替処理フレーム生成を担当する。
    - IK の数学は `SincroArmIkSolver` に委譲し、動作の変換処理自体は MediaPipe 目標と VRM リグ倍率の橋渡しに留める。
- `motion-debug`
    - `TrackerRuntime` / `SincroPoseTracker` / `SincroPoseRetargeter` / `SincroArmIkSolver` の本番経路を使う IK 調整専用ページ。
    - カメラプレビュー、Sincro 姿勢目標重ね表示、VRM 表示、動作の変換実行時スナップショットを同一画面に並べる。
    - `window.__SINCRO_MOTION_DEBUG__` から `startCamera()`、`loadVideoFixture()`、`setRetargetConfig()`、`waitForPoseDetected()`、`getSnapshot()`、`captureFrame()`、`startRecording()`、`stopRecording()`、`downloadRecording()`、`getRecordingState()` を呼べる。
    - 再生操作は同じウィンドウ API の開発者専用表示面とし、`loadRecording(fileOrText)`、`startReplay(options)`、`stepReplay(frameIndex)`、`stopReplay()`、`getReplayState()` を公開する。入力は非圧縮のNDJSON `string` または `File` に限定し、圧縮済み Blob import は扱わない。
    - ページ制御処理の実装境界は `MotionDebugApp` 共通窓口、`motionDebugVrmUrl.ts`、`motionDebugCameraRuntime.ts`、`motionDebugTrackerBridge.ts`、`motionDebugReplayRuntime.ts`、`motionDebugMetricsRuntime.ts`、`motionDebugWindowApi.ts`、`motionDebugSceneRuntime.ts` に分ける。カメラ / 固定データ後始末、再生停止、時系列 / 意図推定処理再初期化は実行時モジュールが既存の順序を維持し、`MotionDebugApi` の公開表示面は増やさない。
    - スナップショットパネルは `live`、`recording`、`replay`、`metrics` の閲覧画面モードを持つ。`camera`、`mediapipe`、`poseSnapshot`、`reliability`、`canonical`、`temporal`、`intent`、`postProcessing`、`solver`、`finalPose`、`applied`、`metrics` を層選択部品で切り替え、値あり / 未記録 / スキーマ無効 / 未実装 / 未計算を区別する。
    - `metrics` 層は再生フレームに `frame.metrics` がある場合、動作指標要約未計算でも保存済み指標 JSON を表示する。追跡処理処理時間の予算は `frame.metrics.tracker.budget`、順序を固定した機能低下方針は `frame.metrics.tracker.degradationPolicy`、ROI 一時停止 / 代替処理 / 省略の累積統計は `frame.metrics.tracker.roi` で確認する。計算済み要約では `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` も既存指標と同じ JSON 値として表示する。閲覧画面は再生指標に有効実行時性能プロファイルも添えて表示する。
    - 動作品質の回帰検証は `sincro.motion-qa-fixture-manifest.v1` 構成情報を入力にする開発者が確認できる検証基盤とする。構成情報固定データは P0 固定データ ID 部分集合、`logText` または呼び出し元取得処理経由の `logUrl`、任意基準、任意主観的な確認項目を持つ。部分集合実行を既定とし、P0 全件必須は `requireAllP0Fixtures: true` の場合だけ欠損固定データを不合格として補う。
    - 動作品質の回帰検証の判定は再生ログを `parseMotionDebugLogLines()` で読み、`calculateMotionMetricSummary()` と任意基準比較を固定データ単位で実行する。基準なしでは要約重大度を結果に使い、`not_available` 指標を警告以上にする。基準ありでは候補指標不合格、または `regressed` かつ重大度 changed を不合格、重大度 unchanged 回帰を警告とする。旧基準の欠損指標キーは `not_available` として補完され、固定データ警告に残す。
    - Motion 指標の外部 import 互換は `src/character/motionEvaluation/motionMetrics.ts` 共通窓口が担い、型、しきい値、フレーム解析処理、基準 / 追跡処理 / 時系列 / ソルバー / 意図計算処理、要約、比較は責務別モジュールに分ける。再生ログの保存契約と旧ログ代替処理は解析処理 / 要約側に閉じ、QA 回帰検証基盤から見える `calculateMotionMetricSummary()` / `compareMotionMetricSummaries()` の契約は変えない。
    - Composer 比較は `sincro.composer-comparison-summary.v1` 要約成果物として旧動作の変換実行時スナップショットと本番姿勢合成の試行結果を比較する。フレーム補助処理は `calculateComposerComparisonMetrics(input)` で、入力は `{ mediaTimeMs; retarget?; composerDryRun? }` の通常のオブジェクトに限定し、VRM Object3D / 正規化済みボーンノード / `THREE.Quaternion` インスタンスは保存境界へ出さない。再生解析処理は `frame.solver.poseRetargetRuntime` だけを正本にし、旧 `frame.solver.poseRetarget` は既存指標用格納先として残すが姿勢合成処理比較では代替処理由来にしない。現行記録の `poseRetargetRuntime` は `upperBody` を保存しないため、解析処理は `NEUTRAL_POSE_FRAME` を土台に `active`、`confidence`、`ikMode`、`fallbackReason`、`solverProbe`、`anchor`、`leftArm`、`rightArm` だけを上書きし、補完した `upperBody` は角度差分の対象にしない。
    - Composer 比較指標キーは `composerAngleDeltaDeg`、`composerAngularVelocitySpike`、`composerOwnedBoneConflictCount`、`composerSuppressionCount`、`composerMissingPoseFrameCount` に固定する。`composerAngleDeltaDeg` は旧動作変換の左右上腕・前腕のクォータニオンと姿勢合成処理 `finalPose` の `leftUpperArm`、`leftLowerArm`、`rightUpperArm`、`rightLowerArm` の測地距離最大値をフレーム値とし、要約は利用可能フレームの p95、しきい値は `{ pass: 12, warn: 25, fail: 45 }` deg とする。`composerAngularVelocitySpike` は姿勢合成処理 `clampedBones.reason === "angular_velocity"` の重複のないボーン数合計、しきい値は `{ pass: 0, warn: 2, fail: 5 }` 件数とし、フレーム間速度は再計算しない。`composerOwnedBoneConflictCount` は `owned_bone_conflict:` 警告の重複のない数合計、しきい値は `{ pass: 0, warn: 0, fail: 0 }` 件数とする。`composerSuppressionCount` は `suppressedLayers.length` 合計、しきい値は `{ pass: 0, warn: 30, fail: 120 }` 件数とする。`composerMissingPoseFrameCount` は動作の変換欠損、試行欠損、`status !== "available"`、結果欠損、比較対象ボーン 0 件を 1 フレームとして数え、しきい値は `{ pass: 0, warn: 1, fail: 3 }` 件数とする。5 指標はすべて `lower_is_better` で、要約重大度は最大重大度とする。
    - Composer 比較要約は `fixtureId`、`baselineSource`、`status`、`severity`、`metrics`、`warnings`、`unavailableReason?`、`generatedAtIso`、`inputs` を持つ。`status` は `available` または `comparison_unavailable` だけで、`inputs` には基準構成情報パス、再生ログパスの有無、姿勢合成処理試行結果の有無を通常のオブジェクトで記録する。基準構成情報が `source: not-captured` の場合は実角度差分を捏造せず、`comparison_unavailable`、`severity: "warn"` 以上、`unavailableReason: "baseline_not_captured"` とし、5 指標すべてを `not_available` / 警告以上にする。取得済み再生でも `poseRetargetRuntime` または姿勢合成処理試行が全フレームで欠損する場合は `unavailableReason: "retarget_or_composer_not_recorded"` とし、旧ログ / 試行欠損を暗黙合格にしない。既存 `frame.finalPose.schemaVersion = "sincro.vrm-pose-composer-result.v1"` は motion-debug の finalPose 層であり、状態付き本番試行結果ではないため、姿勢合成処理比較解析処理はこれを `composerDryRun.status = "available"` へ昇格しない。比較は機能フラグ適用タスクの判断材料であり、この要約だけで実適用の合否を自動決定しない。
    - 本番 `simple-vrm` / `sincro` の再生基準は `tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md` を索引にし、後続比較では構成情報の `source` を確認して実機基準、人工的な、not-captured を混同しない。指標要約は `calculateMotionMetricSummary()` の `sincro.motion-metrics.v1` を使い、固定データ ID は現行 `MOTION_P0_FIXTURE_IDS` に合わせる。
    - 主観的な QA は構成情報の `subjectiveChecklist` を回帰結果へそのまま出力するだけに留める。項目は `natural`、`stable`、`intentReadable`、`noBreakage` で、機械判定には使わない。
    - `window.__SINCRO_MOTION_DEBUG__.runQaRegression(config)` は読み込み済み記録 1 件を構成情報部分集合に包んで実行する。`fixtureId` は設定指定を優先し、無ければ読み込み済み記録構成情報の `source.fixtureId` が P0 固定データ ID の場合だけ採用する。解決できない場合は `fixture_id_required` を返し、`neutral-10s` への暗黙代替処理はしない。
    - 段階 11 の最適化候補報告は `sincro.motion-optimization-candidates.v1` をスキーマバージョンとする開発者が確認できる成果物であり、`MotionQaRegressionResult` と任意再生フレームから決定的に作る。`generatedAtIso` は呼び出し元指定を正本にし、候補抽出補助処理内で現在時刻は読まない。
    - 候補目標は指標キーだけで固定分類する。肘 / ソルバー / 到達距離制限系は `constrained_ik_refinement`、中立揺らぎ / 回復急変 / 追跡消失系は `temporal_correction`、ジェスチャーちらつき / 意味に基づく動作代替処理 / 待機期間抑制は `gesture_sequence_classifier`、左右入れ替え / 無効意図は `anomaly_detector`、追跡処理予算 / 欠落したフレーム / 機能低下 / ROI 一時停止は `performance_policy`、その他と `not_available` だけの警告固定データは `do_not_optimize` にする。
    - `performance_policy` は追跡処理機能低下方針の調整候補であり、段階 11 の学習済み後処理対象にはしない。報告には残すが手動ジェスチャー表示名や学習済み補正データセットの要求には接続しない。
    - 候補報告は失敗を段階 11 の調査先へ振り分けるだけで、実行時補正、`MotionPostProcessingResult.corrections` 生成、モデル学習、データセット公開、外部計測情報送信は行わない。
    - `window.__SINCRO_MOTION_DEBUG__.analyzeOptimizationCandidates(config)` は読み込み済み記録 1 件に対して既存 `runQaRegression(config)` を先に実行し、成功時だけ候補報告を返す。読み込み済み記録が無い場合は `no_recording_loaded`、固定データ ID が解決できない場合は `fixture_id_required` を `runQaRegression(config)` と同じ意味で返す。
    - 段階 10 の初回動作品質の回帰検証は再生ログ / 人工的なログを対象にし、実動画固定データ資材や PNG / バイナリ成果物は追加しない。映像固定データの再推論 E2E と主観的な QA フォーム UI は別タスクの対象に残す。
    - ジェスチャー / Hand / Face ROI は任意低頻度合格であり、順序を固定した機能低下方針 v1 では `"gesture-reduced-fps" -> "optional-pass-reduced-fps" -> "roi-hand-paused" -> "pose-reduced-fps" -> "face-only" -> "comfortable-idle"` の順で段階的に退避する。一時停止中もジェスチャー未検出スナップショット、Hand 未検出スナップショット、全画面 Face スナップショットは更新されるため、motion-debug / 信頼性は古くなった、未検出、一時停止を区別できる。
    - `ignorePerformanceFallback` は `face-only` / `comfortable-idle` への自動遷移だけを抑制する。頻度低下と ROI 一時停止段階、`degradationPolicy.stage`、`reasonCodes`、`effectiveCadence` は motion-debug 指標層へ出続ける。
    - `reliability` 層はライブスナップショットの `ReliabilityMap` を最優先し、無い場合は保存済み `frame.reliability`、さらに無い旧ログでは `frame.poseSnapshot` から再計算した姿勢のみの信頼性を表示する。`RESERVED_PHASE_1_LAYERS` ではなく実装済み層として扱い、`poseSnapshot` も無いフレームだけ `not_recorded` にする。
    - 保存済み `frame.reliability` は `parseReliabilityMap()` で検証し、有効な場合は保存値をそのまま表示する。無効な場合も再生失敗にはせず、`parseStatus: "invalid"`、解析エラー、未加工値を `available` 層値として表示する。
    - `MotionDebugSnapshot.hand` と `frame.hand` は任意 Hand スナップショット格納先として扱う。再生閲覧画面の信頼性層は保存済み `frame.reliability` を正本にし、旧ログに Hand / Face 信頼性が無い場合だけ姿勢のみの代替処理を使う。再生時に未加工 MediaPipe 結果や欠損手スナップショットから信頼性を再推定しない。
    - `canonical` 層は再生フレームの `frame.canonical` を優先し、保存値がない場合だけライブスナップショットの `canonical` へ代替処理する。有効標準化したは `schemaVersion`、`timestamp.mediaTimeMs`、左右腕特徴、`source`、`warnings`、`outOfRangeFields`、`calibration.id` を JSON 値として確認できる。無効標準化したは再生失敗にせず、`parseStatus: "invalid"` と解析エラー要約を `available` 層値として表示する。
    - `temporal` 層は再生フレームの保存済み `frame.temporal` を最優先し、保存値がないライブスナップショットでは最新時系列を表示する。再生フレームに `frame.temporal` が無い旧ログはライブ再計算で隠さず `not_recorded` とする。保存済み時系列は `parseTemporalUpperBodyState()` で検証し、無効な場合も再生失敗にはせず、`parseStatus: "invalid"`、解析エラー、未加工値を `available` 層値として表示する。
    - `intent` 層は再生フレームの保存済み `frame.intent` だけを正本にする。旧ログで `frame.intent` が無い場合は `not_recorded` とし、ライブスナップショットから再推定しない。保存済み意図は `parseMotionIntentState()` で検証し、有効な場合は `MotionIntentState` を表示、無効な場合は再生失敗にせず `parseStatus: "invalid"`、解析エラー、未加工値を無効層値として表示する。
    - `postProcessing` 層は再生フレームの保存済み `frame.postProcessing` だけを正本にする。旧ログで `frame.postProcessing` が無い場合は `not_recorded` とし、ライブ無処理再計算では隠さない。保存済み後処理は `parseMotionPostProcessingResult()` で検証し、有効な場合は `MotionPostProcessingResult` を表示、無効な場合は再生失敗にせず `parseStatus: "invalid"`、解析エラー、未加工値を無効層値として表示する。
    - motion-debug ライブ / 記録実行時は v1 では無処理後処理だけを実行し、`frame.postProcessing` には `processor_disabled` 結果を保存する。補正が無いフレームでは標準化した / 時系列 / 意図の実値を後処理 `output` に二重保存しない。
    - `solver` 層は `value.phase6`、`value.phase7`、`value.phase9` の内訳の状態を持つ。段階 6 は `frame.solver.phase6`、段階 7 は `frame.solver.phase7`、段階 9 は `frame.solver.phase9` を正本にし、旧ログの `frame.solver.poseRetarget` / `frame.solver.poseRetargetRuntime` は保持するが段階 6 / 段階 7 / 段階 9 スナップショットとしてはライブ再計算しない。
    - 再生閲覧画面の `solver` 外側状態は、`phase6`、`phase7`、`phase9` がすべて `not_recorded` の場合だけ `not_recorded` とする。いずれか 1 つでも `available` または `invalid` なら外側状態は `available` とし、欠損 / 無効は内訳の状態に閉じる。
    - 保存済み `phase6` は `parseMotionDebugPhase6SolverSnapshot()` で検証し、未知 `schemaVersion`、非有限数値、未知の列挙値、実行時オブジェクト風値は `phase6.status = "invalid"` として表示する。
    - 保存済み `phase7` は `parseMotionDebugPhase7Snapshot()` で検証し、`profile` は `parseAvatarMotionProfile()`、`onlineCalibration` は `parseOnlineSincroCalibrationState()`、`initialCalibration` と `activeCanonicalCalibration` は段階 7 スナップショット境界の厳格な検査スキーマで検証する。旧ログに `phase7` がない場合は `phase7.status = "not_recorded"` とし、スキーマ違反時もログ読み込み自体は失敗させない。
    - 保存済み `phase9` は `parseMotionDebugPhase9SemanticSnapshot()` で検証し、旧ログに `phase9` がない場合は `phase9.status = "not_recorded"`、スキーマ違反時は `phase9.status = "invalid"` とし、スキーマ違反時もログ読み込み自体は失敗させない。
    - `finalPose` 層は `frame.finalPose.schemaVersion = "sincro.vrm-pose-composer-result.v1"` の姿勢合成処理結果スナップショットを正本にする。旧ログで `frame.finalPose` が無い場合は再生失敗ではなく `not_recorded` とし、スキーマが壊れている場合だけ `invalid` 層にする。
    - `recording` モードはフレーム件数、継続時間、圧縮、圧縮代替処理、機密情報を除去済みのカメラ設定の有無を表示する。
    - `replay` モードは再生モード、現在のフレーム、由来時刻、決定性確認結果、最新 `poseRetargetRuntime` 要約を表示する。
    - `metrics` モードは `calculateReplayMetrics(config)` が返した `MotionMetricSummary` を表で表示し、指標キー、値、状態、重大度、しきい値、基準比較を確認できる。`not_available` 指標は合格色にしない。
    - `startRecording()` はライブカメラ / 映像固定データ起動後だけ成功し、`MotionDebugApp` が全面構成情報を生成して `MotionDebugRecorder` に渡す。
    - `downloadRecording()` は停止済み記録処理から NDJSON / gzip NDJSON / Brotli 要求代替処理の Blob を作り、DOM ダウンロードリンクは `motion-debug` ページ側で生成する。
    - `pose-snapshot` 再生は `frame.poseSnapshot` を `CharacterBehaviorState.applyPoseMotion()` 相当の入口へ流し、ライブカメラと同じ `VRMCharacterManager.update()` 内で `SincroPoseRetargeter.retarget()` を呼ぶ。
    - `final-pose-playback` 再生はソルバー後の保存済みフレームを再描画 / プレビューするための予約モードであり、動作の変換 / ソルバーは再実行しない。v1 ログで `frame.finalPose` が欠落する場合は `missing_final_pose` を返す。
    - `mediapipe-raw-result` 再生は v1 ログの任意 `frame.mediapipe` 格納先を読み、Pose / Hand / Face / ジェスチャーの未加工の結果通常のオブジェクトを既存解析処理 / 正規化処理境界へ通して正規化済みスナップショットを再生成する。`applyRawResult` コールバックが無い呼び出し元では `unsupported_mode`、未加工格納先欠損では `missing_mediapipe_raw_result`、格納先スキーマ違反では `parse_error` を返し、`pose-snapshot` へ暗黙代替処理しない。
    - 未加工再生のジェスチャーは既存正規化処理で `SincroGestureMotionSnapshot` にした後、ライブと同じ
      `toGestureIntentObservation()` を直接通して再生から再計算した `MotionIntentEstimator` へ渡す。未加工カテゴリオブジェクトと
      保存済み `frame.intent` は再計算の入力に使わない。ジェスチャー格納先欠損 / 未検出は観測値なし、スキーマ無効は
      既存 `parse_error` のままとし、この接続専用警告は追加しない。
    - 再生から再計算した時系列 / 意図ヒステリシスは自動再生と隣接前方段階だけで維持する。同一フレームの再適用、
      フレーム省略、後方移動は段階適用前に再初期化し、停止と別ログ読み込みでも従来どおり再初期化する。閲覧画面の保存済み
      意図層は引き続き `frame.intent` を正本とし、未加工再生の再計算結果で保存値の欠損を補完しない。
    - `frame.mediapipe` は `sincro.motion-debug-log.v1` の任意格納先として後方互換に追加する。記録は直列化処理が対応した格納先だけを保存し、MPMask、ImageBitmap、VideoFrame、切り抜きオブジェクト、MediaPipe クラスのインスタンスはログ / 再生結果に保持しない。映像再推論再生は対象外で、保存済み未加工の結果だけを再生入力にする。
    - 診断 Console と同じ動作の変換設定 / 実行時スナップショットを内部的に更新するが、RTC / チャット / テロップは起動しない。
- `SincroArmIkSolver`
    - VRM 正規化済み腕ボーン列の中立姿勢のクォータニオン、腕長、肩幅、曲がる方向をロード時に測定する。
    - 肩相対の手首目標と肘の曲がる方向目標から upper/lower 腕のローカルクォータニオンを返す。
    - 到達不能目標は腕長内へ値の制限し、中立からの最大角で急な反転を抑える。
    - 肩の持ち上げ / 開く / 奥行き、前腕差分、肘の曲がる方向反転をソルバー側の制約として制限する。
    - `ArmPoleState` は入力時系列状態、肘屈曲、目標到達比率、候補曲がる方向と前回の / 初期姿勢の曲がる方向の内積から決める。`lost` 入力は `"lost"`、`recovering` 入力は `"recovering"`、`elbowFlexionRad < 0.18` または目標到達比率 `> 0.96` は `"extended"`、候補必須拒否は `"uncertain"`、それ以外は `"stable"` とする。
    - 曲がる方向混合は状態ごとに測定済み / 前回の / 待受代替処理を選ぶ。`"stable"` は測定済み、`"uncertain"` は前回の 70% / 待受代替処理 30%、`"extended"` は前回の 50% / 待受代替処理 50%、`"recovering"` は `recoveringBlendProgress` で前回のから測定済みへ復帰、`"lost"` は前回の 100% とする。前回のが無い場合は初期姿勢の曲がる方向を前回のとみなす。
    - 候補と前回の / 待受投影済み曲がる方向の内積が `poleFlipDotThreshold` 未満なら理由コード `pole_flip_rejected` と曲がる方向重み倍率 `0.68` を返す。内積が `poleFlipDotThreshold <= dot < 0.18` なら `pole_uncertain_downweighted` と曲がる方向重み倍率 `0.82` を返す。ソルバーの最終 `constraint.weightScale` は既存制約重みと曲がる方向重み倍率の乗算とする。
    - 頭部球と chest 楕円体の軽量侵入禁止領域で、手目標と前腕区間の深い貫通を抑える。
    - 制約 / 衝突発火時は目標の押し戻しと IK 重み減衰を優先し、入力目標の品質補正や外れ値除去は持たない。
    - `SincroArmIkConstraintSnapshot` は既存 `reasons`、`jointLimited`、`poleStabilized`、`collisionAvoided`、`weightScale`、`targetPushDistance` に加え、任意 `poleState`、`reasonCodes`、`angularVelocityClamped`、`wristRollDamped`、`wristRollInfluence` を持つ。`reasonCodes` は曲がる方向必須拒否 / 推奨重みの低減を含む開発者が確認できる理由コードの重複なし配列として扱う。
    - `wristRollInfluence` は IK 目標から `0..1` 値の制限してスナップショットに保存するだけに留める。前腕 / 手首ねじれ分配、手首ロール減衰、角速度制限の最終クォータニオン反映は段階 6 姿勢合成処理側で完成させる。
- `VrmPoseComposer`
    - `VrmNormalizedLocalPose` は `VRMHumanBoneName` キーの通常のクォータニオンオブジェクトとし、`THREE.Quaternion` インスタンスは計算中だけ使う。
    - `ownedBones` は姿勢合成処理順序の初出順で重複のない出力対象ボーンとし、重複所有は `owned_bone_conflict:<bone>` 警告に残す。追跡層の IK クォータニオンが同じ腕のボーンを所有している場合、待機 / 発話ジェスチャー相当の加算はそのボーンだけ `tracking_owns_bone` として抑制する。
    - `semantic` 層は `MotionIntentState` から作る開発者が確認できるな意図表現層とし、追跡姿勢の後、待機 / 演出の前で部分上書き / 加算として扱う。同じ `upperArm` / `lowerArm` / 手ボーンを追跡層が所有している場合、意味に基づく動作メタデータの `intentConfidence` が `0.65` 未満ならそのボーンだけ `semantic_conflict` として抑制する。メタデータが無い意味に基づく動作のレイヤーは信頼度 `0` とみなす。
    - 意味に基づく動作のプリセット ID は `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`soft_clap_like`、`lost_to_comfort` に固定する。v1 の意味に基づく動作の姿勢は `upperArm` / `lowerArm` / 手相当の VRM 人型ボーンクォータニオンだけを出し、spine / chest / 頭部 / 表情 / 指のボーン列全体は所有しない。
    - 指の曲げ意味に基づく動作のレイヤーは腕意味に基づく動作のプリセットとは別に `id: "finger-curl:<side>"`、`kind: "semantic"`、`blendMode: "additive"` として生成する。所有ボーンは `AvatarMotionProfile.capabilities.fingerChains` で存在が確認できる親指 / 索引 / 中指 / 薬指 / 小指の指のボーン列だけに限定し、`upperArm` / `lowerArm` / 手 / 体幹 / 頭部は所有しない。
    - 指グループは `thumb`、`index`、`middle`、`ringLittle` に固定する。`ring` と `little` は v1 では同じグループ曲げを使い、個別意味に基づく動作意図は作らない。`open / half / closed / unknown` 開き具合は指の曲げ欠損時だけ代替処理として使い、`unknown` は前回のデバッグの左右と時刻差が有効な場合だけ保持する。
    - 指の曲げ配分は `AvatarMotionProfile.fingers.curlDistribution` を正本にし、`proximal + intermediate + distal` が `1.0 ± 0.001` から外れる場合は `{ proximal: 0.5, intermediate: 0.3, distal: 0.2 }` に戻して警告を残す。欠損ボーン列では存在ボーンの元重みだけを合計して正規化し、基部のみは曲げ全量を入れるが角度制限を通常の `0.65x` に下げる。
    - 指姿勢軸は v1 固定とする。曲げはローカル `+X` 軸に `-angle`、指の開きはローカル `+Z` 軸に左 `+angle` / 右 `-angle`、親指の対向動作はローカル `+Y` 軸に左 `+angle` / 右 `-angle` を入れる。合成順は `curl -> splay -> thumbOppose`、実装上のクォータニオンは `final = oppose * splay * curl` とし、`THREE.Quaternion` インスタンスは層 / 診断用スナップショットに残さない。
    - `MinimalAvatarMotionProfile.optionalBones` を読み、欠損している手 / 指ボーンは最終姿勢へ出さない。欠損肩への補正は `solverDefaults.shoulderDamping` で減衰して `upperArm` へ分配する。
    - 体幹代替処理補助処理は完成版 `AvatarMotionProfile.torso.distribution` を正本として体幹差分クォータニオンを `spine` / `chest` / `upperChest` に分配する。プロファイル配分が非有限、負の、または合計 `1.0 ± 0.001` から外れる場合は対応能力既定へ戻し、警告コードは `invalid_torso_distribution_profile_defaulted` だけを使う。
    - 対応能力既定配分は `spine+chest+upperChest` で `{ spine: 0.25, chest: 0.40, upperChest: 0.35 }`、`spine+chest` で `{ spine: 0.35, chest: 0.65, upperChest: 0 }`、それ以外で `{ spine: 1, chest: 0, upperChest: 0 }` とする。補助処理は存在する体幹ボーンだけを `ownedBones` に含め、姿勢合成処理は欠損 `upperChest` を `missing_optional_bone` として抑制する。
    - 最終制限 / 値の制限段階はクォータニオン正規化と角速度制限フックを持つ。角速度制限は `previousFinalPose` と `deltaSeconds > 0` がある場合だけ実行し、既定値は `720deg/sec` とする。
    - v1 は開発者専用パスとして motion-debug / 補助処理から同じ入力で呼べる契約を固める段階であり、本番の `ArmBoneController` / `CharacterMotionTorsoApplier` ボーン書き込みや `VRMCharacterManager.update()` の順序は変更しない。motion-debug は記録 / ライブスナップショット用に追跡層由来の姿勢合成処理結果を生成し、`finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を保存・表示する。
    - 本番 `sincro` 実行時では `src/character/runtime/sincroVrmPoseComposerDryRun.ts` の試行サービスが `VRMCharacterManager.update()` 内で `composeVrmPose()` を観測専用実行する。入力は最新 `SincroPoseRetargetFrame`、`AvatarMotionProfile` / `MinimalAvatarMotionProfile`、サービスが保持する任意前回の最終姿勢、`deltaSeconds` に限定し、生成層は代替処理と追跡だけにする。意味に基づく動作 / 指層は後続の適用機能フラグで所有境界を確定するまで混ぜない。
    - 本番試行結果は `{ status: "available" | "not_ready" | "invalid_input" | "missing_profile"; result?: VrmPoseComposerResult; warnings: string[] }` とし、`status !== "available"` では `result` を持たない。利用可能結果の `finalPose` は次フレームの角速度制限入力としてだけ保持し、診断 Console には状態、警告、抑制済み層、制限済みボーンの要約を表示する。
    - `face-only` / `comfortable-idle` などで最新動作の変換フレームが無いフレームは `not_ready` として扱い、前回
      `available` の `finalPose` を現在フレームの適用候補として返さない。古い `finalPose` は角速度
      値の制限の内部入力にだけ使い、実 VRM 適用や診断 Console の現在の結果には昇格させない。
    - 試行は `vrm.humanoid.setNormalizedPose()`、正規化済みボーンノードの `rotation` / `quaternion`、表情、ルート位置を更新しない。既存制御処理呼び出し順と `vrm.update(deltaSeconds)` の位置も変更しないため、本番表示は従来の直接ボーン書き込みを正本に保つ。
    - 任意ボーン代替処理の検証結果はタスク成果物
      [optional-bone-fallback-vrm-verification](../../../../tasks/character-sincro-motion/task-260629225957-composer-optional-bone-fallback-vrm-verification/artifacts/optional-bone-fallback-vrm-verification.md)
      を参照する。`default.vrm` と `aoi-1.0.7.vrm` は全面上半身対応能力として確認済みで、欠損
      `upperChest`、欠損肩、低下した指のボーン列は実資材ではなく人工的なプロファイル / 単体テストで確認済みである。実 VRM の欠損個体での見た目の確認は `setNormalizedPose(finalPose)` 適用前の残リスクとして残す。
    - 本番実行時の現行所有権 map はタスク成果物
      [runtime-motion-ownership-map](../../../../tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md)
      を正本にする。移行前の `move-to-composer` / `keep-controller-owned` / `needs-decision` 分類は設計本文へ重複展開しない。
    - `CharacterMotionTorsoApplier` の置き換え計画はタスク成果物
      [torso-shoulder-composer-migration-plan](../../../../tasks/character-sincro-motion/task-260629225951-torso-shoulder-composer-ownership-migration-plan/artifacts/torso-shoulder-composer-migration-plan.md)
      を正本にする。体幹 / 肩移行は腕姿勢合成処理適用フラグと別段階で進め、肩ボーン欠損時の `upperArm` 代替処理だけを境界確認点にする。
    - `vrm.humanoid.setNormalizedPose(finalPose)` への全面移行は後続タスクに残す。移行ゲートは、頭部 / 首 / 脚 / 表情の所有境界、motion-debug 最終姿勢再生、既存制御処理との二重書き込み排除、複数 VRM での値の制限 / 任意ボーン検証が揃うこととする。
- `sincroCcdIkProbe`
    - Three.js 公式アドオン `CCDIKSolver` と VRM 未加工・正規化済みボーンの相性を見るための PoC 診断。
    - 左腕元のスケルトンボーン列に対して 1回の反復による動作確認を行い、結果を診断 Console の `CCDIK PoC` に表示する。
    - 本番の姿勢の変換結果は変更しない。

## データ・状態

- `CharacterBehaviorSnapshot`
    - VAD 包む形式
    - 視線
    - AI 発話状態
    - 感情コード
    - 会話モード
    - faceMotion / poseMotion
    - 動作方針
- `SincroMotionPipelineState`
    - 本番 `sincro` 実行時の観測専用 / 試行用低次元動作処理工程状態として
      `src/character/runtime/sincroMotionPipelineState.ts` に置く。
    - `face`、`pose`、任意 `hand`、任意 `reliability`、任意 `canonical`、任意
      `temporal`、任意 `intent`、任意 `composerDryRun`、`updatedAtMs` を持つ通常のオブジェクトに固定する。
    - `CharacterBehaviorSnapshot` は既存どおり顔 / 姿勢 / VAD / AI 発話の集約点として維持し、
      標準化した / 時系列 / 意図を直接追加しない。`CharacterBehaviorState` への接続も後続
      観測専用タスクの責務に残す。
    - 実行時内部の現在値契約であり、保存境界ではないため `schemaVersion` と解析処理は持たない。
      再生 / 記録へ出す場合は既存 motion-debug ログの `frame.reliability`、`frame.canonical`、
      `frame.temporal`、`frame.intent`、`frame.finalPose` 格納先と各解析処理を使う。
    - 状態複製は Face / Pose / Hand / MotionIntent の既存複製補助処理を優先し、補助処理が無い
      下流格納先は防御的な複製で警告配列やタプルを後続変更から分離する。
    - THREE インスタンス、MediaPipe 未加工の結果、DOM、MediaStream、VideoFrame は状態に含めない。
- `SincroMotionObserveOnlySummary`
    - 診断 Console の `Sincro Motion` パネルに常時表示する小さい状態要約とする。
    - `reliability`、`canonical`、`temporal`、`intent` ごとに `available` / `not_computed` /
      `invalid_input`、短い理由、警告数を表示する。`SincroMotionPipelineState` 本体や巨大 JSON 出力は
      常時描画せず、詳細詳細確認は後続デバッグツール / motion-debug の責務に残す。
- `CharacterMotionConfig`
    - 動作倍率
    - 緩急付け
    - idle/listening/AI 発話振幅
- `SincroFaceRetargetSnapshot`
    - 頭部 / 目 / まばたき / 口の VRM 向け値
- `SincroPoseRetargetFrame`
    - 上半身 / 腕の加算回転と代替処理理由
    - 腕 IK は `SincroPoseTargetPointSnapshot.quality` と `ikWeight` を読み、弱い手首 / 肘では IK 強度を落として特徴量動作の変換と合成する。
    - `feature_only` は従来の低振幅 Euler 加算値のみを使う。
    - `screen_space_ik` は 2D 目標から Euler 加算値を作る軽量代替処理として残す。
    - `world_3d_ik` は `SincroPoseTargetPointSnapshot.world` の正規化済み目標を入力候補にし、VRM リグ倍率 / ボーン長 / 左右判定へ変換したうえでクォータニオンを出力する。
    - MediaPipe ワールド座標目標は入力映像と同じ左右を維持し、上下・奥行きを VRM 表示側へ反転する。Z は追跡処理揺れを考慮して弱めに使う。
    - `SincroPoseRetargetedArm.ikWeight` は診断 Console で全面 IK と弱い IK を切り分けるための実行時値。
    - `SincroPoseRetargetedArm.ikSolverMode` は `feature_only` / `screen_space_ik` / `world_3d_ik` の切り分けを診断 Console に表示する。
    - `SincroPoseRetargetedArm.constraint` は `joint_limited`、`elbow_pole_stabilized`、`head_collision_avoided`、`chest_no_go_zone`、`forearm_twist_limited` など、ソルバー側の安全性が効いた理由と重み倍率を表示する。
    - `solverProbe.ccdik` は外部ソルバー採用判断用の診断値であり、実際の腕姿勢には適用しない。
- `SincroRoiObservation`
    - Hand / Face Landmarker の前段で使う ROI 保存契約であり、`side`、`source`、`rect`、`confidence`、任意 `referencePoint`、`warnings` を持つ。
    - `rect` は全画面の正規化画像座標の中心形式に固定し、`centerX`、`centerY`、`width`、`height`、`clamped` を保存する。切り抜き内の座標系の点は `0..1`、全画面点も `0..1` の `[number, number]` タプルとする。
    - v1 は軸に平行な正方形 / 長方形のみを扱い、回転した切り抜き、`rotationRad`、手のひら基底、手首ロールは ROI 矩形に混ぜない。Hand / Face 結果後段の特徴量として別契約に渡す。
    - Pose 手首が有限で `quality !== "lost"` の場合だけ Hand ROI は `source: "pose-wrist"` になる。欠損時は throw せず `source: "none"`、`confidence: 0`、`roi_missing` 警告の観測値を返し、Poseのみ / 代替処理継続を妨げない。
    - Face ROI は左右肩中心と肩幅を主入力にする。Pose 未検出または shoulderWidth が有限の正数でない場合は `source: "none"`、`confidence: 0` の失敗観測値として扱う。
    - Hand 追跡処理は左 / 右の ROI が両方無効の場合だけ全画面代替処理を同一フレームで 1 回実行する。片側 ROI だけ無効な場合はその左右を未検出にし、反対側の有効 ROI 推論を継続する。
    - Hand 全画面代替処理の左右割り当ては復元後手首と Pose 手首の距離を主条件にし、同じ手結果の二重割当は拒否する。
    - ROI 矩形値の制限は左 / 上端 / 右 / 下端を範囲制限して中心 / 大きさを再計算する。`validateRoiRect()` の順序は有限確認、端範囲制限、最小大きさ確認、信頼度値の制限に固定する。
    - ROI 整合性は Pose 手首 / 顔期待する点と ROI 由来全画面点の距離からスコア `0..1` を返す。`roi_inconsistent` は ROI 契約の警告であり、ReliabilityMap へは後続タスクで明示的に写像する。
- `SincroFaceMotionSnapshot` の ROI メタデータ
    - Face ROI は頭部向き / 顔信頼性の入力品質を観測するためのメタデータとして、既存 `SincroFaceMotionSnapshot` に任意 `roi`、`source`、`warnings` を追加して扱う。別の Face ROI スナップショットは作らない。
    - `source` は `"roi"`、`"full-frame"`、`"full-frame-fallback"`、`"lost"` に固定する。既存動作の変換は `detected`、`confidence`、`headPose`、`blendshapes` を従来どおり読む。
    - ROI 切り抜きの FaceLandmarker 結果は切り抜き内の座標系の結果として扱い、`headPose.matrix` は従来どおり FaceLandmarker の変換行列数値配列だけを保存する。切り抜き内の座標系の顔ランドマーク全点、canvas、ImageBitmap、MediaPipe 未加工の結果は保存しない。
    - ROI が顔未検出の場合、または Pose 顔 ROI 中心と Face 結果中心の整合性スコアが `0` の場合は同一フレームで全画面代替処理を 1 回だけ使う。代替処理でも未検出なら `source: "lost"`、`fallbackReason: "face_not_detected"` とし、`roi_missing` または `roi_inconsistent` 警告を残す。
    - Worker / TrackerRuntime は Pose が実行されたフレームだけ Face ROI を試す。Pose 未実行フレームと顔のみ代替処理中は全画面 Face 追跡を続け、Face 動作の変換や頭部時系列の実行頻度を Pose 実行頻度に合わせない。
    - Face / ROI 専用信頼性は段階 8 で `ReliabilityMap.joints.head` / `parts.head` に接続済みである。Face 動作の変換の入力値は従来どおり `detected`、`confidence`、`headPose`、`blendshapes` を読み、ROI メタデータは信頼性 / デバッグ / 再生の説明材料に留める。
- `CanonicalUpperBodyState`
    - `sincro.canonical-upper-body.v1` をスキーマバージョンとする、JSON 保存可能な上半身契約。
    - motion-debug の `frame.canonical` 格納先にそのまま保存できる通常のオブジェクトとして扱い、再生 / 指標 / 時系列 / 意図 / IK が同じ名前・単位で読む。
    - 左右は `left` / `right` の解剖学的左右に固定し、カメラプレビューや画面鏡像の左右は表さない。
    - `torso.coordinateSystem` は `body_local` に固定し、`shoulderCenter`、`bodyRight`、`bodyUp`、`bodyFront`、`shoulderWidth`、`torsoScale`、`yawRad` を有限数値 / 3 要素タプルで保存する。
    - 体幹フレーム推定は `SincroPoseMotionSnapshot` の左右肩ワールド座標目標を最優先する。両肩の `world.hasWorldCoordinates` が true で、`normalizedX/Y/Z` が有限の場合だけ `shoulderCenter`、解剖学的右方向の `bodyRight`、`shoulderWidth` を姿勢由来として採用する。
    - 左右腰ワールド座標目標が同じ条件で有効な場合だけ `hipCenter` と `bodyUp = normalize(shoulderCenter - hipCenter)` を姿勢由来で作る。腰ワールド座標目標欠損時は `previous.torso.hipCenter` がある場合だけ引き継ぎ、ない場合は `hipCenter` を省略する。`calibration.torsoScale` は `torsoScale` 代替処理にだけ使い、人工的な腰中心は作らない。
    - `bodyFront` は `normalize(cross(bodyRight, bodyUp))` を候補にする。前フレームの `bodyFront` と内積プロダクトが負の場合は前フレームを維持し、`front_flip_rejected` 警告を付ける。前フレームがない場合は有効な Face ヨーから `normalize([sin(yawRad), 0, cos(yawRad)])` を手掛かりにし、手掛かりと逆向きの候補を反転して同じ警告を残す。
    - Face ヨーは `SincroFaceMotionSnapshot.headPose.yawDeg` をラジアン化して `yawRad` に保存する。Face 未検出、信頼度 `< 0.08`、または Face スナップショット欠損時はヨー手掛かりを使わず、`previous.torso.yawRad`、`calibration.neutralYawRad` の順に代替処理する。
    - 較正未指定時は `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` を使う。肩幅が姿勢由来で有効に取れたフレームでは、戻り値の `calibration.shoulderWidth` を同じ値へ更新し、再生 / 指標が同じスケールを参照できるようにする。
    - `arms.left` / `arms.right` は `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification` と部位付随情報を保存する。値域外の入力は解析時に拒否し、計算側が値の制限した場合だけ `outOfRangeFields` に元値と値の制限後の値を残す。
    - 標準化した腕特徴量は `SincroPoseMotionSnapshot` の肩 / 肘 / 手首目標と体幹フレームだけから抽出する。`reach` は身体のローカル座標系での肩と手首の距離を肩-肘 + 肘-手首の腕長で割った無次元値、`elevationRad` は身体のローカル座標系の方向 Y 成分のラジアン、`openness` は解剖学的左右方向を正にした `-1..1`、`forwardness` は身体の前方方向・MediaPipe ワールド座標 Z・2D 投影短縮を重み付き再正規化した `0..1`、`elbowFlexionRad` は伸び切り `0` から屈曲 `Math.PI` へ近づくラジアンとする。
    - `classification` は決定的規則で、`confidence < 0.15` を `unknown`、`openness < -0.25` を `crossed` 優先、`forwardness >= 0.62 && abs(openness) < 0.35` を `front`、`abs(openness) >= 0.45 && forwardness < 0.45` を `side`、`forwardness >= 0.35 && abs(openness) >= 0.25` を `diagonal`、それ以外を `unknown` とする。
    - 段階 4 時点では任意 `ReliabilityMap` を受け取った場合だけ、腕信頼度を `poseConfidence * sqrt(partWeight * minJointWeight)` で重みの低減する。`partWeight` は該当腕の `PartReliability.finalWeight`、`minJointWeight` は肩 / 肘 / 手首関節 `finalWeight` の最小値とする。
    - 腕信頼性が `lost` の場合は標準化した腕由来を `neutral`、信頼度を `0` にする。`suspect` は由来 `pose` の低信頼度観測として保持し、TemporalStateEstimator / MotionSolver が後続段階 5 / 6 で扱う。
    - 標準化した警告変換は `ReliabilityWarningCode` ではなく、該当腕の部位 / 関節 `components.side.reasonCodes`、`components.boneLength.reasonCodes`、`components.bodyScale.reasonCodes` を読む。`side_inconsistent` は `left_right_swap_suspect`、`bone_length_inconsistent` / `body_scale_jump` は `out_of_range` へ写す。
    - `head` は FaceLandmarker の `headPose.matrix` を主入力にし、16 要素の有限数値配列だけを通常観測としてヨー / ピッチ / ロールラジアンへ変換する。行列欠損時は `face_matrix_missing`、行列無効時は `face_matrix_invalid` を `head.warnings` と最上位 `warnings` に保存し、既存スナップショットの Euler 値へ低信頼度で代替処理する。
    - Face が未検出、`source: "lost"`、信頼度 `0`、または頭部信頼性の `parts.head` / `joints.head` が未検出か finalWeight `< 0.05` の場合、標準化した `head` は省略する。中立頭部や前回の頭部は標準化した層では捏造せず、一時欠損 / 予測済み / 復帰中は TemporalStateEstimator の責務に残す。
    - 任意 `ReliabilityMap` がある場合、頭部信頼度は `matrixOrEulerConfidence * sqrt(parts.head.finalWeight * joints.head.finalWeight)` で重みの低減する。Pose 鼻 / 耳 / 目代替処理は現行 Face / Pose スナップショットに頭部向き入力として保存されていないため、本契約では扱わない。
    - `calibration` は既定 / 初回 / 実行中 / 再生のスナップショットとし、未実装時も `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` を保存して再生の決定性を保つ。
    - `SincroPoseRetargetFrame` の VRM 加算回転、IK ソルバーのクォータニオン、AnimationMixer 出力は標準化した腕特徴量の入力にも標準化した状態にも入れず、動作の変換 / 最終姿勢の別格納先に分ける。
- `TemporalUpperBodyState`
    - `sincro.temporal-upper-body.v1` をスキーマバージョンとする、標準化した / 信頼性の後段で使う JSON 保存可能な時系列状態契約。
    - motion-debug の `frame.temporal` 任意格納先に保存する通常のオブジェクトとして扱い、再生 / 閲覧画面 / 指標 / 意図 / IK が同じ状態列挙値とスカラーを読めるようにする。
    - `TemporalPartState` は `"tracked"`、`"suspect"`、`"predicted"`、`"lost"`、`"recovering"` の小文字列挙値に固定する。取り組み計画上の大文字表記は文書上の呼称であり、保存値とログ境界では使わない。
    - `arms.left` / `arms.right` は `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification`、任意 `bodyLocalWrist` / `bodyLocalElbow`、速度、任意 `recoveringBlend` を保存する。
    - `head` は任意で、未観測フレームでは省略できる。保存する場合はヨー / ピッチ / ロールと角速度、部位付随情報、任意 `recoveringBlend` だけを持つ。
    - 値域は解析処理で固定し、`confidence` と `recoveringBlend.progress` は `0..1`、`stateAgeMs` / `observedAgeMs` は `>= 0`、腕スカラーと復帰中継続時間は契約の範囲外を `out_of_range` として拒否する。
    - `parseTemporalUpperBodyState()` は再生 / 閲覧画面境界の検証 API であり、未知 `schemaVersion` は `unknown_schema_version`、非有限数値 / 未知の列挙値 / 余分なキー / クラスのインスタンスは `invalid_state` として返す。
    - `TemporalUpperBodyState` は CanonicalUpperBodyState の時間方向の状態推定契約であり、VRM 正規化済み姿勢、IK 目標クォータニオン、AnimationMixer 出力は段階 6 以降の MotionSolver / VrmPoseComposer と `finalPose` 系格納先の責務に残す。
    - 段階 5 の `TemporalStateEstimator` v1 は `CanonicalUpperBodyState`、任意 `ReliabilityMap`、呼び出し元指定の `mediaTimeMs` から観測済みフレームの `TemporalUpperBodyState` を作る状態を保持する推定処理とする。推定処理内で `performance.now()` は呼ばず、`reset()` は前回の時系列状態、One Euro Filter、分類保持を破棄する。
    - v1 の腕状態遷移は観測済みフレームのみを扱う。標準化した腕信頼度 `>= 0.65` かつ信頼性腕部位と肩 / 肘 / 手首関節がすべて `tracked` の場合は `tracked`、信頼度 `0.05..0.65` または信頼性の最悪状態が `suspect` / `predicted` / `recovering` の場合は `suspect`、信頼度 `< 0.05` または信頼性最悪状態が `lost` の場合は `lost` とする。ReliabilityMap が欠損する旧ログ / 暫定フレームでは標準化した信頼度だけで判定する。
    - 信頼性集約は腕部位と肩 / 肘 / 手首関節の最悪状態を使い、優先順位は `lost > predicted > recovering > suspect > tracked` とする。ただし段階 5 観測済み推定処理は `predicted` / `recovering` を出力状態として生成せず、入力信頼性の両状態は `suspect` に変換する。
    - v1 のフィルターは腕スカラー (`reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`) と `bodyLocalWrist` に One Euro Filter を適用する。既定値は `minCutoff: 1.8`、`beta: 0.45`、`dCutoff: 1.0` で、`TemporalStateEstimatorConfig` から上書きできる。速度はフィルター後の値差分から計算する。
    - `TemporalPartMeta` の `confidence` はフィルター入力候補の標準化した腕信頼度、`source` は `tracked` / `suspect` で `canonical`、`lost` で `neutral` とする。`stateAgeMs` は同じ状態の継続時だけ `mediaTimeMs` 差分で加算し、`observedAgeMs` は `tracked` / `suspect` で `0`、`lost` で前回値へ差分を加算する。警告は低信頼度で `low_confidence`、未検出で `dropout`、分類保持で `classification_held`、無効 dt で `out_of_range` を重複なしで保存する。
    - 分類は候補が信頼度 `>= 0.35` で 160ms 以上連続した場合だけ更新する。保持中または信頼度 `< 0.35` では前回分類を維持し、初回 / 再初期化後は既定時系列腕の `side` を基点にする。
    - `dtMs <= 0`、`dtMs > 250`、非有限 dt のフレームはフィルター内部状態を更新せず、前回フィルター処理済み値を維持して速度を `0` にする。未検出フレームは標準状態の低信頼値をフィルターに投入せず、前回フィルター処理済み値、速度、状態・メタデータから一時欠損方針を適用する。
    - 腕が `lost` になってから `observedAgeMs <= 700` の間は、前回フィルター後スカラー / 身体のローカル座標系の手首と速度から等速度予測を行い、`state: "predicted"`、`source: "predicted"`、警告 `prediction_active` / `velocity_damped` を保存する。予測速度は `predictionVelocityDampingPerSec: 0.55` をフレーム `dt` に応じて毎秒減衰する。
    - `observedAgeMs > 700` で予測ウィンドウが終わった腕は、`state: "lost"`、`source: "comfortable"` として自然な姿勢姿勢へ退避する。自然な姿勢スカラーは `reach: 0.35`、`elevationRad: -0.25`、`openness: 0.15`、`forwardness: 0.15`、`elbowFlexionRad: 1.15`、`classification: "side"` に固定し、前回予測済み / フィルター処理済み値から `recoveringBlendMs` 既定 `260ms` で近づける。`openness` は左右反転しない正規化スカラーとし、身体のローカル座標系の手首 / 肘タプルを補う場合だけ x 方向を腕左右に合わせる。
    - Tracker 実行時の `comfortable-idle` 段階は自然な姿勢姿勢を直接生成しない。追跡処理はカメラ / Face 追跡を継続したまま Pose 代替処理と Hand 未検出スナップショット、`degradationPolicy` 理由を出すだけにし、自然な姿勢スカラーへの混合は TemporalStateEstimator、MotionSolver、VrmPoseComposer の責務に残す。
    - 未検出 / 予測済み / 自然な姿勢 / 復帰中後に腕信頼度が `>= 0.65` へ戻り、信頼性が追跡済みになった腕は `state: "recovering"`、`source: "mixed"` としてフィルター処理済み観測値へ復帰する。`recoveringBlend` は `from`、`progress`、`durationMs` を保存し、警告 `recovery_blend` を付ける。`recoveringBlendMs` は設定で上書きできるが `180..400` に制限する。
    - 復帰中中の 1 フレームあたりスカラー急変は `maxRecoveringAngleJumpRad: 15deg` 相当に制限する。`elevationRad` / `elbowFlexionRad` はラジアン値の制限、`reach` / `openness` / `forwardness` は各値域に同じ比率を掛けた値の制限を使う。予測 / 自然な姿勢代替処理 / 復帰中は左右腕ごとに独立して処理する。
    - 標準化した `head` が存在するフレームだけ、ヨー / ピッチ / ロールに腕と同じ `tracked` / `predicted` / `lost` / `recovering` 方針を任意に適用する。Face 行列と頭部信頼性の反映は標準化した層で済ませ、TemporalStateEstimator は標準化した頭部の有無、信頼度、ReliabilityMap の頭部状態から時系列一時欠損を扱う。
    - VRM クォータニオン、IK 曲がる方向、最終姿勢平滑化は TemporalStateEstimator では扱わず、段階 6 以降の MotionSolver / IK / VrmPoseComposer の責務に残す。
- `MotionIntentState`
    - `sincro.motion-intent.v1` をスキーマバージョンとする、標準化した / 時系列 / 信頼性の後段、意味に基づく動作の姿勢 / IK / 指ボーン適用の前段で使う JSON 保存可能な動作意図契約。
    - motion-debug の `frame.intent` 任意格納先に保存する通常のオブジェクトとして扱う。motion-debug ログスキーマでは `z.unknown().optional()` のまま保持し、ログ読み込み全体の互換性は壊さない。
    - `arms.left` / `arms.right` の `intent` は `"tracking"`、`"wave"`、`"pointing"`、`"thumbsUp"`、`"peace"`、`"nearFace"`、`"explain"`、`"clapLike"`、`"guarded"`、`"lost"`、`"fallback"` に固定する。保存値はローワーキャメルケースとし、`"thumbs_up"`、`"openPalm"`、ジェスチャー Recognizer の元のラベルは腕意図として保存しない。
    - `torso.intent` は `"neutral"`、`"leaning"`、`"turning"`、`"settling"` に固定する。v1 では腕と同じ意味に基づく動作ジェスチャー名を体幹に入れない。
    - `sourceGestureLabel` はジェスチャー Recognizer の元のラベルを説明用に保存する任意フィールドであり、`intent` の代替値にはしない。
    - `confidence`、`reliability`、`expressiveness` は `0..1`、`ageMs`、`stableDurationMs`、`cooldownRemainingMs`、`timestamp.mediaTimeMs` は有限かつ `>= 0` に固定する。
    - 警告コードは `"low_hand_reliability"`、`"low_pose_reliability"`、`"gesture_unstable"`、`"gesture_cooldown"`、`"wave_motion_missing"`、`"near_face_hold"`、`"left_right_swap_suspect"`、`"fallback_active"`、`"invalid_dt"` に固定する。
    - `parseMotionIntentState()` は再生 / 閲覧画面境界の検証 API であり、未知 `schemaVersion` は `unknown_schema_version`、範囲外数値は `out_of_range`、非有限数値 / 未知の列挙値 / 余分なキー / クラスのインスタンス / 関数 / Three.js 実行時オブジェクト風フィールドは `invalid_state` として返す。
    - 既定状態は呼び出し元指定の `mediaTimeMs` を保存し、左右腕を `intent: "tracking"`、`confidence: 0`、`reliability: 0`、`expressiveness: 0`、`source: "fallback"` にする。`performance.now()` は呼ばず、最上位警告には `fallback_active` を含める。
    - `MotionIntentEstimator` は `TemporalUpperBodyState`、任意 `ReliabilityMap`、任意 `SincroHandMotionSnapshot`、任意ジェスチャー観測値、呼び出し元指定 `mediaTimeMs` だけを入力にする。推定処理内で `performance.now()`、DOM、MediaPipe 未加工のランドマーク、VRM 姿勢、`AnimationMixer` は読まない。
    - 本番観測専用の処理工程は `SincroGestureMotionSnapshot` を直接 MotionIntent へ渡さず、`{ left?: { label; confidence }; right?: ... }` の `GestureIntentObservation` へ正規化してから `ReliabilityMap.gesture` と `MotionIntentEstimator.update({ gesture })` に渡す。`ReliabilityMap.gesture` は有効観測値がある場合 `source: "gesture"` とし、未知元のラベルでも意味に基づく動作意図への昇格とは分けて保存する。ジェスチャー任意合格が省略 / 未検出の場合だけ `source: "neutral"` 仮の値を返す。
    - ジェスチャー Recognizer は主制御器ではなく補助入力として扱う。v1 の元のラベル対応付けは `"Open_Palm" -> "explain"`、`"Pointing_Up" -> "pointing"`、`"Thumb_Up" -> "thumbsUp"`、`"Victory" -> "peace"`、`"Closed_Fist" -> "guarded"` に固定し、`"None"`、`"Thumb_Down"`、`"ILoveYou"`、未知表示名は意味に基づく動作意図にしない。
    - 信頼度検査は ReliabilityMap がある場合 `ReliabilityMap.gesture.finalWeight >= 0.70`、該当手部位 `>= 0.60`、指部位 `>= 0.45` を既定値とする。ReliabilityMap 欠損時は旧形式 / テスト入力としてジェスチャー信頼度と手左右信頼度を代替処理に使う。`MotionIntentEstimatorConfig.thresholds` 指定時だけ既定値を上書きする。
    - 最小継続時間 / 待機期間は左右ごとに持つ。既定値は `wave 400ms / 650ms`、`pointing 200ms / 500ms`、`thumbsUp 200ms / 500ms`、`peace 200ms / 500ms`、`nearFace 250ms / 300ms`、`explain 300ms / 400ms`、`clapLike 150ms / 800ms`、`guarded 250ms / 500ms`、`fallback 300ms / 0ms` とする。`timing` 設定は `wave` を含まず、手振りの継続時間 / 待機期間は `config.wave` だけで上書きする。
    - `wave` は `"Open_Palm"` 表示名だけでは発火しない。時系列手首の身体のローカル座標系の x 速度を最優先し、欠損時だけ前回 `hand.<side>Hand.fullFrameWrist[0]` との差分から画像速度を補う。`elevationRad >= 0.05`、1200ms 窓内の x 速度符号反転 2 回以上、身体のローカル座標系の x `abs >= 0.05` または画像 x `abs >= 0.12`、最小継続時間、待機期間終了をすべて満たす場合だけ `wave` にする。`opennessPerSec` は手振り判定に使わない。
    - `nearFace` は Face 外接矩形を再解釈せず、時系列腕の `classification === "front"`、`elevationRad >= 0.20`、`forwardness >= 0.45`、手信頼度 `>= 0.45` の近似条件で判定する。`clapLike` は左右手検出済み、両手首の 2D 距離 `<= 0.16`、左右手首 x 速度が対向している場合だけ候補にする。
    - `guarded` は腕分類 `crossed`、左右手首 2D 距離 `<= 0.18` かつ左右どちらかの `forwardness >= 0.35`、または信頼性 / Hand 警告の `side_inconsistent` で候補にする。`side_inconsistent` 後は既定 500ms の間、前回意味に基づく動作意図を同じ左右に保持し、`left_right_swap_suspect` を付ける。
    - 手 / 姿勢未検出時は時系列腕状態が `predicted` / `recovering` なら前回意味に基づく動作意図を既定 500ms まで保持し、その間 `fallback_active` は付けない。`observedAgeMs > 700` または `state === "lost" && confidence < 0.15` の左右は `lost` にする。代替処理判定の体幹信頼度は `reliability.parts.torso.finalWeight` を優先し、欠損時は左右時系列腕信頼度平均を使う。左右両腕が未検出または信頼度 `< 0.15` で体幹信頼度も `< 0.15` の場合だけ arms を `fallback` にする。
    - `MotionIntentEstimator.reset()` はカメラ停止、映像固定データ読み込み、記録読み込み、再生停止、由来再初期化で呼び、過去フレームのヒステリシス / 待機期間 / 手振り窓を破棄する。`dtMs <= 0`、`dtMs > 250`、非有限 dt のフレームはカウンターを更新せず、`invalid_dt` 警告を返す。`createMotionIntentState(input, config?)` は単発補助処理であり、過去フレームが必要な意味に基づく動作意図は初回フレームでは発火しない。
    - `createSemanticMotionPoseLayer()` は `MotionIntentState`、完成版 `AvatarMotionProfile`、任意前回の意味に基づく動作診断用スナップショット、任意 `deltaSeconds` だけを入力にし、時系列 / Hand / 未加工ジェスチャー / MediaPipe 未加工のランドマークは読まない。`tracking` と `guarded` は無処理、片側だけの `clapLike` も無処理とし、左右両方が `clapLike` の場合だけ `side: "both"` の `soft_clap_like` を 1 層返す。
    - `createFingerCurlPoseLayer()` は Hand スナップショットの `fingerCurl` を主値とし、`pointing` / `thumbsUp` / `peace` / `wave` / `explain` の MotionIntent 上書きをグループ曲げへ適用する。未加工のランドマークから指ごとの 3D 回転は作らず、曲げ / 指の開き / 親指の対向動作の低次元値だけをクォータニオンへ写す。
    - ジェスチャー Recognizer は本番任意合格として初期化済みであり、信頼性実観測接続は `ReliabilityMap.gesture` に閉じる。制作済み意味に基づく動作範囲制限資材と `VRMCharacterManager.update()` の適用順序変更は後続タスクに残す。AnimationMixer を使う場合も意味に基づく動作範囲制限再生は準備段階に留め、最終的には姿勢差分を `VrmPoseComposer` の意味に基づく動作のレイヤーとして渡す。
- `TemporalUpperBodyState` → 腕 IK 橋渡し
    - 段階 6 本番腕入力は `src/character/retargeting/sincroPoseTemporalArmInput.ts` の `createSincroPoseTemporalArmInput()` を正本とし、`TemporalUpperBodyState`、`MinimalAvatarMotionProfile`、`SincroArmIkSolver` 測定値から `createTemporalArmIkInput()` 経由で肩ローカル目標を作る。`solveWorldArmIk()` の Pose スナップショット入力経路は廃止予定代替処理 / A/B 比較用に残すが、時系列の主入力が有効なフレームでは本番主入力にしない。
    - 入力は `TemporalUpperBodyState`、腕左右、`MinimalAvatarMotionProfile`、`SincroArmIkSolver` と同等の `shoulderWidth` / `upperArmLength` / `lowerArmLength` 測定値である。倍率スナップショットはプロファイル測定値を優先し、欠損時だけソルバー測定値に代替処理する。`maxReachRatio` は `0.985` に固定する。
    - `bodyLocalWrist` がある場合は主入力とし、身体のローカル座標系の絶対タプルから `sideSign = left ? -1 : 1`、`shoulderLocal = [sideSign * shoulderWidth * 0.5, 0, 0]` を再構成し、`relative = bodyLocalWrist - shoulderLocal` を作る。身体のローカル座標系のタプルは追跡処理の体幹を基準に正規化した座標でアバターメートルではないため、`relative` に左右方向 / 上下方向 / 奥行き倍率を適用した方向を正規化し、長さは `reach * avatarArmLength * defaultReachScale` から与える。`bodyLocalElbow` がある場合の `elbowPole` は従来どおり肩相対方向へ変換する。
    - `bodyLocalWrist` がない場合はスカラー代替処理を使う。`rawReach = reach * (upperArmLength + lowerArmLength)`、`x = openness * sideSign * rawReach * lateralScale * defaultReachScale`、`y = sin(elevationRad) * rawReach * verticalScale * defaultReachScale`、`z = forwardness * rawReach * depthCompression * defaultReachScale` とし、ソルバー前目標長を腕長さ `* 0.985` 以下へ値の制限する。
    - `weight` は時系列腕 `confidence` と `state` だけから決める。`tracked` は `confidence`、`suspect` は `confidence * 0.55`、`recovering` は `confidence * recoveringBlend.progress`、`predicted` は `confidence * 0.35`、`lost` は `0` とする。`lost` または非有限入力では `target` を返さず、`reasonCodes` とゼロ重みデバッグを返す。
    - 段階 6 橋渡しは Pose 手首 / Hand 手首の未加工のワールド座標のZ値を再読解しない。奥行きは時系列 `forwardness` と `profile.solverDefaults.depthCompression`、または保存済み `bodyLocalWrist` の身体のローカル座標系の z から決定し、Hand 手首は手のひら / 指 / ジェスチャー補助の入力に留めて腕 IK 目標の主入力にしない。
    - 本番代替処理は `temporal_input_missing`、`avatar_profile_missing`、`temporal_arm_lost`、`invalid_temporal_arm`、`ik_solver_missing` のいずれかを `frame.solver.phase6.arms.<side>.source.fallbackReason` と `bridgeReasonCodes` に保存して、既存 `SincroPoseMotionSnapshot.leftArm/rightArm.targets` 経路へ戻す。`source` 欠損の旧 `sincro.phase6-solver.v1` ログは再生閲覧画面で `primarySource: "pose-snapshot-fallback"` 相当として扱う。
- `MinimalAvatarMotionProfile`
    - `src/character/avatarProfile/minimalAvatarMotionProfile.ts` を正本とする、VRM 読み込み時に測れる最小アバター固有のプロファイル契約。
    - スキーマバージョンは `sincro.minimal-avatar-motion-profile.v1` に固定し、`optionalBones`、`measurements`、`solverDefaults`、`warnings` だけを持つ通常のオブジェクトとして保存する。`THREE.Vector3`、`THREE.Quaternion`、`Object3D`、`VRM` インスタンスはプロファイルに保持しない。
    - `optionalBones` は `upperChest`、`leftShoulder`、`rightShoulder`、`leftHand`、`rightHand`、`leftThumbProximal`、`rightThumbProximal`、`leftIndexProximal`、`rightIndexProximal` の真偽値対応能力とする。欠損しても throw せず、該当フィールドを `false` にして `missing_<bone>` 系理由コードを `warnings` に重複なく残す。
    - `measurements` は `shoulderWidth`、`leftUpperArmLength`、`leftLowerArmLength`、`rightUpperArmLength`、`rightLowerArmLength`、`headSize` を任意数値として持つ。計測不能値は `undefined` にし、`NaN` / `Infinity` は保存しない。
    - 腕長と肩幅は `SincroArmIkSolver` と同じく `vrm.scene.updateMatrixWorld(true)` 後の `vrm.humanoid.getNormalizedBoneNode()` とワールド座標での位置間距離を使う。上腕 / 前腕の長さはノードが揃う場合 `Math.max(distance, 0.04)`、肩幅は左右上腕ノードが揃う場合 `Math.max(distance, 0.08)` とする。
    - `headSize` は首と頭部のワールド座標での距離を優先し、首 / 頭部が揃わず肩幅が測れている場合だけ `shoulderWidth * 0.75` で推定し、`head_size_estimated_from_shoulder_width` を `warnings` に残す。どちらも不可なら `headSize` は `undefined` とし、`head_size_unmeasured` を残す。
    - `solverDefaults` は `defaultReachScale: 1.0`、`depthCompression: 0.55`、`lateralScale: 1.0`、`verticalScale: 0.92`、`shoulderDamping: 0.65`、`wristRollInfluence: 0.25` に固定する。
    - 段階 7 以降は完成版 `AvatarMotionProfile` から `toMinimalAvatarMotionProfile()` で明示変換して得る互換表現とする。診断 Console / `motion-debug` の `poseRetargetRuntime.avatarMotionProfile` と段階 6 スナップショットスキーマは最小形状のまま維持する。
- `AvatarMotionProfile`
    - `src/character/avatarProfile/avatarMotionProfile.ts` を正本とする、VRM 個体差を保存可能な通常のオブジェクトとして表す完成版アバター固有のプロファイル契約。
    - スキーマバージョンは `sincro.avatar-motion-profile.v1` に固定する。解析処理は未知 `schemaVersion` を `unknown_schema_version`、余分なキー / 未知の列挙値 / 実行時オブジェクト風値を `invalid_state`、非有限数値や値域外スカラーを `out_of_range` として返し、再生 / 閲覧画面を例外で落とさない。
    - プロファイルは `model`、`capabilities`、`restLocalRotation`、`metrics`、`torso`、`arm`、`wrist`、`fingers`、`risk`、`warnings` を持つ。`THREE.Vector3`、`THREE.Quaternion`、`Object3D`、`VRM` インスタンス、関数、クラスのインスタンス、`NaN` / `Infinity` は保存しない。
    - `capabilities.bones` は正規化済み人型ボーンの有無を `Partial<Record<VRMHumanBoneName, boolean>>` で持ち、`fingerChains.left/right.thumb/index/middle/ring/little` は `proximal`、`intermediate`、`distal` の有無を保存する。VRM 親指は `thumbMetacarpal` をボーン列の `intermediate` として扱う。
    - `fingers.curlScale` は指の曲げ意味に基づく動作のレイヤーの最終曲げに掛け、`0..1` に制限する。`curlMode` が `"grouped"` でも `"perFinger"` でも v1 の姿勢補助処理はグループ入力を使い、未加工のランドマーク回転は作らない。`fingers.splayLimitDeg` は指の開き角度の上限として使う。
    - `restLocalRotation` は利用可能ボーンだけを `[x, y, z, w]` タプルで保存する。ローカルクォータニオンが非有限のボーンは保存せず、`invalid_rest_rotation:<VRMHumanBoneName>` を `warnings` に残す。
    - `metrics` は `shoulderWidth`、`torsoLength`、`headSize`、左右 `upperArmLength`、左右 `lowerArmLength`、左右 `handSize` を任意有限数値として持つ。測定は `vrm.scene.updateMatrixWorld(true)` 後、`vrm.humanoid.getNormalizedBoneNode()` とワールド座標での位置間距離だけで行い、glTF ノード名検索は使わない。
    - 測定不能値は `undefined` にし、`<snake_field>_unmeasured` を `warnings` に重複なく残す。`headSize` は首と頭部の間の距離を優先し、測れず `shoulderWidth` がある場合だけ `shoulderWidth * 0.75` で推定し、`head_size_estimated_from_shoulder_width` を残す。
    - 警告コードは段階 7 契約の命名を正本にする。欠損ボーンは `missing_<VRMHumanBoneName>`、測定不能は `left_hand_size_unmeasured` のようなスネークケースのフィールド、推定値は `<snake_field>_estimated_from_<source>` とする。旧最小の `missing_upper_chest` 形式は新規生成しない。
    - `torso.distribution` は対応能力から決定する。`spine+chest+upperChest` は `{ spine: 0.25, chest: 0.40, upperChest: 0.35 }`、`spine+chest` は `{ spine: 0.35, chest: 0.65, upperChest: 0 }`、それ以外は `{ spine: 1, chest: 0, upperChest: 0 }` とする。
    - 既定は段階 7 契約値を使う。`arm.reachScale: 0.92`、`lateralScale: 0.90`、`verticalScale: 0.95`、`depthCompression: 0.60`、`elbowOutwardBias: 0.25`、`shoulderDamping: 0.55`、`wrist.wristRollInfluence: 0.40`、`fingers.curlScale: 0.80`、`torso.chestFollow: 0.55` とする。
    - `toMinimalAvatarMotionProfile()` は段階 6 と同じ構造を返し、`optionalBones`、`measurements`、`warnings` を互換フィールドへ落とす。`solverDefaults` は最小の旧既定値ではなく完成版プロファイル値から写し、`defaultReachScale = arm.reachScale`、`depthCompression = arm.depthCompression`、`lateralScale = arm.lateralScale`、`verticalScale = arm.verticalScale`、`shoulderDamping = arm.shoulderDamping`、`wristRollInfluence = wrist.wristRollInfluence` とする。
    - `SincroPoseRetargeter.attachVrm()` は完成版 `AvatarMotionProfile` を生成・保持し、`getAvatarMotionProfile()` は深い複製済みの完成版プロファイルを返す。`VRMCharacterManager.getAvatarMotionProfile()` / `VRMScene.getAvatarMotionProfile()` は motion-debug 用にこの複製を公開する。既存診断 Console / 段階 6 姿勢合成処理 / ソルバーへ渡す箇所では最小互換変換を明示する。
    - 実行中の較正が後続タスクで追加されても、アバターボーン長、初期ローカル回転、人型対応付け、指のボーン列対応能力はアバター構造値として変更しない。較正はユーザー姿勢 / カメラ / 制御応答由来の補正値だけを別契約に持つ。
    - `motion-debug` スナップショット
    - `pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、カメラ準備状態、描画 fps をまとめて返す。
    - ライブカメラ / 映像固定データの最新映像フレーム時刻情報は任意 `camera.frameTiming` に載せる。フィールドは `source`、`receivedAtPerformanceMs`、`mediaTimeMs`、`videoCurrentTimeMs`、任意 `presentationTimeMs`、任意 `expectedDisplayTimeMs`、任意 `presentedFrames`、`droppedPresentedFrames` を持つ。
    - ライブカメラ / 映像固定データのカメラ品質は任意 `camera.quality` に `sincro.camera-quality.v1` として載せる。由来が `none` の場合はスコアを生成せず、閲覧画面カメラ層は従来どおり未記録扱いになる。
    - ライブカメラ / 映像固定データの有効実行時性能プロファイルは `camera.performanceProfile` を正本にする。スキーマバージョンは `sincro.tracker-performance-profile.v1` で、カメラの制約、Face / Pose / Hand / Face ROI / ジェスチャー実行頻度、デバッグログ粒度、機能低下予算の説明値を持つ。`tracker.budget` やフレーム指標へプロファイルを重複保存しない。
    - `window.__SINCRO_MOTION_DEBUG__.startCamera(options?)` は任意 `performanceProfileId` / `performanceProfile` を受け付ける。未指定時は `debug` プロファイルを使い、`performanceProfileId` 指定時は固定 `POSE_TARGET_INFERENCE_FPS` 上書きではなくプロファイル実行頻度の Pose fps を `TrackerRuntime` 既定として使う。
    - `CameraQualityScore` の案内文言は理由コードから `"少し下がってください"`、`"体を画面中央に入れてください"`、`"手が画面から出ないようにしてください"`、`"部屋を明るくしてください"`、`"カメラ解像度を上げてください"` の固定文言へ決定的に変換する。v1 は本番観測専用 `ReliabilityMap.camera.cameraQualityStatus` と関節 / 部位の `cameraQuality` コンポーネントへ接続するが、動作の変換重み / IK 重みへは直接接続しない。
    - ライブカメラ / 映像固定データ / 再生 pose-snapshot の最新 `CanonicalUpperBodyState` は任意 `canonical` フィールドに載せる。再生フレームの `frame.canonical` が無効な場合は、同じフィールドに解析エラー要約を載せ、ウィンドウ API 利用者が再生失敗と切り分けられるようにする。
    - ライブカメラ / 映像固定データ / 再生 pose-snapshot の最新 `ReliabilityMap` は任意 `reliability` フィールドに載せる。再生フレームの `frame.reliability` が無効な場合は、同じフィールドに解析エラー要約を載せ、ウィンドウ API 利用者が再生失敗と切り分けられるようにする。
    - ライブカメラ / 映像固定データ / 再生 pose-snapshot の最新 `TemporalUpperBodyState` は任意 `temporal` フィールドに載せる。再生フレームの `frame.temporal` が無効な場合は、同じフィールドに解析エラー要約を載せ、ウィンドウ API 利用者が再生失敗と切り分けられるようにする。
    - ライブカメラ / 映像固定データ / 再生 pose-snapshot の最新 `MotionIntentState` は任意 `intent` フィールドに載せる。記録中でないライブ状態でも姿勢コールバックごとに更新し、`pose-snapshot` 再生では保存済み `frame.intent` で推定処理状態を上書きせず、処理工程再実行結果としての最新意図をスナップショット側にだけ出す。
    - VRM 読み込み後の最新 `MinimalAvatarMotionProfile` は `poseRetargetRuntime.avatarMotionProfile` に任意フィールドとして載せる。診断 Console と段階 6 スナップショットはこの最小形状を維持し、完成版 `AvatarMotionProfile` や較正状態は診断 Console スナップショットへ直接載せない。
    - motion-debug ライブスナップショットは任意 `phase7` フィールドに `sincro.phase7-profile-calibration.v1` の `MotionDebugPhase7Snapshot` を載せられる。通常 UI 文言は保存せず、開発者が確認できるな `profile`、`initialCalibration`、`onlineCalibration`、`activeCanonicalCalibration`、`warnings` だけを JSON 値として扱う。
    - 段階 4 の信頼性下流接続は標準化した信頼度 / 由来 / 警告と開発者専用 `canonicalReliabilityInput` までに限定する。`canonicalReliabilityInput` は標準化した生成に使った左右腕の `partWeight` / `minJointWeight` と信頼性 `schemaVersion` / `mediaTimeMs` を保存し、動作の変換 / IK ソルバー重みへはまだ接続しない。
    - 既存フィールド名は維持し、任意 `viewer` フィールドに閲覧画面モード、選択済み層、層状態 / 値、記録、再生、指標要約を追加する。
    - Playwright からの調整値変更は UI 制御と同じ動作の変換設定に反映し、画面スナップショットとウィンドウ API の観測値を揃える。
    - 複数 VRM の IK 検証では `motion-debug/?vrm=/characters/<file>.vrm` を使い、同じカメラ / 追跡処理 / 動作の変換経路でモデル差分を確認する。
- 初期較正
    - `InitialSincroCalibrationSession.schemaVersion` は `sincro.initial-calibration.v1` に固定する。標準段階は `precheck`、`neutral`、`a_pose`、`hand_open` で、`face_yaw_optional` は失敗してもセッション状態を下げない任意段階とする。
    - セッション状態は `not_started`、`ready`、`ready_without_hands`、`retry_recommended`、`failed` の固定列挙値とする。`hand_open` は任意手段階として扱い、`precheck` / `neutral` / `a_pose` が ready で `hand_open` だけ機能低下中 / 再試行 / 失敗 / 省略済みの場合は `ready_without_hands` を返す。
    - 本番設定の再試行制御処理は待機 / 有効 / 中止を `sessionId` 付きで管理する。有効セッションだけ記録 / 再試行 / 中断を受理し、古くなった ID、非アクティブ、未記録段階は状態を変更しない。再試行連鎖は precheck=全段階、中立=neutral/a_pose/hand_open、a_pose と hand_open=自身だけを削除する。ready 段階も明示操作なら再試行でき、`ready_without_hands` はキャラクター開始を妨げず hand_open だけ任意再試行できる。
    - 本番 Pose コールバックは観測専用の処理工程の `ReliabilityMap`、任意カメラ品質 / 標準化した状態、`mediaTimeMs` を較正橋渡しへ渡す。橋渡しは既存の純粋な段階評価担当を呼び、有効 `sessionId` で結果を再試行制御処理へ記録する。UI は制御処理の通知を購読して同じ結果を表示し、再試行連鎖で段階項目が削除された場合は、その段階の有効継続時間を 0 から再計測する。
    - カメラ停止、`sincro` モード離脱、カメラ / VRM 由来変更では生存期間所有者が有効セッション ID で中断する。中止状態はセッションデータを保持せず、再開は必ず新しい `sessionId` の開始から行う。
    - 段階評価は `ReliabilityMap`、任意 `CameraQualityScore`、任意 `CanonicalUpperBodyState`、`validDurationMs` の純粋な入力だけを読む。通常 UI はスコアや内部フィールド名を出さず、再試行理由を固定文言へ最大 2 件に絞って表示する。デバッグ UI / motion-debug は段階状態、再試行理由、スコア、測定値、診断用フィールドを開発者が確認できる JSON として表示できる。
    - `createCanonicalCalibrationFromInitialSession()` は完了済みセッションの測定値から `CanonicalCalibrationSnapshot` を作る。`id` は `initial-calibration:<startedAtMediaTimeMs>:<completedAtMediaTimeMs>`、`source` は `initial`、`capturedAtMediaTimeMs` は完了時刻に固定し、欠損測定値は `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` へ代替処理する。
- 実行中の較正
    - `OnlineSincroCalibrationState.schemaVersion` は `sincro.online-calibration.v1` に固定し、`initial`、任意 `candidate`、任意 `committed`、`freezeReasons` を保存する。`candidate.stableDurationMs >= 3000` かつ検査開くが継続した場合だけ `committed` へ昇格する。
    - 更新対象は `CanonicalCalibrationSnapshot` の `neutralYawRad`、`shoulderWidth`、`torsoScale`、`handBaseline.left/right.palmSize`、`handBaseline.left/right.openSpread` に限定する。`AvatarMotionProfile`、VRM 初期ローカル回転、アバターボーン長、人型 / 左右判定 / 指のボーン列対応付け、関節制限は実行中の較正で変更しない。
    - 検査は体幹信頼性 `> 0.85`、頭部信頼性 `> 0.80`、両肩が見える、画面端にあるリスク `< 0.30`、動きによるぼけリスク `< 0.50`、腕の活動量 `< 0.20`、顔ヨー `< 12deg`、ボーン長整合性 `> 0.80` を満たす時だけ開くとする。検査終了フレームでは較正値を進めず、`candidate` を破棄して `freezeReasons` だけを更新する。
    - 検査開く中でも `mediaTimeMs` が前回候補から増加していないフレームは候補を更新せず、`candidate_not_stable` をデバッグ理由に残す。候補が 3000ms 未満の場合も committed へは反映しない。
    - ずれ値の制限は停止条件ではなく、値の制限済み値で候補 / committed 更新を続ける。値の制限範囲は初期較正から `shoulderWidth ±15%`、`torsoScale ±20%`、`neutralYawRad ±10deg`、`handBaseline` の `palmSize` / `openSpread` `±20%` とし、値の制限発生時は `drift_clamped` をデバッグ理由に残す。
    - EMA は `alpha = 1 - Math.exp(-dtSec / tauSec)` に固定する。時定数は肩・身体倍率が `120s`、中立ヨーが `90s`、手基準が `20s` である。時刻は再生決定性のため `mediaTimeMs` だけを使い、`performance.now()` は使わない。
    - デバッグ表示では `freezeReasons` として `torso_low_reliability`、`head_low_reliability`、`shoulders_not_visible`、`border_risk`、`motion_blur`、`arm_activity_high`、`face_yaw_not_neutral`、`bone_length_inconsistent`、`candidate_not_stable`、`drift_clamped` を表示できる。通常 UI 文言化と永続化接続は後続タスクの責務とする。
- 動作評価ログ
    - 開発者向け評価ログのスキーマは `src/character/motionEvaluation/motionDebugLogSchema.ts` を正本とする。
    - スキーマバージョンは `sincro.motion-debug-log.v1` とし、NDJSON の 1 行目を構成情報記録、2 行目以降をフレーム記録として保存する。
    - `manifest.build.gitCommit` はビルド / CI 呼び出し元が `SINCROMISOR_GIT_COMMIT` に設定した値だけを Vite
      `define` 経由で受け取る。Vite 設定とブラウザ実行時は Git コマンドを実行しない。値は前後の空白除去後に
      小文字化し、`^[0-9a-f]{7,40}$` に一致する場合だけ保存する。未設定、空白、`unknown`、形式不正は
      フィールドを省略し、開発者ビルドの記録を失敗させない。任意フィールドのためスキーマバージョンは v1 を維持する。
    - 記録の有効実行時性能プロファイルは `manifest.pipeline.performanceProfile` を正本にする。`frame.metrics.tracker`、`frame.metrics.cameraQuality`、`tracker.budget` にはプロファイルを保存せず、フレームごとの重複を避ける。
    - `manifest.pipeline.performanceProfile.debugLog` は数値のリングバッファの既定フレーム数と出力 / 重ね表示取得の既定粒度を説明する。常時記録は数値値に限定し、PNG / 重ね表示 / 全情報の出力の連続保存はプロファイル既定では有効化しない。
    - `manifest.pipeline.performanceProfile.degradationBudget` は後続順序を固定した機能低下方針が読む入力契約であり、記録時点の自動機能低下履歴ではない。実際の許容時間超過 / 代替処理状態は従来どおり `frame.metrics.tracker.budget` と ROI 統計に保存する。
    - 記録処理中核処理は `src/character/motionEvaluation/motionDebugRecorder.ts` に置き、構成情報 / フレーム検証、重複排除、maxDuration / maxFrames 停止、NDJSON / Blob 公開を DOM 非依存で扱う。
    - 再生 / 指標が読む正規化姿勢スナップショットの保存先は `frame.poseSnapshot` に固定し、MediaPipe 未加工の結果やソルバー出力とは別格納先に分ける。
    - 再生は `frame.timestamp.mediaTimeMs` を正本時刻として使い、自動再生の順序と手動ステップの対象フレームを `performance.now()` へ依存させない。`mediaTimeMs` は映像フレーム時計のメディア時刻であり、Worker へ渡す検出時刻とトラッカーの実行間隔判定も同じ値を使う。同一フレームで全画面、ROI、代替推論を行うFaceLandmarker境界では `VIDEO` グラフの制約を満たすよう内部時刻だけを厳密な単調増加へ補正し、スナップショットと記録の正本時刻は変更しない。
    - フレームは姿勢コールバック / 姿勢代替処理コールバック起点で記録し、描画ループは記録状態表示だけを更新する。
    - `MotionDebugRecordingController.recordPoseFrame()` は同じ姿勢コールバック / 代替処理コールバック起点で `estimateCanonicalTorsoFrame()`、`createCanonicalUpperBodyState()` を呼び、`frame.canonical` に JSON 保存可能な `CanonicalUpperBodyState` を保存する。連続フレームの `bodyFront` 反転抑制は前回の標準化したを体幹推定処理へ渡して効かせ、記録停止、由来停止、再生読み込み時に前回のを再初期化する。
    - `MotionDebugApp.handlePoseMotion()` / `handlePoseFallback()` はカメラ品質更新後、記録前に `createPoseReliabilityMap()` を呼び、ライブスナップショットの `reliability` と記録フレームの `frame.reliability` を同期する。`mediaTimeMs` は `TrackerVideoFrameTiming.mediaTimeMs`、`pose.lastUpdatedAtMs`、`0` の順に選び、ライブカメラ / 映像固定データ停止、再生読み込み、記録再初期化で前回の信頼性を再初期化する。
    - `MotionDebugRecordingController.recordPoseFrame()` は標準化した / 信頼性解決後に同じ `mediaTimeMs` で `TemporalStateEstimator.update()` を呼び、ライブスナップショットの `temporal` と記録フレームの `frame.temporal` を同期する。`frame.timestamp.mediaTimeMs` と `temporal.timestamp.mediaTimeMs` が一致しない外部入力は記録失敗にせず、フロントエンド警告と時系列 JSON の `out_of_range` 警告に留める。
    - v1 フレームは最低限 `frame.timestamp.mediaTimeMs`、`frame.video.width`、`frame.video.height`、`frame.poseSnapshot`、`frame.reliability`、`frame.canonical`、`frame.temporal`、`frame.intent`、`frame.solver.poseRetarget`、`frame.solver.poseRetargetRuntime`、`frame.solver.phase6`、`frame.solver.phase7`、`frame.solver.phase9`、`frame.finalPose`、`frame.metrics.receivedAtPerformanceMs`、`frame.metrics.tracker` を保存する。
    - `frame.solver.phase6` は `sincro.phase6-solver.v1` の保存専用スナップショットであり、`profile.schemaVersion`、有限数値だけを残した `profile.measurements`、左右腕の任意 `bridge` と `ik` を持つ。実行時の `SincroArmIkTarget` は直接 JSON 化せず、`target.wrist` / `target.elbowPole` は `[number, number, number]` タプルへ変換する。
    - `frame.solver.phase7` は `sincro.phase7-profile-calibration.v1` の保存専用スナップショットであり、完成版 `AvatarMotionProfile`、任意 `InitialSincroCalibrationSession`、任意 `OnlineSincroCalibrationState`、任意 `CanonicalCalibrationSnapshot` の `activeCanonicalCalibration`、`warnings` を持つ。`profile` は `VRMScene.getAvatarMotionProfile()` 由来の複製を使い、`activeCanonicalCalibration` は同じフレームの最新標準化した較正から通常のスナップショットとして保存する。未実行時は既定初回 / 実行中セッションで埋めず、存在するフィールドだけを保存する。
    - `MotionDebugRecorder` の構成情報 / フレーム検証は `frame.intent` と `frame.solver.phase9` を未知オブジェクトとして保持し、厳密検証は再生 / 閲覧画面の `parseMotionIntentState()` と段階 9 解析処理境界に閉じる。最上位 `profile` / `calibration` / `semantic` / `finger` フレーム格納先は追加しない。
    - `frame.finalPose` は `sincro.vrm-pose-composer-result.v1` の最上位 `schemaVersion` を持つ `VrmPoseComposerResult` スナップショットであり、`finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を含む。
    - `frame.reliability` は任意格納先として `sincro.reliability-map.v1` の `ReliabilityMap` を保存する。v1 は `timestamp`、`camera`、`joints`、`parts`、`gesture`、`warnings` を持つ JSON 契約であり、有限数値、小文字列挙値、通常のオブジェクトだけを許可する。
    - `ReliabilityMap` の `finalWeight` とコンポーネント `score` は `0..1` の低重み観測を含めて保存する。`finalWeight < threshold` は解析失敗ではなく観測値として保持し、破棄や下流重み反映は後続推定処理 / 制御処理タスクの責務とする。
    - `parseReliabilityMap()` は再生 / 閲覧画面境界の検証 API であり、未知 `schemaVersion`、値域外スカラー、非有限数値、未知関節 / 部位キー、実行時オブジェクト風余分なキーを拒否する。
    - 旧ログで `frame.reliability` が無い場合、再生閲覧画面は `frame.poseSnapshot`、`frame.timestamp.mediaTimeMs`、`frame.video.width` / `height` から `createPoseReliabilityMap()` を再計算する。`poseSnapshot` も無いフレームは信頼性層を `not_recorded` とし、ログ読み込み自体は失敗させない。
    - `frame.timestamp` は任意で `presentationTimeMs`、`expectedDisplayTimeMs`、`presentedFrames`、`droppedPresentedFrames`、`clockSource` を保存できる。`clockSource` は `request-video-frame-callback`、`request-animation-frame`、`timer` のいずれかで、代替処理では rVFC 固有フィールドを欠損のままにする。
    - フレームごとのカメラ品質は任意 `frame.metrics.cameraQuality` に保存する。最上位 `cameraQuality` は追加しない。再生閲覧画面のカメラ層はこのフレーム値がある場合、構成情報カメラ設定より優先して表示する。
    - 追跡処理処理時間の予算は任意 `frame.metrics.tracker.budget` として保存する。スキーマバージョンは `sincro.tracker-performance-budget.v1`、機能低下状態は `"full"`、`"main-thread-low-fps"`、`"pose-reduced-fps"`、`"face-only"`、`"fallback"` の固定列挙値とする。
    - 基準用追跡処理継続時間要約は既存動作指標スキーマから分離する。ジェスチャー p95 は `gestureInferenceTimeMs` がある実行フレームだけ、合計時間のp95 は `tracker.mode` に従い Worker の `workerTimeMs` またはメインスレッドの `mainThreadDetectTimeMs` だけを母集団にし、初回 Worker 初期化コストも除外しない。有限値を昇順にした最近順位法 `ceil(0.95 * n) - 1` を使い、0 件は `null`、旧ログの欠損は警告なしで省略する。
    - 順序を固定した機能低下方針は任意 `frame.metrics.tracker.degradationPolicy` として保存する。スキーマバージョンは `sincro.tracker-degradation-policy.v1`、段階は `"full"`、`"gesture-reduced-fps"`、`"optional-pass-reduced-fps"`、`"roi-hand-paused"`、`"pose-reduced-fps"`、`"face-only"`、`"comfortable-idle"` の固定列挙値とし、既存予算機能低下状態の列挙値とは分ける。
    - `timestamp.receivedAtPerformanceMs` や最上位 `tracker` はスキーマ外なので追加しない。`mediaTimeMs` と `metrics.receivedAtPerformanceMs` は時刻原点が異なるため、遅延として差分を取らない。
    - 記録処理の重複判定は rVFC の `presentedFrames` がある場合はそれを優先し、同じ `presentedFrames` の連続入力を保存しない。`presentedFrames` が 2 以上進んだ場合、時計は `droppedPresentedFrames = 差分 - 1` を保存する。
    - カメラの `deviceId` / `groupId` は生の値を保存しない。保存が必要になった場合も公開単位のソルトでハッシュし、出力をまたいで固定されたハッシュを残さない。
    - `CameraQualityScore.track` も未加工 `deviceId` / `groupId` / `label` を保存せず、`width`、`height`、`frameRate`、`facingMode`、`readyState` だけを持つ。本番制御処理は `MediaStreamTrack` 本体を観測専用の処理工程へ渡さず、現在トラックから読んだ設定 / readyState をスコア生成境界で機密情報の除去する。
    - `MediaStreamTrack.getSettings()` 由来のカメラ設定は `MotionDebugApp` で機密情報の除去してから構成情報へ渡し、記録処理中核処理は機密情報を除去済みの構成情報を厳格な検査スキーマで検証する。
- 動作指標
    - 指標の公開入口は `src/character/motionEvaluation/motionMetrics.ts` 共通窓口を正本とし、既存 import 名を維持する。実体は `motionMetricTypes.ts`、`motionMetricThresholds.ts`、`motionMetricFrameParsers.ts`、`motionMetricBaseCalculators.ts`、`motionMetricTrackerCalculators.ts`、`motionMetricTemporalCalculators.ts`、`motionMetricSolverCalculators.ts`、`motionMetricIntentCalculators.ts`、`motionMetricSummary.ts`、`motionMetricComparison.ts` に分け、各計算処理は `SincroMotionDebugFrame[]` と `MotionMetricConfig` 由来の値だけを読む純粋な関数とする。`motionMetricRecoveryCalculators.ts` は時系列回復急変の補助実装であり、外部公開は時系列モジュール経由に留める。
    - 要約スキーマは `sincro.motion-metrics.v1` とし、`neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`angularVelocitySpikeCount`、`reachClampOccupancy`、`trackingLossDurationMs`、`sideSwapCount`、`addedLatencyMs`、`temporalPredictedArmFrameCount`、`temporalRecoveringArmFrameCount`、`temporalLostArmDurationMs`、`temporalMaxRecoveryJumpDegEquivalent`、`temporalNeutralWristJitter`、`solverElbowFlipRejectCount`、`solverReachClampOccupancy`、`solverExcessReachRatioP95`、`solverPoleUncertainFrameCount`、`finalPoseAngularVelocityClampCount`、`finalPoseOwnedBoneConflictCount`、`gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount`、`trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` を固定キーとする。
    - 段階 5 時系列指標は `frame.temporal` の有効 `TemporalUpperBodyState` だけを読む。予測済み / 復帰中件数は arm-frame 単位、未検出継続時間は左右腕未検出継続時間合算、回復急変は復帰中中腕スカラーのフレーム差分を deg 相当に換算した最大値、中立手首揺らぎは `neutral-10s` の追跡済み / 疑わしい `bodyLocalWrist` 連続差分 RMS とする。
    - 段階 6 ソルバー / finalPose 指標は保存済み `frame.solver.phase6` と `frame.finalPose` だけを読む。`solverElbowFlipRejectCount` は `constraintReasonCodes` の `pole_flip_rejected`、`solverReachClampOccupancy` は `ik.targetClamped` arm-frame 比率、`solverPoleUncertainFrameCount` は `poleState === "uncertain"`、`finalPoseAngularVelocityClampCount` は `clampedBones[].reason === "angular_velocity"`、`finalPoseOwnedBoneConflictCount` は `warnings` の `owned_bone_conflict:` 接頭辞だけを数える。
    - 段階 6 腕の任意 `reach` は橋渡し値の制限前の肩ローカル手首長を橋渡し倍率のアバター腕長さで割った `requestedReachRatio`、ソルバー最終目標長を同じ橋渡し倍率腕長さで割った `appliedReachRatio`、両者の正の差 `excessReachRatio`、単一所有権 `clampedBy` を保存する。プロファイル測定値とソルバー測定値が異なる場合も要求された / 適用済みの分母を混在させない。橋渡しとソルバーの両方が値の制限した場合は `solver` を優先する。旧ログの欠損は解析できるが、`solverExcessReachRatioP95` は全 arm-frame に有限診断が揃わない限り `reach_diagnostics_not_recorded` とする。
    - 段階 9 意図指標は保存済み `frame.intent` だけを読む。`gestureFlickerCount` は同一左右の意味に基づく動作意図が `stableDurationMs < 150` のまま `tracking` または別意味に基づく動作意図へ戻った回数、`semanticFallbackFrameCount` は左右片腕ごとのサンプルの `lost` / `fallback` 数、`intentCooldownSuppressionCount` は左右警告の `gesture_cooldown` 数、`intentInvalidFrameCount` は `parseMotionIntentState()` が失敗したフレーム数とする。無効意図フレームは他 3 件のサンプルから除外し、有効意図サンプルが 0 の場合は `not_available` / `intent_not_recorded` にする。
    - 段階 10 機能低下指標は追跡処理統計とフレーム時刻だけを読む。`trackerBudgetOverrunFrameCount` は `frame.metrics.tracker.budget.budgetStatus === "over_budget"` のフレーム数であり、`warn` は数えない。`trackerDroppedFrameCount` は `frame.timestamp.droppedPresentedFrames` と累積値 `frame.metrics.tracker.droppedFrames` のフレーム間差分を同一フレームごとに比較し、大きい値だけを採用する。`degradationStageFrameCount` は `frame.metrics.tracker.degradationPolicy.stage !== "full"`、または旧ログの `frame.metrics.tracker.budget.degradation.state !== "full"` のフレーム数とする。`degradationRecoveryFrameCount` は `frame.metrics.tracker.degradationPolicy.recovering === true`、`roiPausedFrameCount` は `frame.metrics.tracker.roi.pauseState !== "active"` を数える。
    - 段階 10 機能低下指標はすべて `unit: "count"`、`direction: "lower_is_better"` とする。初期閾値は `trackerBudgetOverrunFrameCount { pass: 0, warn: 30, fail: 90 }`、`trackerDroppedFrameCount { pass: 0, warn: 15, fail: 60 }`、`degradationStageFrameCount { pass: 0, warn: 45, fail: 150 }`、`degradationRecoveryFrameCount { pass: 0, warn: 60, fail: 180 }`、`roiPausedFrameCount { pass: 0, warn: 60, fail: 180 }` に固定する。
    - 旧ログで `degradationPolicy` が無い場合、`degradationRecoveryFrameCount` は回復を推測せず `not_available` にする。旧ログで `roi` が無い場合、`roiPausedFrameCount` は `not_available` にする。`degradationStageFrameCount` だけは旧 `budget.degradation.state` を代替処理として読む。
    - 基準解析処理は新しい固定キーが旧基準に無い場合、未知キーではなく欠損キーとして `not_available` 指標を `severity: "warn"` で補完する。しきい値は `MotionMetricThreshold` の有限 `pass` / `warn` / `fail` 境界だけを保存し、表現上の `fail > N` は判定説明として扱う。
    - 入力格納先が不足する指標は `status: "not_available"`、`severity: "warn"`、`value: null` とし、要約全体を合格扱いにしない。
    - 初期閾値は `DEFAULT_MOTION_METRIC_THRESHOLDS` に固定し、比較は `compareMotionMetricSummaries()` が指標ごとに `improved` / `unchanged` / `regressed` / `not_comparable` を返す。
    - P0 固定データ ID は `neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、`arms-cross`、`fast-wave`、`left-arm-occlusion-recovery`、`right-arm-occlusion-recovery` に固定する。回復 2 固定データは 30fps、64 フレームの決定的標準化した状態・信頼性系列から本番時系列推定処理と腕入力提供元を通して生成し、対象腕の追跡済み → 未検出 → 復帰中 → 追跡済み、未検出中の `pose-snapshot-fallback`、復帰中後の `temporal` 復帰を保存する。
    - 基準 JSON は `src/character/motionEvaluation/motionMetricBaselineSchema.ts` の `parseMotionMetricBaseline()` を正本にし、スキーマバージョンは `sincro.motion-metric-baseline.v1` とする。
    - `motion-debug` ウィンドウ API は再生読み込み済みログに対して `calculateReplayMetrics(config)` を公開し、API 内では時刻を生成せず `config.generatedAtIso` を要約へ渡す。

## 本番適用の判定条件

本番 `sincro` 動作処理工程は、取り組み計画の段階番号ではなく、観測成果物、指標状態、手動確認、切り戻し条件で段階的に進める。正規化済み姿勢の全面適用は本番既定へ昇格済みであり、腕 / 体幹 / 全面適用の段階別の切り戻しフラグは削除済みである。

| 段階                                     | 開始条件                                                                                                                                     | 完了条件                                                                                                                                                                   | 必須成果物                                                                                                                                                          | 必須指標の状態                                                                                                                                                              | 必須の手動確認                                                                                                                                    | 切り戻し条件                                                                                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 観測専用の処理工程                       | Face / Pose コールバックから `SincroMotionPipelineState` が例外なく更新され、VRM ボーン / 表情 / ルート位置を変更しないこと。                | ライブ / 記録 / 再生で信頼性、標準化した、時系列、意図の利用可能 / not_computed / invalid_input が説明可能で、欠損入力が本番コールバックの例外にならないこと。             | `frame.reliability`、`frame.canonical`、`frame.temporal`、`frame.intent`、`SincroMotionObserveOnlySummary`、実行時の所有権対応表。                                  | `neutralJitter`、`trackingLossDurationMs`、`sideSwapCount`、段階 5 時系列指標が `not_available` でなく、P0 固定データ基準に対して悪化がないこと。                           | `default.vrm` と `aoi-1.0.7.vrm` で通常会話、顔のみ、Pose 欠損、カメラ停止 / 再接続を確認し、従来直接書き込み表示と差が出ないこと。               | 観測専用状態更新でフレームループが止まる、顔のみのコールバックが時系列 / 意図を進める、または診断 Console が未加工のランドマーク / 切り抜きオブジェクトを保持する場合は無効化する。 |
| 本番姿勢合成の試行                       | 観測専用の完了条件を満たし、`AvatarMotionProfile` / `MinimalAvatarMotionProfile` と最新 `SincroPoseRetargetFrame` が揃うこと。               | `sincroVrmPoseComposerDryRun` が `available` / `not_ready` / `invalid_input` / `missing_profile` を正しく返し、`status !== "available"` で `result` を持たないこと。       | `frame.finalPose`、本番試行要約、`sincro.composer-comparison-summary.v1`、任意ボーン代替処理検証。                                                                  | `composerAngleDeltaDeg` は合格または既知理由付き警告、`composerOwnedBoneConflictCount` は合格、`composerMissingPoseFrameCount` は合格、既存動作指標に不合格悪化がないこと。 | 試行中に `vrm.humanoid.setNormalizedPose()`、正規化済みボーンノード、表情、ルート位置が更新されないことを motion-debug 再生と実機で確認する。     | 試行結果が古い `available` finalPose を現在の結果へ昇格する、所有するボーン競合が出る、または直接書き込みの見た目が変わる場合は試行接続を戻す。                                     |
| 全面 `setNormalizedPose(finalPose)` 適用 | 本番姿勢合成の試行と意味に基づく動作・指の適用の完了条件を満たし、頭部 / 首 / 脚 / 表情 / ルート位置の非対象境界が明文化されていること。     | `VRMCharacterManager.update()` で上半身 finalPose の書き手が全面 `VrmPoseComposer` 適用だけになり、利用不可フレームでも腕 / 体幹段階別の書き込み処理を自動実行しないこと。 | 全面 finalPose 再生、実行時の所有権対応表、姿勢合成処理比較要約、任意ボーン代替処理検証、複数 VRM 手動確認ログ。                                                    | 全 P0 固定データの動作指標と姿勢合成処理指標が合格、`not_available` 指標は成果物欠損理由付きで検査判定から除外されていること。                                              | `default.vrm`、`aoi-1.0.7.vrm`、欠損ボーン人工的なプロファイル、カメラ機能低下 / 回復、チャット / sincro モード切替で見た目を確認する。           | 頭部 / 首 / 脚 / 表情 / ルート位置が意図せず姿勢合成処理所有になる、既存制御処理と二重書き込みする、または利用不可理由が診断 Console / 指標から消える場合。                         |
| 意味に基づく動作・指の適用               | `MotionIntentState`、意味に基づく動作のレイヤー、指の曲げ層、完成版 `AvatarMotionProfile` が有効スナップショットとして保存・再生できること。 | 意味に基づく動作のプリセットと指の曲げが姿勢合成処理層としてだけ適用され、追跡層の所有ボーンと衝突する場合は信頼度検査 / 抑制理由で説明できること。                        | `frame.intent`、`frame.solver.phase9`、意味に基づく動作 / 指診断用スナップショット、姿勢合成処理 finalPose スナップショット、プロファイル対応能力スナップショット。 | `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount` が合格、指欠損ボーン列で姿勢合成処理競合が 0 であること。  | Hand 開く / 半開き / 閉じた、thumbs-up、peace、顔の近く、軽く拍手するような動作、手未検出 / 復帰済みを複数 VRM と低下した指のボーン列で確認する。 | 意味に基づく動作意図が短時間ちらつきする、指のボーン列欠損で例外または過伸展が出る、追跡姿勢を意味に基づく動作が不透明に上書きする場合は意味に基づく動作 / 指フラグを off に戻す。  |

腕 / 体幹 / 全面適用の段階別の切り戻しパスは削除済みである。`composerArmApplicationMode`、
`composerTorsoShoulderApplicationMode`、`fullNormalizedPoseApplicationMode`、`composer_arm_application_*` 警告、
`composer_torso_shoulder_application_*` 警告、`full_normalized_pose_application_off` は本番コード /
診断 Console 操作部品 / スナップショット / テストの正本から外した。`ArmBoneController.update()` と
`CharacterMotionOrchestrator.update()` は全面適用利用不可フレームの復旧フックとして自動実行しない。
`CharacterMotionOrchestrator.updateRootStabilization()` だけはルート位置 / hips 回転の非対象制御処理境界として
維持する。

腕 IK 目標の本番主入力は `TemporalUpperBodyState` と `MinimalAvatarMotionProfile` から作る
時系列橋渡し出力である。時系列入力 / アバタープロファイル / 橋渡し / ソルバーが欠損または無効な場合だけ
`SincroPoseMotionSnapshot.leftArm/rightArm.targets` の姿勢スナップショットによる代替処理を使い、Hand ROI / Hand 手首は
手のひら / 指信頼性と ROI 観測の材料に限定する。

意味に基づく動作 / 指の適用の本番適用境界は `SincroVrmPoseComposerDryRunService.compose()` の
姿勢合成処理入力生成位置である。`composerSemanticFingerApplicationMode` は `"composer"` / `"off"` の独立
開発者フラグとし、既定の `"composer"` では保存済み `MotionIntentState`、低次元 Hand スナップショット、
完成版 `AvatarMotionProfile` が有効なフレームだけ `kind: "semantic"` 層を本番試行入力へ
追加する。`"off"` では観測専用の意図 / Hand 推定と記録は残し、意味に基づく動作 / 指層だけを
姿勢合成処理入力から外す。削除済みの腕 / 体幹段階別の切り戻しフラグとは独立した責務であり、
意味に基づく動作 / 指切り戻しが全面適用の所有権を暗黙に変更しない。

意味に基づく動作のレイヤーは `createSemanticMotionPoseLayer()`、指の曲げ層は `createFingerCurlPoseLayers()` を
正本にし、ジェスチャー Recognizer 未加工の結果、MediaPipe 未加工のランドマーク、VRM Object3D、元のボーンノードは
本番層生成入力にしない。`MotionIntentState` が解析処理で無効、プロファイルが
`MinimalAvatarMotionProfile` だけ、または Hand スナップショットが欠損する場合は
`semantic_finger_application_*` 警告を試行要約へ出し、該当層を追加しない。追跡層が
所有する腕ボーンと意味に基づく動作のプリセットが競合する場合は、`semantic_conflict` 抑制または
`owned_bone_conflict:<bone>` 警告で説明する。指の曲げ層は指ボーンだけを所有し、低下した指
ボーン列では存在ボーンへ曲げ重みを再分配するため、欠損ボーン列は姿勢合成処理競合ではなく
`missing_finger_chain:<side>:<group>` 警告として観測する。

motion-debug の `frame.finalPose` は本番試行結果が `available` の場合、その
`VrmPoseComposerResult` から作った `sincro.motion-debug-final-pose.v1` スナップショットを保存・表示する。これにより
`frame.solver.phase9` の意味に基づく動作 / 指診断用スナップショットと同じ本番姿勢合成処理入力が finalPose に反映された
証跡になる。試行結果が無い旧ライブスナップショット / 旧ログだけ、従来の診断専用追跡 finalPose 橋渡しへ
代替処理する。

`full setNormalizedPose(finalPose) application` の本番適用境界は `VRMCharacterManager.update()` の
制御処理更新順に置く。本番試行が同一フレームで `available` かつ `result.finalPose` を持つ場合だけ
`vrm.humanoid.setNormalizedPose(finalPose)` を 1 回呼ぶ。試行が `not_ready`、`invalid_input`、
`missing_profile`、または `available` でも結果欠損の場合は古くなった finalPose を現在の結果に昇格せず、
`full_normalized_pose_application_unavailable:<status>`、`full_normalized_pose_application_result_missing`、
`full_normalized_pose_application_vrm_missing` を診断 Console 要約 / 指標用の利用不可理由として
残す。これらの理由は旧段階別の書き込み処理を起動する発火条件ではない。

Pose 追跡無効、カメラ停止、Pose 未検出、顔のみなど最新動作の変換フレームの `active` が `false` の場合も、
本番試行は現在フレームの代替処理層を `available` 結果として返す。代替処理層は体幹 /
肩を単位回転に戻し、左右の `upperArm` / `lowerArm` / 手には `CHARACTER_ARM_REST_POSE` の腕を下ろした
待機姿勢を適用する。前回の追跡姿勢や旧 `ArmBoneController` 書き込み処理へ戻さない。

頭部 / 首 / 脚 / 表情 / ルート位置は全面上半身 finalPose の所有対象に追加しない。Face / Eye /
Mouth / Emotion 制御処理、`LegBoneController`、`vrm.update(deltaSeconds)`、ルート位置処理群、
`CharacterMotionOrchestrator.updateRootStabilization()` は従来どおり更新する。診断専用の姿勢合成処理比較 /
試行要約は引き続き残し、公開 WebRTC / バックエンド契約や DataChannel 送受信データは変更しない。

補助リンク: [runtime-motion-ownership-map](../../../../tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md)、[torso-shoulder-composer-migration-plan](../../../../tasks/character-sincro-motion/task-260629225951-torso-shoulder-composer-ownership-migration-plan/artifacts/torso-shoulder-composer-migration-plan.md)、[optional-bone-fallback-vrm-verification](../../../../tasks/character-sincro-motion/task-260629225957-composer-optional-bone-fallback-vrm-verification/artifacts/optional-bone-fallback-vrm-verification.md)。

## IKソルバーの方針

- 本流:
    - 自前 3D 2本のボーンによる IK を維持し、`@pixiv/three-vrm` 正規化済みボーンにローカルクォータニオンを適用する。
    - 理由は ADR-260517 に記録する。
    - 腕単体の人体的制約と頭部 / chest 侵入禁止領域はソルバー内の軽量安全性として扱い、全身 IK や物理衝突へ拡張しない。
- 比較対象:
    - `CCDIKSolver` は `SkinnedMesh.skeleton.bones` の索引を要求するため、正規化済みボーン直適用とは責務が合わない。
    - 元のスケルトンボーン列では PoC 動作確認可能だが、目標ボーンの追加と正規化済み・未加工姿勢橋渡しが必要になる。
- 将来候補:
    - 全身、複数末端、足接地拘束が必要になった場合に `closed-chain-ik-js` 等を再評価する。
    - 再評価時は処理担当化、配信ファイルの容量、診断 Console での説明可能性、VRM 個体差への強さを同時に見る。
- 参考のみ:
    - Kalidokit は廃止予定のため、API / 出力形式の参考に留める。

## 変更時の確認

- 新しい動作を追加する時は、どの会話モードで有効かを先に決める。
- 複数制御処理が同時に最大値を出さないよう、調停処理で動作方針を調整する。
- 欠損ボーン / 表情は無効化または近いボーンへの代替処理にする。
- 診断 Console で切り分けたい値はスナップショット / 動作の変換フレームに載せる。

## 参照

- `documents/design/frontend/character/overview.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
