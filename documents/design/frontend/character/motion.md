# Frontend Character Motion

## Summary

- Character motion は `CharacterBehaviorSnapshot` を入力に、head / eye / face / body / arm を低振幅で合成する。
- `chat` では会話の存在感を優先し、`sincro` では face / pose retarget を優先する。
- 各 controller は MediaPipe の生値ではなく、retarget 済みの VRM 向け値を読む。
- 本番 runtime の現在の bone / expression / root position 書き込み順序は task artifact
  [runtime-motion-ownership-map](../../../../tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md)
  を参照する。現時点では `VRMCharacterManager.update()` の本番書き込み順序を変更しない。
- torso / shoulder の composer 所有移行計画は task artifact
  [torso-shoulder-composer-migration-plan](../../../../tasks/character-sincro-motion/task-260629225951-torso-shoulder-composer-ownership-migration-plan/artifacts/torso-shoulder-composer-migration-plan.md)
  を参照する。torso / shoulder 移行は腕 composer 適用 flag とは別段階で扱う。

## Scope

- 対象:
    - 口形同期
    - 感情表情
    - 視線・まばたき
    - idle / listening / AI speech gesture
    - pose retarget の適用境界
- 非対象:
    - tracker runtime
    - WebRTC signaling

## Responsibilities

- `src/character/behavior`
    - `CharacterBehaviorState` と eye / face / head controller を置き、会話・VAD・gaze 由来の状態解釈を担当する。
- `src/character/retargeting`
    - `SincroFaceRetargeter` / `SincroPoseRetargeter` と retarget frame / target 型を置く。
- `src/character/canonical`
    - 後段 motion pipeline が共有する `CanonicalUpperBodyState` contract を置く。
    - 保存対象は body-local の意味量に限定し、VRM bone rotation、Three.js object、MediaPipe landmark object は含めない。
- `src/character/calibration`
    - `InitialSincroCalibrationSession` と step 評価を置き、初期 calibration の status / retry reason / canonical snapshot 変換を担当する。
    - 評価入力は `ReliabilityMap`、optional `CameraQualityScore`、optional `CanonicalUpperBodyState`、`validDurationMs` に閉じ、MediaPipe raw landmark や browser camera API は読まない。
- `src/character/reliability`
    - 後続 estimator / replay / temporal state が共有する `ReliabilityMap` v1 contract を置く。
    - MediaPipe confidence をそのまま制御重みにせず、joint / part / gesture ごとの保存可能な信頼度 snapshot として扱う。
    - Phase 8 の `PoseReliabilityEstimator` は `SincroPoseMotionSnapshot` と optional `SincroHandMotionSnapshot` / `SincroFaceMotionSnapshot` / `CameraQualityScore`、optional `previous.pose` / `previous.mediaTimeMs` / `previous.reliability`、caller 指定の `mediaTimeMs`、`video` size から `ReliabilityMap` を作る pure function とする。Hand / Face 入力が省略された旧経路では Head / Hand / Finger は pose-only placeholder を維持し、Hand / Face 入力がある frame だけ `source: "hand"` / `"face"` の reliability を埋める。
    - Face reliability の ROI component は `face.roi.confidence` を正本にし、Face center consistency は tracker 側の full-frame fallback 判断に閉じる。Hand reliability の ROI component は `calculateRoiConsistency({ expected: hand.roi.referencePoint, observed: hand.fullFrameWrist })` を正本にする。
    - ROI reason は snapshot 自体が無い旧経路では既存 placeholder、snapshot はあるが `roi` field が無い旧 snapshot / 旧 replay log では `not_available_in_pose_snapshot`、ROI metadata の failure warning では `roi_missing` / `roi_inconsistent` に固定する。`roi_missing` と `not_available_in_pose_snapshot` は同じ欠損に同時付与しない。
    - Gesture reliability は Phase 9 まで `source: "neutral"` の placeholder に固定する。Phase 8 の Hand snapshot は palm / finger reliability の材料であり、gesture label や MotionIntent は生成しない。
- `src/features/gaze/handTracking`
    - Phase 8 の HandLandmarker 観測層を置く。
    - `SincroHandMotionSnapshot` は palm normal / direction、finger curl / splay、thumb oppose、openness、handedness summary、ROI observation、full-frame wrist だけを保存する低次元 contract であり、MediaPipe landmark object、crop object、raw landmarks は持たない。
    - Hand feature の scalar と confidence は `0..1` に clamp し、palm tuple は正規化済み 3 要素 tuple に固定する。landmark 欠損または confidence `< 0.2` の hand openness は `unknown` とする。
    - Hand wrist は reliability / palm / finger feature の材料であり、腕 IK の主 target にはしない。腕 IK target は引き続き `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` を正本にする。
    - Gesture Recognizer / MotionIntent は Phase 9 以降の責務とし、Phase 8 の motion pipeline へ gesture label は流さない。Phase 9 の finger bone 適用は Hand snapshot の低次元 finger feature と MotionIntent から semantic layer を作る後段 helper に閉じる。
- `src/features/gaze/trackingRuntime/roiTracking`
    - Phase 8 の Hand / Face tracker 入力境界として、Pose wrist / shoulder 由来の ROI rect と crop-local / full-frame 座標変換を置く。
    - ROI observation は JSON 保存可能な `number`、string enum、plain object、`[number, number]` tuple だけで構成し、MediaPipe landmark object、ImageBitmap / canvas、Three.js object、class instance は含めない。
    - ROI warning は ReliabilityMap の warning enum とは別型で保持する。motion pipeline は後続 reliability task の明示変換が入るまで ROI warning を IK weight や retarget weight に直接接続しない。
- `src/character/temporal`
    - canonical / reliability の後段で共有する `TemporalUpperBodyState` v1 contract を置く。
    - 保存対象は時系列状態、canonical arm scalar、body-local wrist / elbow tuple、速度、recovering blend に限定し、VRM bone rotation、quaternion、IK solver 出力は含めない。
- `src/character/runtime/sincroMotionObserveOnlyPipeline.ts`
    - production `sincro` runtime の Face / Pose callback から `ReliabilityMap`、`CanonicalUpperBodyState`、
      `TemporalUpperBodyState`、`MotionIntentState` を計算し、`SincroMotionPipelineState` へ保存する
      observe-only service を置く。
    - `mediaTimeMs` は TrackerRuntime の video frame timing を優先し、欠損時だけ controller / sink 側の
      callback 受信時刻を明示的に渡す。service / estimator 内部では `performance.now()` を読まない。
    - 本 service は VRM bone / expression / root position、`VRMCharacterManager.update()` の controller
      呼び出し順序、`CharacterBehaviorSnapshot` shape、`composerDryRun` を変更しない。dry-run composer と
      実適用は後続 task の責務に残す。
    - Face-only callback は Pose が無い間 `not_computed` summary に留め、旧 pose-only frame は Face / Hand
      reliability を placeholder として扱う。ReliabilityMap 欠損や optional ROI 欠損を production callback
      の例外にはしない。
    - Degradation 中の Face-only callback は stateful temporal / intent estimator を進めない。Pose callback が
      `mediaTimeMs` 付きで再到着した frame だけ downstream estimator を進め、recovery 時は
      `TemporalUpperBodyState` の `recovering` または comfortable fallback 状態を経由して snap を抑える。
    - production `sincro` では Hand snapshot を `onHandMotion` から `SincroMotionPipelineState.hand` へ保存し、Debug Console へ availability、source、ROI warning、openness、confidence の summary だけを出す。raw landmark、crop object、Hand wrist 座標は常時 UI snapshot に保存しない。
    - Hand snapshot は ReliabilityMap / MotionIntent / finger feature の observe-only 入力に留める。腕 IK target は引き続き `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` を正本にし、Hand wrist で上書きしない。
- `src/character/motionIntent`
    - canonical / temporal / reliability / hand / gesture の後段で共有する `MotionIntentState` v1 contract を置く。
    - 保存対象は左右腕と torso の motion intent、confidence / reliability / expressiveness、入力由来、警告、Gesture Recognizer raw label の説明用 field に限定し、VRM bone rotation、semantic clip、finger bone rotation は含めない。
    - `motionIntentEstimator.ts` は `MotionIntentEstimator` / `createMotionIntentState()` の既存 import 互換入口と公開型 re-export だけを担当する。
    - `motionIntentEstimatorTypes.ts` は estimator input / config、side memory、candidate、frame context の型境界を担当する。公開型は facade から re-export する。
    - `motionIntentEstimatorConfig.ts` は default timing / threshold と normalize を担当し、しきい値の範囲補正を estimator 本体から分離する。
    - `motionIntentCandidateDetectors.ts` は gesture / near-face / wave / motion fallback の candidate 生成を担当する。
    - `motionIntentGlobalDetectors.ts` は clap-like、guarded、side-swap warning など左右横断の観測判定を担当する。
    - `motionIntentSideState.ts` は tracking / lost / fallback / semantic intent の side state builder と warning dedupe を担当する。
    - `motionIntentSideMachine.ts` は side memory、semantic hold、cooldown、fallback duration、candidate stabilization を担当し、candidate 生成とは分ける。
    - `createFingerCurlPoseLayer()` は `SincroHandMotionSnapshot`、`MotionIntentState`、完成版 `AvatarMotionProfile`、caller 指定 `mediaTimeMs`、optional previous finger debug snapshot だけを入力にする。MediaPipe raw landmark、Gesture Recognizer raw result、VRM Object3D、raw bone node は読まない。
- `src/character/motionPostProcessing`
    - Phase 11 の後続 post-processing / lightweight optimization が共有する `MotionPostProcessingResult` v1 contract を置く。
    - `sincro.motion-post-processing.v1` は補正対象を `CanonicalUpperBodyState`、`TemporalUpperBodyState`、`MotionIntentState` に限定する。VRM normalized pose、VRM bone rotation、IK quaternion、avatar profile、MediaPipe raw result、Three.js runtime object は output に含めない。
    - v1 runtime は `NoopMotionPostProcessor` だけを接続し、`processor: { id: "noop", version: "v1", mode: "disabled" }`、`warnings: ["processor_disabled"]`、`corrections: []`、`output: {}` を返す。入力 canonical / temporal / intent は output へ複製しない。
    - `MotionPostProcessingInput.mediaTimeMs` は caller 指定を正本にし、helper / processor 内で `performance.now()` や `Date.now()` は呼ばない。
    - Phase 11 sequence classifier baseline は `MotionSequenceWindow` と `classifyMotionSequence()` に分ける。window は `TemporalUpperBodyState`、`MotionIntentState`、`ReliabilityMap`、`SincroHandMotionSnapshot` だけを低次元 sample として保持し、MediaPipe raw landmark、Gesture Recognizer raw result、VideoFrame / ImageBitmap、Three.js runtime object は受け取らない。
    - `sincro.motion-sequence-window.v1` は最大 1200ms / 90 samples の short window から side ごとの intent transition、semantic hold、gesture flicker、tracking loss、side swap suspect、wrist velocity sign change、hand open/close transition を集約する。Hand availability は sequence feature 専用で、`MotionPostProcessingResult.inputAvailability` へは写さない。
    - `sincro.motion-sequence-classifier.v1` は learned classifier ではなく rule-based baseline とする。出力 event は `wave_sequence`、`gesture_flicker`、`side_swap_anomaly`、`tracking_loss_anomaly`、`stable_semantic_hold` に固定し、`gesture_flicker` / `side_swap_anomaly` / `tracking_loss_anomaly` だけを correction として返す。
    - sequence classifier は correction-only helper であり、`MotionIntentEstimator.update()`、live runtime、replay runtime の state を自動で書き換えない。`wave_sequence` と `stable_semantic_hold` は観測 event に留め、post-processing `output` は `{}` のままにする。
- `src/character/ik`
    - `SincroArmIkSolver` と solver probe / constraint / geometry / pole を置く。
    - `ArmPoleState` v1 は `"stable"`、`"uncertain"`、`"extended"`、`"lost"`、`"recovering"` の lower-case enum とし、IK pole resolver が決定する。TemporalStateEstimator は VRM quaternion / IK pole を扱わない。
    - Phase 11 constrained IK refinement は `SincroArmIkSolver.solveRefined()` の dev-only / opt-in API として置く。既定の `solve()` と production runtime の姿勢適用は変更せず、motion-debug UI toggle も別 task に残す。
    - refinement 候補は original wrist を index `0` に固定し、以降は reach scale、elevation offset、depth scale の deterministic order で最大 5 件だけ評価する。candidate wrist は depth scale、elevation offset、reach scale の順に適用し、original wrist から腕長比 `maxTargetDeltaRatio` を超える候補は破棄する。
    - refinement cost は既存 solver の reach clamp、pole reason code、collisionAvoided、upper/lower quaternion limit、original からの normalized delta だけを読む。評価中に `lastPoleDirection` は更新せず、選ばれた candidate の pole direction だけを最後に commit する。
    - `SincroArmIkRefinementResult` は replay / unit test で保存しやすい plain object debug snapshot とし、候補 index、cost、reject reason、selected / original cost を含める。本番接続、recording slot、motion-debug 操作面への露出は後続 task の責務とする。
- `src/character/vrmPose`
    - `VrmPoseComposer` と VRM normalized local pose contract を置く。
    - v1 は腕周辺 bone と torso fallback を対象にし、`leftUpperArm` / `leftLowerArm` / `leftHand`、`rightUpperArm` / `rightLowerArm` / `rightHand`、存在する場合の shoulder / finger fallback capability、`spine` / `chest` / `upperChest` の torso distribution を扱う。head / neck / leg / expression はまだ composer へ移さない。
    - 入力 layer は `fallback`、`tracking`、`semantic`、`idle`、`style` の順に合成し、`limit` は layer ではなく composer 内部の final limit / clamp stage として扱う。
- `src/character/vrmCharacter`
    - arm / leg / torso / motion orchestrator と `VRMCharacterManager` を置く。
- `FaceMorphController`
    - `telop_ch` 由来の mora / vowel で口形を駆動する。
    - `sincro` ではユーザー口形 retarget を優先する。
- `FaceEmotionController`
    - `expression_code` を VRM expression にマップする。
- `EyeBehaviorController`
    - look expression または eye bone fallback で視線を制御する。
- `HeadBoneController`
    - gaze / retarget / camera fallback を元に首・頭部回転を適用する。
- `CharacterMotionOrchestrator`
    - idle breathing、listening posture、AI speech beat gesture、motion policy を統括する。
- `ArmBoneController`
    - idle gesture と optional pose retarget の腕補正を加算する。
    - `world_3d_ik` では `SincroArmIkSolver` が返す local quaternion を優先し、同じ腕の idle / speech gesture は競合させない。
- `SincroPoseRetargeter`
    - pose target の confidence gate、IK mode selection、smoothing、fallback frame 生成を担当する。
    - IK の数学は `SincroArmIkSolver` に委譲し、retargeter 自体は MediaPipe target と VRM rig scale の橋渡しに留める。
- `motion-debug`
    - `TrackerRuntime` / `SincroPoseTracker` / `SincroPoseRetargeter` / `SincroArmIkSolver` の本番経路を使う IK 調整専用ページ。
    - camera preview、Sincro pose target overlay、VRM 表示、retarget runtime snapshot を同一画面に並べる。
    - `window.__SINCRO_MOTION_DEBUG__` から `startCamera()`、`loadVideoFixture()`、`setRetargetConfig()`、`waitForPoseDetected()`、`getSnapshot()`、`captureFrame()`、`startRecording()`、`stopRecording()`、`downloadRecording()`、`getRecordingState()` を呼べる。
    - replay 操作は同じ window API の developer-only surface とし、`loadRecording(fileOrText)`、`startReplay(options)`、`stepReplay(frameIndex)`、`stopReplay()`、`getReplayState()` を公開する。入力は plain NDJSON `string` または `File` に限定し、compressed Blob import は扱わない。
    - page controller の実装境界は `MotionDebugApp` facade、`motionDebugVrmUrl.ts`、`motionDebugCameraRuntime.ts`、`motionDebugTrackerBridge.ts`、`motionDebugReplayRuntime.ts`、`motionDebugMetricsRuntime.ts`、`motionDebugWindowApi.ts`、`motionDebugSceneRuntime.ts` に分ける。camera / fixture cleanup、replay stop、temporal / intent estimator reset は runtime module が既存の順序を維持し、`MotionDebugApi` の公開 surface は増やさない。
    - snapshot panel は `live`、`recording`、`replay`、`metrics` の viewer mode を持つ。`camera`、`mediapipe`、`poseSnapshot`、`reliability`、`canonical`、`temporal`、`intent`、`postProcessing`、`solver`、`finalPose`、`applied`、`metrics` を layer selector で切り替え、値あり / 未記録 / schema invalid / 未実装 / 未計算を区別する。
    - `metrics` layer は replay frame に `frame.metrics` がある場合、motion metric summary 未計算でも保存済み metrics JSON を表示する。tracker performance budget は `frame.metrics.tracker.budget`、ordered degradation policy は `frame.metrics.tracker.degradationPolicy`、ROI pause / fallback / skip の累積 stats は `frame.metrics.tracker.roi` で確認する。計算済み summary では `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` も既存 metric と同じ JSON value として表示する。viewer は replay metrics に active runtime performance profile も添えて表示する。
    - Motion QA regression は `sincro.motion-qa-fixture-manifest.v1` manifest を入力にする developer-visible harness とする。manifest fixture は P0 fixture id subset、`logText` または caller fetcher 経由の `logUrl`、optional baseline、optional subjective checklist を持つ。subset 実行を既定とし、P0 全件必須は `requireAllP0Fixtures: true` の場合だけ missing fixture を fail として補う。
    - Motion QA regression の判定は replay log を `parseMotionDebugLogLines()` で読み、`calculateMotionMetricSummary()` と optional baseline comparison を fixture 単位で実行する。baseline なしでは summary severity を結果に使い、`not_available` metric を warn 以上にする。baseline ありでは candidate metric fail、または `regressed` かつ severity changed を fail、severity unchanged regression を warn とする。旧 baseline の missing metric key は `not_available` として補完され、fixture warning に残す。
    - Motion metrics の外部 import 互換は `src/character/motionEvaluation/motionMetrics.ts` facade が担い、型、threshold、frame parser、base / tracker / temporal / solver / intent calculator、summary、comparison は責務別 module に分ける。replay log の保存 contract と旧 log fallback は parser / summary 側に閉じ、QA regression harness から見える `calculateMotionMetricSummary()` / `compareMotionMetricSummaries()` の契約は変えない。
    - Composer comparison は `sincro.composer-comparison-summary.v1` summary artifact として旧 retarget runtime snapshot と production composer dry-run result を比較する。frame helper は `calculateComposerComparisonMetrics(input)` で、入力は `{ mediaTimeMs; retarget?; composerDryRun? }` の plain object に限定し、VRM Object3D / normalized bone node / `THREE.Quaternion` instance は保存境界へ出さない。replay parser は `frame.solver.poseRetargetRuntime` だけを正本にし、旧 `frame.solver.poseRetarget` は既存 metrics 用 slot として残すが composer comparison では fallback source にしない。現行 recording の `poseRetargetRuntime` は `upperBody` を保存しないため、parser は `NEUTRAL_POSE_FRAME` を土台に `active`、`confidence`、`ikMode`、`fallbackReason`、`solverProbe`、`anchor`、`leftArm`、`rightArm` だけを上書きし、補完した `upperBody` は angle delta の対象にしない。
    - Composer comparison metric key は `composerAngleDeltaDeg`、`composerAngularVelocitySpike`、`composerOwnedBoneConflictCount`、`composerSuppressionCount`、`composerMissingPoseFrameCount` に固定する。`composerAngleDeltaDeg` は旧 retarget の left/right upper/lower arm quaternion と composer `finalPose` の `leftUpperArm`、`leftLowerArm`、`rightUpperArm`、`rightLowerArm` の geodesic distance 最大値を frame 値とし、summary は available frame の p95、threshold は `{ pass: 12, warn: 25, fail: 45 }` deg とする。`composerAngularVelocitySpike` は composer `clampedBones.reason === "angular_velocity"` の unique bone 数合計、threshold は `{ pass: 0, warn: 2, fail: 5 }` count とし、frame 間速度は再計算しない。`composerOwnedBoneConflictCount` は `owned_bone_conflict:` warning の unique 数合計、threshold は `{ pass: 0, warn: 0, fail: 0 }` count とする。`composerSuppressionCount` は `suppressedLayers.length` 合計、threshold は `{ pass: 0, warn: 30, fail: 120 }` count とする。`composerMissingPoseFrameCount` は retarget 欠損、dry-run 欠損、`status !== "available"`、result 欠損、比較対象 bone 0 件を 1 frame として数え、threshold は `{ pass: 0, warn: 1, fail: 3 }` count とする。5 metric はすべて `lower_is_better` で、summary severity は最大 severity とする。
    - Composer comparison summary は `fixtureId`、`baselineSource`、`status`、`severity`、`metrics`、`warnings`、`unavailableReason?`、`generatedAtIso`、`inputs` を持つ。`status` は `available` または `comparison_unavailable` だけで、`inputs` には baseline manifest path、replay log path の有無、composer dry-run result の有無を plain object で記録する。baseline manifest が `source: not-captured` の場合は実 angle delta を捏造せず、`comparison_unavailable`、`severity: "warn"` 以上、`unavailableReason: "baseline_not_captured"` とし、5 metric すべてを `not_available` / warn 以上にする。captured replay でも `poseRetargetRuntime` または composer dry-run が全 frame で欠損する場合は `unavailableReason: "retarget_or_composer_not_recorded"` とし、旧 log / dry-run 欠損を暗黙 pass にしない。comparison は feature flag 適用タスクの判断材料であり、この summary だけで実適用の合否を自動決定しない。
    - Production `simple-vrm` / `sincro` の replay baseline は `tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md` を索引にし、後続比較では manifest の `source` を確認して実機 baseline、synthetic、not-captured を混同しない。metrics summary は `calculateMotionMetricSummary()` の `sincro.motion-metrics.v1` を使い、fixture id は現行 `MOTION_P0_FIXTURE_IDS` に合わせる。
    - Subjective QA は manifest の `subjectiveChecklist` を regression result へ echo するだけに留める。項目は `natural`、`stable`、`intentReadable`、`noBreakage` で、機械判定には使わない。
    - `window.__SINCRO_MOTION_DEBUG__.runQaRegression(config)` は loaded recording 1 件を manifest subset に包んで実行する。`fixtureId` は config 指定を優先し、無ければ loaded recording manifest の `source.fixtureId` が P0 fixture id の場合だけ採用する。解決できない場合は `fixture_id_required` を返し、`neutral-10s` への暗黙 fallback はしない。
    - Phase 11 の optimization candidate report は `sincro.motion-optimization-candidates.v1` を schema version とする developer-visible artifact であり、`MotionQaRegressionResult` と optional replay frames から deterministic に作る。`generatedAtIso` は caller 指定を正本にし、candidate 抽出 helper 内で現在時刻は読まない。
    - candidate target は metric key だけで固定分類する。elbow / solver / reach clamp 系は `constrained_ik_refinement`、neutral jitter / recovery jump / tracking loss 系は `temporal_correction`、gesture flicker / semantic fallback / cooldown suppression は `gesture_sequence_classifier`、side swap / invalid intent は `anomaly_detector`、tracker budget / dropped frame / degradation / ROI pause は `performance_policy`、その他と `not_available` だけの warn fixture は `do_not_optimize` にする。
    - `performance_policy` は tracker degradation policy の調整候補であり、Phase 11 の learned post-processing 対象にはしない。report には残すが manual gesture label や learned correction dataset の要求には接続しない。
    - candidate report は失敗を Phase 11 の調査先へ振り分けるだけで、runtime correction、`MotionPostProcessingResult.corrections` 生成、model training、dataset export、外部 telemetry 送信は行わない。
    - `window.__SINCRO_MOTION_DEBUG__.analyzeOptimizationCandidates(config)` は loaded recording 1 件に対して既存 `runQaRegression(config)` を先に実行し、成功時だけ candidate report を返す。loaded recording が無い場合は `no_recording_loaded`、fixture id が解決できない場合は `fixture_id_required` を `runQaRegression(config)` と同じ意味で返す。
    - Phase 10 の初回 Motion QA regression は replay log / synthetic log を対象にし、実動画 fixture asset や PNG / binary artifact は追加しない。video fixture の再推論 E2E と subjective QA form UI は別 task の対象に残す。
    - Hand / Face ROI は optional lower fps pass であり、ordered degradation policy v1 では `"gesture-reduced-fps" -> "optional-pass-reduced-fps" -> "roi-hand-paused" -> "pose-reduced-fps" -> "face-only" -> "comfortable-idle"` の順で段階的に退避する。pause 中も Hand lost snapshot と full-frame Face snapshot は更新されるため、motion-debug / reliability は stale、lost、pause を区別できる。
    - `ignorePerformanceFallback` は `face-only` / `comfortable-idle` への自動遷移だけを抑制する。reduced fps と ROI pause stage、`degradationPolicy.stage`、`reasonCodes`、`effectiveCadence` は motion-debug metrics layer へ出続ける。
    - `reliability` layer は live snapshot の `ReliabilityMap` を最優先し、無い場合は saved `frame.reliability`、さらに無い旧 log では `frame.poseSnapshot` から再計算した pose-only reliability を表示する。`RESERVED_PHASE_1_LAYERS` ではなく実装済み layer として扱い、`poseSnapshot` も無い frame だけ `not_recorded` にする。
    - saved `frame.reliability` は `parseReliabilityMap()` で検証し、valid な場合は保存値をそのまま表示する。invalid な場合も replay failure にはせず、`parseStatus: "invalid"`、parse errors、raw value を `available` layer value として表示する。
    - `MotionDebugSnapshot.hand` と `frame.hand` は optional Hand snapshot slot として扱う。replay viewer の reliability layer は saved `frame.reliability` を正本にし、旧 log に Hand / Face reliability が無い場合だけ pose-only fallback を使う。replay 時に raw MediaPipe result や missing hand snapshot から reliability を再推定しない。
    - `canonical` layer は replay frame の `frame.canonical` を優先し、保存値がない場合だけ live snapshot の `canonical` へ fallback する。valid canonical は `schemaVersion`、`timestamp.mediaTimeMs`、左右腕特徴、`source`、`warnings`、`outOfRangeFields`、`calibration.id` を JSON value として確認できる。invalid canonical は replay failure にせず、`parseStatus: "invalid"` と parse error summary を `available` layer value として表示する。
    - `temporal` layer は replay frame の saved `frame.temporal` を最優先し、保存値がない live snapshot では latest temporal を表示する。replay frame に `frame.temporal` が無い旧 log は live recompute で隠さず `not_recorded` とする。saved temporal は `parseTemporalUpperBodyState()` で検証し、invalid な場合も replay failure にはせず、`parseStatus: "invalid"`、parse errors、raw value を `available` layer value として表示する。
    - `intent` layer は replay frame の saved `frame.intent` だけを正本にする。旧 log で `frame.intent` が無い場合は `not_recorded` とし、live snapshot から再推定しない。saved intent は `parseMotionIntentState()` で検証し、valid な場合は `MotionIntentState` を表示、invalid な場合は replay failure にせず `parseStatus: "invalid"`、parse errors、raw value を invalid layer value として表示する。
    - `postProcessing` layer は replay frame の saved `frame.postProcessing` だけを正本にする。旧 log で `frame.postProcessing` が無い場合は `not_recorded` とし、live no-op 再計算では隠さない。saved post-processing は `parseMotionPostProcessingResult()` で検証し、valid な場合は `MotionPostProcessingResult` を表示、invalid な場合は replay failure にせず `parseStatus: "invalid"`、parse errors、raw value を invalid layer value として表示する。
    - motion-debug live / recording runtime は v1 では no-op post processor だけを実行し、`frame.postProcessing` には `processor_disabled` result を保存する。補正が無い frame では canonical / temporal / intent の実値を post-processing `output` に二重保存しない。
    - `solver` layer は `value.phase6`、`value.phase7`、`value.phase9` の substatus を持つ。Phase 6 は `frame.solver.phase6`、Phase 7 は `frame.solver.phase7`、Phase 9 は `frame.solver.phase9` を正本にし、旧 log の `frame.solver.poseRetarget` / `frame.solver.poseRetargetRuntime` は保持するが Phase 6 / Phase 7 / Phase 9 snapshot としては live recompute しない。
    - replay viewer の `solver` 外側 status は、`phase6`、`phase7`、`phase9` がすべて `not_recorded` の場合だけ `not_recorded` とする。いずれか 1 つでも `available` または `invalid` なら外側 status は `available` とし、missing / invalid は substatus に閉じる。
    - saved `phase6` は `parseMotionDebugPhase6SolverSnapshot()` で検証し、未知 schemaVersion、非 finite number、unknown enum、runtime object 風 value は `phase6.status = "invalid"` として表示する。
    - saved `phase7` は `parseMotionDebugPhase7Snapshot()` で検証し、`profile` は `parseAvatarMotionProfile()`、`onlineCalibration` は `parseOnlineSincroCalibrationState()`、`initialCalibration` と `activeCanonicalCalibration` は Phase 7 snapshot 境界の strict schema で検証する。旧 log に `phase7` がない場合は `phase7.status = "not_recorded"` とし、schema 違反時も log load 自体は失敗させない。
    - saved `phase9` は `parseMotionDebugPhase9SemanticSnapshot()` で検証し、旧 log に `phase9` がない場合は `phase9.status = "not_recorded"`、schema 違反時は `phase9.status = "invalid"` とし、schema 違反時も log load 自体は失敗させない。
    - `finalPose` layer は `frame.finalPose.schemaVersion = "sincro.vrm-pose-composer-result.v1"` の composer result snapshot を正本にする。旧 log で `frame.finalPose` が無い場合は replay failure ではなく `not_recorded` とし、schema が壊れている場合だけ `invalid` layer にする。
    - `recording` mode は frame count、duration、compression、compression fallback、scrub 済み camera settings の有無を表示する。
    - `replay` mode は replay mode、current frame、source timestamp、determinism check result、最新 `poseRetargetRuntime` summary を表示する。
    - `metrics` mode は `calculateReplayMetrics(config)` が返した `MotionMetricSummary` を表で表示し、metric key、value、status、severity、threshold、baseline comparison を確認できる。`not_available` metric は pass 色にしない。
    - `startRecording()` は live camera / video fixture 起動後だけ成功し、`MotionDebugApp` が full manifest を生成して `MotionDebugRecorder` に渡す。
    - `downloadRecording()` は stopped recorder から NDJSON / gzip NDJSON / Brotli request fallback の Blob を作り、DOM download link は `motion-debug` ページ側で生成する。
    - `pose-snapshot` replay は `frame.poseSnapshot` を `CharacterBehaviorState.applyPoseMotion()` 相当の入口へ流し、live camera と同じ `VRMCharacterManager.update()` 内で `SincroPoseRetargeter.retarget()` を呼ぶ。
    - `final-pose-playback` replay は solver 後の saved frame を再描画 / preview するための予約 mode であり、retarget / solver は再実行しない。v1 log で `frame.finalPose` が欠落する場合は `missing_final_pose` を返す。
    - `mediapipe-raw-result` replay は raw serializer が揃うまで予約のみとし、Phase 1 では呼び出し可能だが常に `unsupported_mode` を返す。
    - Debug Console と同じ retarget config / runtime snapshot を内部的に更新するが、RTC / chat / telop は起動しない。
- `SincroArmIkSolver`
    - VRM normalized arm chain の neutral quaternion、腕長、肩幅、pole 方向をロード時に測定する。
    - 肩相対の wrist target と elbow pole target から upper/lower arm の local quaternion を返す。
    - 到達不能 target は腕長内へ clamp し、neutral からの最大角で急な反転を抑える。
    - 肩の lift / open / depth、lower arm delta、elbow pole 反転を solver-side constraint として制限する。
    - `ArmPoleState` は input temporal state、肘屈曲、target reach ratio、candidate pole と previous / bind pole の dot から決める。`lost` input は `"lost"`、`recovering` input は `"recovering"`、`elbowFlexionRad < 0.18` または target reach ratio `> 0.96` は `"extended"`、candidate hard reject は `"uncertain"`、それ以外は `"stable"` とする。
    - pole blend は state ごとに measured / previous / bind fallback を選ぶ。`"stable"` は measured、`"uncertain"` は previous 70% / bind fallback 30%、`"extended"` は previous 50% / bind fallback 50%、`"recovering"` は `recoveringBlendProgress` で previous から measured へ復帰、`"lost"` は previous 100% とする。previous が無い場合は bind pole を previous とみなす。
    - candidate と previous / bind projected pole の dot が `poleFlipDotThreshold` 未満なら reason code `pole_flip_rejected` と pole weight scale `0.68` を返す。dot が `poleFlipDotThreshold <= dot < 0.18` なら `pole_uncertain_downweighted` と pole weight scale `0.82` を返す。solver の最終 `constraint.weightScale` は既存 constraint weight と pole weight scale の乗算とする。
    - head sphere と chest ellipsoid の軽量 no-go zone で、hand target と forearm segment の深い貫通を抑える。
    - constraint / collision 発火時は target の押し戻しと IK weight 減衰を優先し、入力 target の品質補正や外れ値除去は持たない。
    - `SincroArmIkConstraintSnapshot` は既存 `reasons`、`jointLimited`、`poleStabilized`、`collisionAvoided`、`weightScale`、`targetPushDistance` に加え、optional `poleState`、`reasonCodes`、`angularVelocityClamped`、`wristRollDamped`、`wristRollInfluence` を持つ。`reasonCodes` は pole hard reject / soft downweight を含む developer-visible reason code の重複なし配列として扱う。
    - `wristRollInfluence` は IK target から `0..1` clamp して snapshot に保存するだけに留める。forearm / wrist twist 分配、wrist roll damping、angular velocity clamp の最終 quaternion 反映は Phase 6 composer 側で完成させる。
- `VrmPoseComposer`
    - `VrmNormalizedLocalPose` は `VRMHumanBoneName` key の plain quaternion object とし、`THREE.Quaternion` instance は計算中だけ使う。
    - `ownedBones` は composer order の first-seen unique な出力対象 bone とし、重複所有は `owned_bone_conflict:<bone>` warning に残す。tracking layer の IK quaternion が同じ腕の bone を所有している場合、idle / speech gesture 相当の additive はその bone だけ `tracking_owns_bone` として抑制する。
    - `semantic` layer は `MotionIntentState` から作る developer-visible な意図表現 layer とし、tracking pose の後、idle / style の前で partial override / additive として扱う。同じ upperArm / lowerArm / hand bone を tracking layer が所有している場合、semantic metadata の `intentConfidence` が `0.65` 未満ならその bone だけ `semantic_conflict` として抑制する。metadata が無い semantic layer は confidence `0` とみなす。
    - semantic preset id は `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`soft_clap_like`、`lost_to_comfort` に固定する。v1 の semantic pose は upperArm / lowerArm / hand 相当の VRM humanoid bone quaternion だけを出し、spine / chest / head / expression / finger chain 全体は所有しない。
    - finger curl semantic layer は arm semantic preset とは別に `id: "finger-curl:<side>"`、`kind: "semantic"`、`blendMode: "additive"` として生成する。所有 bone は `AvatarMotionProfile.capabilities.fingerChains` で存在が確認できる thumb / index / middle / ring / little の finger chain だけに限定し、upperArm / lowerArm / hand / torso / head は所有しない。
    - finger group は `thumb`、`index`、`middle`、`ringLittle` に固定する。`ring` と `little` は v1 では同じ group curl を使い、個別 semantic intent は作らない。`open / half / closed / unknown` openness は finger curl 欠損時だけ fallback として使い、`unknown` は previous debug の side と時刻差が有効な場合だけ保持する。
    - finger curl distribution は `AvatarMotionProfile.fingers.curlDistribution` を正本にし、`proximal + intermediate + distal` が `1.0 ± 0.001` から外れる場合は `{ proximal: 0.5, intermediate: 0.3, distal: 0.2 }` に戻して warning を残す。欠損 chain では存在 bone の元 weight だけを合計して正規化し、proximal only は curl 全量を入れるが angle limit を通常の `0.65x` に下げる。
    - finger pose axis は v1 固定とする。curl は local `+X` axis に `-angle`、splay は local `+Z` axis に left `+angle` / right `-angle`、thumb oppose は local `+Y` axis に left `+angle` / right `-angle` を入れる。合成順は `curl -> splay -> thumbOppose`、実装上の quaternion は `final = oppose * splay * curl` とし、`THREE.Quaternion` instance は layer / debug snapshot に残さない。
    - `MinimalAvatarMotionProfile.optionalBones` を読み、欠損している hand / finger bone は final pose へ出さない。欠損 shoulder への補正は `solverDefaults.shoulderDamping` で damp して upperArm へ分配する。
    - torso fallback helper は完成版 `AvatarMotionProfile.torso.distribution` を正本として torso delta quaternion を `spine` / `chest` / `upperChest` に分配する。profile distribution が非 finite、negative、または合計 `1.0 ± 0.001` から外れる場合は capability default へ戻し、warning code は `invalid_torso_distribution_profile_defaulted` だけを使う。
    - capability default distribution は `spine+chest+upperChest` で `{ spine: 0.25, chest: 0.40, upperChest: 0.35 }`、`spine+chest` で `{ spine: 0.35, chest: 0.65, upperChest: 0 }`、それ以外で `{ spine: 1, chest: 0, upperChest: 0 }` とする。helper は存在する torso bone だけを `ownedBones` に含め、composer は欠損 `upperChest` を `missing_optional_bone` として抑制する。
    - final limit / clamp stage は quaternion normalize と angular velocity clamp hook を持つ。angular velocity clamp は `previousFinalPose` と `deltaSeconds > 0` がある場合だけ実行し、既定値は `720deg/sec` とする。
    - v1 は developer-only path として motion-debug / helper から同じ input で呼べる contract を固める段階であり、本番の `ArmBoneController` / `CharacterMotionTorsoApplier` bone 書き込みや `VRMCharacterManager.update()` の順序は変更しない。motion-debug は recording / live snapshot 用に tracking layer 由来の composer result を生成し、`finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を保存・表示する。
    - production `sincro` runtime では `src/character/runtime/sincroVrmPoseComposerDryRun.ts` の dry-run service が `VRMCharacterManager.update()` 内で `composeVrmPose()` を observe-only 実行する。入力は latest `SincroPoseRetargetFrame`、`AvatarMotionProfile` / `MinimalAvatarMotionProfile`、service が保持する optional previous final pose、`deltaSeconds` に限定し、生成 layer は fallback と tracking だけにする。semantic / finger layer は後続の適用 feature flag で所有境界を確定するまで混ぜない。
    - production dry-run result は `{ status: "available" | "not_ready" | "invalid_input" | "missing_profile"; result?: VrmPoseComposerResult; warnings: string[] }` とし、`status !== "available"` では `result` を持たない。available result の `finalPose` は次 frame の angular velocity clamp 入力としてだけ保持し、Debug Console には status、warnings、suppressed layer、clamped bones の summary を表示する。
    - `face-only` / `comfortable-idle` などで latest retarget frame が無い frame は `not_ready` として扱い、前回
      `available` の `finalPose` を現在 frame の適用候補として返さない。古い `finalPose` は angular velocity
      clamp の内部入力にだけ使い、実 VRM 適用や Debug Console の current result には昇格させない。
    - dry-run は `vrm.humanoid.setNormalizedPose()`、normalized bone node の `rotation` / `quaternion`、expression、root position を更新しない。既存 controller 呼び出し順と `vrm.update(deltaSeconds)` の位置も変更しないため、本番表示は従来の direct bone write を正本に保つ。
    - optional bone fallback の検証結果は task artifact
      [optional-bone-fallback-vrm-verification](../../../../tasks/character-sincro-motion/task-260629225957-composer-optional-bone-fallback-vrm-verification/artifacts/optional-bone-fallback-vrm-verification.md)
      を参照する。`default.vrm` と `aoi-1.0.7.vrm` は full upper body capability として確認済みで、missing
      `upperChest`、missing shoulder、reduced finger chain は実 asset ではなく synthetic profile / unit test で確認済みである。実 VRM の欠損個体での visual 確認は `setNormalizedPose(finalPose)` 適用前の残リスクとして残す。
    - 本番 runtime の現行 ownership map は task artifact
      [runtime-motion-ownership-map](../../../../tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md)
      を正本にする。移行前の `move-to-composer` / `keep-controller-owned` / `needs-decision` 分類は設計本文へ重複展開しない。
    - `CharacterMotionTorsoApplier` の置き換え計画は task artifact
      [torso-shoulder-composer-migration-plan](../../../../tasks/character-sincro-motion/task-260629225951-torso-shoulder-composer-ownership-migration-plan/artifacts/torso-shoulder-composer-migration-plan.md)
      を正本にする。torso / shoulder 移行は腕 composer 適用 flag と別段階で進め、shoulder bone 欠損時の upperArm fallback だけを境界確認点にする。
    - `vrm.humanoid.setNormalizedPose(finalPose)` への全面移行は後続 task に残す。移行ゲートは、head / neck / leg / expression の所有境界、motion-debug final pose replay、既存 controller との二重書き込み排除、複数 VRM での clamp / optional bone 検証が揃うこととする。
- `sincroCcdIkProbe`
    - Three.js 公式 addon `CCDIKSolver` と VRM raw / normalized bone の相性を見るための PoC 診断。
    - 左腕 raw skeleton chain に対して one-iteration smoke test を行い、結果を Debug Console の `CCDIK PoC` に表示する。
    - 本番の pose retarget 結果は変更しない。

## Data / State

- `CharacterBehaviorSnapshot`
    - VAD envelope
    - gaze
    - AI speech state
    - emotion code
    - talk mode
    - faceMotion / poseMotion
    - motion policy
- `SincroMotionPipelineState`
    - 本番 `sincro` runtime の observe-only / dry-run 用低次元 motion pipeline state として
      `src/character/runtime/sincroMotionPipelineState.ts` に置く。
    - `face`、`pose`、optional `hand`、optional `reliability`、optional `canonical`、optional
      `temporal`、optional `intent`、optional `composerDryRun`、`updatedAtMs` を持つ plain object に固定する。
    - `CharacterBehaviorSnapshot` は既存どおり face / pose / VAD / AI speech の集約点として維持し、
      canonical / temporal / intent を直接追加しない。`CharacterBehaviorState` への接続も後続
      observe-only task の責務に残す。
    - runtime 内部の現在値 contract であり、保存境界ではないため schemaVersion と parser は持たない。
      replay / recording へ出す場合は既存 motion-debug log の `frame.reliability`、`frame.canonical`、
      `frame.temporal`、`frame.intent`、`frame.finalPose` slot と各 parser を使う。
    - state clone は Face / Pose / Hand / MotionIntent の既存 clone helper を優先し、helper が無い
      downstream slot は defensive clone で warning 配列や tuple を後続変更から分離する。
    - THREE instance、MediaPipe raw result、DOM、MediaStream、VideoFrame は state に含めない。
- `SincroMotionObserveOnlySummary`
    - Debug Console の `Sincro Motion` panel に常時表示する小さい state summary とする。
    - `reliability`、`canonical`、`temporal`、`intent` ごとに `available` / `not_computed` /
      `invalid_input`、短い reason、警告数を表示する。`SincroMotionPipelineState` 本体や巨大 JSON dump は
      常時描画せず、詳細 inspection は後続 debug tooling / motion-debug の責務に残す。
- `CharacterMotionConfig`
    - motion scale
    - easing
    - idle/listening/AI speech amplitude
- `SincroFaceRetargetSnapshot`
    - head / eye / blink / mouth の VRM 向け値
- `SincroPoseRetargetFrame`
    - upper body / arm の additive rotation と fallback reason
    - 腕 IK は `SincroPoseTargetPointSnapshot.quality` と `ikWeight` を読み、weak wrist / elbow では IK 強度を落として feature retarget と合成する。
    - `feature_only` は従来の低振幅 Euler additive 値のみを使う。
    - `screen_space_ik` は 2D target から Euler additive 値を作る lightweight fallback として残す。
    - `world_3d_ik` は `SincroPoseTargetPointSnapshot.world` の normalized target を入力候補にし、VRM rig scale / bone length / handedness へ変換したうえで quaternion を出力する。
    - MediaPipe world target は入力 video と同じ左右を維持し、上下・奥行きを VRM 表示側へ反転する。Z は tracker 揺れを考慮して弱めに使う。
    - `SincroPoseRetargetedArm.ikWeight` は Debug Console で full IK と weak IK を切り分けるための runtime 値。
    - `SincroPoseRetargetedArm.ikSolverMode` は `feature_only` / `screen_space_ik` / `world_3d_ik` の切り分けを Debug Console に表示する。
    - `SincroPoseRetargetedArm.constraint` は `joint_limited`、`elbow_pole_stabilized`、`head_collision_avoided`、`chest_no_go_zone`、`forearm_twist_limited` など、solver-side safety が効いた理由と weight scale を表示する。
    - `solverProbe.ccdik` は external solver 採用判断用の診断値であり、実際の腕姿勢には適用しない。
- `SincroRoiObservation`
    - Hand / Face Landmarker の前段で使う ROI 保存 contract であり、`side`、`source`、`rect`、`confidence`、optional `referencePoint`、`warnings` を持つ。
    - `rect` は full-frame normalized image coordinate の center 形式に固定し、`centerX`、`centerY`、`width`、`height`、`clamped` を保存する。crop-local point は `0..1`、full-frame point も `0..1` の `[number, number]` tuple とする。
    - v1 は axis-aligned square / rectangle のみを扱い、rotated crop、`rotationRad`、palm basis、手首 roll は ROI rect に混ぜない。Hand / Face result 後段の feature として別 contract に渡す。
    - Pose wrist が finite で `quality !== "lost"` の場合だけ Hand ROI は `source: "pose-wrist"` になる。欠損時は throw せず `source: "none"`、`confidence: 0`、`roi_missing` warning の observation を返し、Pose-only / fallback 継続を妨げない。
    - Face ROI は左右 shoulder center と shoulder width を主入力にする。Pose 未検出または shoulderWidth が finite positive でない場合は `source: "none"`、`confidence: 0` の failure observation として扱う。
    - Hand tracker は left / right の ROI が両方 invalid の場合だけ full-frame fallback を同一 frame で 1 回実行する。片側 ROI だけ invalid な場合はその side を lost にし、反対側の valid ROI 推論を継続する。
    - Hand full-frame fallback の左右 assignment は復元後 wrist と Pose wrist の距離を主条件にし、同じ hand result の二重割当は拒否する。
    - ROI rect clamp は left / top / right / bottom を clip して center / size を再計算する。`validateRoiRect()` の順序は finite check、edge clip、min size check、confidence clamp に固定する。
    - ROI consistency は Pose wrist / face expected point と ROI 由来 full-frame point の距離から score `0..1` を返す。`roi_inconsistent` は ROI contract の warning であり、ReliabilityMap へは後続 task で明示的に写像する。
- `SincroFaceMotionSnapshot` の ROI metadata
    - Face ROI は head orientation / face reliability の入力品質を観測するための metadata として、既存 `SincroFaceMotionSnapshot` に optional `roi`、`source`、`warnings` を追加して扱う。別の Face ROI snapshot は作らない。
    - `source` は `"roi"`、`"full-frame"`、`"full-frame-fallback"`、`"lost"` に固定する。既存 retarget は `detected`、`confidence`、`headPose`、`blendshapes` を従来どおり読む。
    - ROI crop の FaceLandmarker result は crop-local result として扱い、`headPose.matrix` は従来どおり FaceLandmarker の transformation matrix number array だけを保存する。crop-local face landmark 全点、canvas、ImageBitmap、MediaPipe raw result は保存しない。
    - ROI が no-face の場合、または Pose face ROI center と Face result center の consistency score が `0` の場合は同一 frame で full-frame fallback を 1 回だけ使う。fallback でも未検出なら `source: "lost"`、`fallbackReason: "face_not_detected"` とし、`roi_missing` または `roi_inconsistent` warning を残す。
    - Worker / TrackerRuntime は Pose が実行された frame だけ Face ROI を試す。Pose 未実行 frame と face-only fallback 中は full-frame Face tracking を続け、Face retarget や head temporal の cadence を Pose cadence に合わせない。
    - Face / ROI 専用 reliability は Phase 8 で `ReliabilityMap.joints.head` / `parts.head` に接続済みである。Face retarget の入力値は従来どおり `detected`、`confidence`、`headPose`、`blendshapes` を読み、ROI metadata は reliability / debug / replay の説明材料に留める。
- `CanonicalUpperBodyState`
    - `sincro.canonical-upper-body.v1` を schema version とする、JSON 保存可能な upper body contract。
    - motion-debug の `frame.canonical` slot にそのまま保存できる plain object として扱い、replay / metrics / temporal / intent / IK が同じ名前・単位で読む。
    - 左右は `left` / `right` の解剖学的 side に固定し、camera preview や screen mirror の左右は表さない。
    - `torso.coordinateSystem` は `body_local` に固定し、`shoulderCenter`、`bodyRight`、`bodyUp`、`bodyFront`、`shoulderWidth`、`torsoScale`、`yawRad` を finite number / 3 要素 tuple で保存する。
    - torso frame 推定は `SincroPoseMotionSnapshot` の左右 shoulder world target を最優先する。両肩の `world.hasWorldCoordinates` が true で、`normalizedX/Y/Z` が finite の場合だけ `shoulderCenter`、解剖学的右方向の `bodyRight`、`shoulderWidth` を pose 由来として採用する。
    - 左右 hip world target が同じ条件で有効な場合だけ `hipCenter` と `bodyUp = normalize(shoulderCenter - hipCenter)` を pose 由来で作る。hip world target 欠損時は `previous.torso.hipCenter` がある場合だけ引き継ぎ、ない場合は `hipCenter` を省略する。`calibration.torsoScale` は `torsoScale` fallback にだけ使い、synthetic hip center は作らない。
    - `bodyFront` は `normalize(cross(bodyRight, bodyUp))` を候補にする。前フレームの `bodyFront` と dot product が負の場合は前フレームを維持し、`front_flip_rejected` warning を付ける。前フレームがない場合は有効な Face yaw から `normalize([sin(yawRad), 0, cos(yawRad)])` を hint にし、hint と逆向きの候補を反転して同じ warning を残す。
    - Face yaw は `SincroFaceMotionSnapshot.headPose.yawDeg` を radian 化して `yawRad` に保存する。Face 未検出、confidence `< 0.08`、または Face snapshot 欠損時は yaw hint を使わず、`previous.torso.yawRad`、`calibration.neutralYawRad` の順に fallback する。
    - calibration 未指定時は `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` を使う。肩幅が pose 由来で有効に取れた frame では、戻り値の `calibration.shoulderWidth` を同じ値へ更新し、replay / metrics が同じスケールを参照できるようにする。
    - `arms.left` / `arms.right` は `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification` と part meta を保存する。値域外の入力は parse 時に reject し、計算側が clamp した場合だけ `outOfRangeFields` に元値と clamp 後の値を残す。
    - canonical arm feature は `SincroPoseMotionSnapshot` の shoulder / elbow / wrist target と torso frame だけから抽出する。`reach` は shoulder-wrist body-local 距離を肩-肘 + 肘-手首の腕長で割った無次元値、`elevationRad` は body-local 方向 Y 成分の radian、`openness` は解剖学的 side 方向を正にした `-1..1`、`forwardness` は body-front 方向・MediaPipe world Z・2D 投影短縮を重み付き再正規化した `0..1`、`elbowFlexionRad` は伸び切り `0` から屈曲 `Math.PI` へ近づく radian とする。
    - `classification` は deterministic rule で、`confidence < 0.15` を `unknown`、`openness < -0.25` を `crossed` 優先、`forwardness >= 0.62 && abs(openness) < 0.35` を `front`、`abs(openness) >= 0.45 && forwardness < 0.45` を `side`、`forwardness >= 0.35 && abs(openness) >= 0.25` を `diagonal`、それ以外を `unknown` とする。
    - Phase 4 時点では optional `ReliabilityMap` を受け取った場合だけ、arm confidence を `poseConfidence * sqrt(partWeight * minJointWeight)` で downweight する。`partWeight` は該当 arm の `PartReliability.finalWeight`、`minJointWeight` は shoulder / elbow / wrist joint `finalWeight` の最小値とする。
    - arm reliability が `lost` の場合は canonical arm source を `neutral`、confidence を `0` にする。`suspect` は source `pose` の低 confidence 観測として保持し、TemporalStateEstimator / MotionSolver が後続 Phase 5 / 6 で扱う。
    - canonical warning 変換は `ReliabilityWarningCode` ではなく、該当 arm の part / joint `components.side.reasonCodes`、`components.boneLength.reasonCodes`、`components.bodyScale.reasonCodes` を読む。`side_inconsistent` は `left_right_swap_suspect`、`bone_length_inconsistent` / `body_scale_jump` は `out_of_range` へ写す。
    - `calibration` は default / initial / online / replay の snapshot とし、未実装時も `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` を保存して replay の決定性を保つ。
    - `SincroPoseRetargetFrame` の VRM additive rotation、IK solver の quaternion、AnimationMixer 出力は canonical arm feature の入力にも canonical state にも入れず、retarget / final pose の別 slot に分ける。
- `TemporalUpperBodyState`
    - `sincro.temporal-upper-body.v1` を schema version とする、canonical / reliability の後段で使う JSON 保存可能な時系列 state contract。
    - motion-debug の `frame.temporal` optional slot に保存する plain object として扱い、replay / viewer / metrics / intent / IK が同じ state enum と scalar を読めるようにする。
    - `TemporalPartState` は `"tracked"`、`"suspect"`、`"predicted"`、`"lost"`、`"recovering"` の lower-case enum に固定する。roadmap 上の大文字表記は文書上の呼称であり、保存値と log 境界では使わない。
    - `arms.left` / `arms.right` は `reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`、`classification`、optional `bodyLocalWrist` / `bodyLocalElbow`、velocity、optional `recoveringBlend` を保存する。
    - `head` は optional で、未観測 frame では省略できる。保存する場合は yaw / pitch / roll と angular velocity、part meta、optional `recoveringBlend` だけを持つ。
    - 値域は parser で固定し、`confidence` と `recoveringBlend.progress` は `0..1`、`stateAgeMs` / `observedAgeMs` は `>= 0`、arm scalar と recovering duration は contract の範囲外を `out_of_range` として reject する。
    - `parseTemporalUpperBodyState()` は replay / viewer 境界の検証 API であり、未知 `schemaVersion` は `unknown_schema_version`、非 finite number / unknown enum / extra key / class instance は `invalid_state` として返す。
    - `TemporalUpperBodyState` は CanonicalUpperBodyState の時間方向の状態推定 contract であり、VRM normalized pose、IK target quaternion、AnimationMixer 出力は Phase 6 以降の MotionSolver / VrmPoseComposer と `finalPose` 系 slot の責務に残す。
    - Phase 5 の `TemporalStateEstimator` v1 は `CanonicalUpperBodyState`、optional `ReliabilityMap`、caller 指定の `mediaTimeMs` から observed frame の `TemporalUpperBodyState` を作る stateful estimator とする。estimator 内で `performance.now()` は呼ばず、`reset()` は previous temporal state、One Euro Filter、classification hold を破棄する。
    - v1 の腕 state transition は observed frame のみを扱う。canonical arm confidence `>= 0.65` かつ reliability arm part と shoulder / elbow / wrist joint がすべて `tracked` の場合は `tracked`、confidence `0.05..0.65` または reliability の最悪 state が `suspect` / `predicted` / `recovering` の場合は `suspect`、confidence `< 0.05` または reliability 最悪 state が `lost` の場合は `lost` とする。ReliabilityMap が欠損する旧 log / partial frame では canonical confidence だけで判定する。
    - reliability 集約は arm part と shoulder / elbow / wrist joint の最悪 state を使い、優先順位は `lost > predicted > recovering > suspect > tracked` とする。ただし Phase 5 observed estimator は `predicted` / `recovering` を出力 state として生成せず、入力 reliability の両 state は `suspect` に downcast する。
    - v1 の filter は腕 scalar (`reach`、`elevationRad`、`openness`、`forwardness`、`elbowFlexionRad`) と `bodyLocalWrist` に One Euro Filter を適用する。既定値は `minCutoff: 1.8`、`beta: 0.45`、`dCutoff: 1.0` で、`TemporalStateEstimatorConfig` から override できる。velocity は filter 後の値差分から計算する。
    - `TemporalPartMeta` の `confidence` は filter 入力候補の canonical arm confidence、`source` は `tracked` / `suspect` で `canonical`、`lost` で `neutral` とする。`stateAgeMs` は同じ state の継続時だけ `mediaTimeMs` 差分で加算し、`observedAgeMs` は `tracked` / `suspect` で `0`、`lost` で前回値へ差分を加算する。warning は low confidence で `low_confidence`、lost で `dropout`、classification hold で `classification_held`、invalid dt で `out_of_range` を重複なしで保存する。
    - classification は candidate が confidence `>= 0.35` で 160ms 以上連続した場合だけ更新する。hold 中または confidence `< 0.35` では前回 classification を維持し、初回 / reset 後は default temporal arm の `side` を基点にする。
    - `dtMs <= 0`、`dtMs > 250`、非 finite dt の frame は filter 内部状態を更新せず、前回 filtered 値を維持して velocity を `0` にする。lost frame は canonical の低信頼値を filter に投入せず、前回 filtered 値、velocity、state/meta から dropout policy を適用する。
    - arm が `lost` になってから `observedAgeMs <= 700` の間は、前回 filter 後 scalar / body-local wrist と velocity から constant-velocity prediction を行い、`state: "predicted"`、`source: "predicted"`、warning `prediction_active` / `velocity_damped` を保存する。prediction velocity は `predictionVelocityDampingPerSec: 0.55` を frame `dt` に応じて per-second 減衰する。
    - `observedAgeMs > 700` で prediction window が終わった arm は、`state: "lost"`、`source: "comfortable"` として comfortable pose へ退避する。comfortable scalar は `reach: 0.35`、`elevationRad: -0.25`、`openness: 0.15`、`forwardness: 0.15`、`elbowFlexionRad: 1.15`、`classification: "side"` に固定し、前回 predicted / filtered 値から `recoveringBlendMs` 既定 `260ms` で近づける。`openness` は左右反転しない正規化 scalar とし、body-local wrist / elbow tuple を補う場合だけ x 方向を arm side に合わせる。
    - Tracker runtime の `comfortable-idle` stage は comfortable pose を直接生成しない。tracker は camera / Face tracking を継続したまま Pose fallback と Hand lost snapshot、`degradationPolicy` reason を出すだけにし、comfortable scalar への blend は TemporalStateEstimator、MotionSolver、VrmPoseComposer の責務に残す。
    - lost / predicted / comfortable / recovering 後に arm confidence が `>= 0.65` へ戻り、reliability が tracked になった arm は `state: "recovering"`、`source: "mixed"` として filtered observation へ復帰する。`recoveringBlend` は `from`、`progress`、`durationMs` を保存し、warning `recovery_blend` を付ける。`recoveringBlendMs` は config で上書きできるが `180..400` に clamp する。
    - recovering 中の 1 frame あたり scalar jump は `maxRecoveringAngleJumpRad: 15deg` 相当に clamp する。`elevationRad` / `elbowFlexionRad` は radian clamp、`reach` / `openness` / `forwardness` は各値域に同じ比率を掛けた clamp を使う。prediction / comfortable fallback / recovering は左右腕ごとに独立して処理する。
    - canonical `head` が存在する frame だけ、yaw / pitch / roll に arm と同じ `tracked` / `predicted` / `lost` / `recovering` policy を optional に適用する。v1 では Face matrix 由来 head reliability は扱わず、Head / Face 専用 reliability 接続は Phase 8 以降に残す。
    - VRM quaternion、IK pole、final pose smoothing は TemporalStateEstimator では扱わず、Phase 6 以降の MotionSolver / IK / VrmPoseComposer の責務に残す。
- `MotionIntentState`
    - `sincro.motion-intent.v1` を schema version とする、canonical / temporal / reliability の後段、semantic pose / IK / finger bone 適用の前段で使う JSON 保存可能な motion intent contract。
    - motion-debug の `frame.intent` optional slot に保存する plain object として扱う。motion-debug log schema では `z.unknown().optional()` のまま保持し、log load 全体の互換性は壊さない。
    - `arms.left` / `arms.right` の `intent` は `"tracking"`、`"wave"`、`"pointing"`、`"thumbsUp"`、`"peace"`、`"nearFace"`、`"explain"`、`"clapLike"`、`"guarded"`、`"lost"`、`"fallback"` に固定する。保存値は lower camel case とし、`"thumbs_up"`、`"openPalm"`、Gesture Recognizer の raw label は arm intent として保存しない。
    - `torso.intent` は `"neutral"`、`"leaning"`、`"turning"`、`"settling"` に固定する。v1 では腕と同じ semantic gesture 名を torso に入れない。
    - `sourceGestureLabel` は Gesture Recognizer の raw label を説明用に保存する optional field であり、`intent` の代替値にはしない。
    - `confidence`、`reliability`、`expressiveness` は `0..1`、`ageMs`、`stableDurationMs`、`cooldownRemainingMs`、`timestamp.mediaTimeMs` は finite かつ `>= 0` に固定する。
    - warning code は `"low_hand_reliability"`、`"low_pose_reliability"`、`"gesture_unstable"`、`"gesture_cooldown"`、`"wave_motion_missing"`、`"near_face_hold"`、`"left_right_swap_suspect"`、`"fallback_active"`、`"invalid_dt"` に固定する。
    - `parseMotionIntentState()` は replay / viewer 境界の検証 API であり、未知 `schemaVersion` は `unknown_schema_version`、範囲外 number は `out_of_range`、非 finite number / unknown enum / extra key / class instance / function / Three.js runtime object 風 field は `invalid_state` として返す。
    - default state は caller 指定の `mediaTimeMs` を保存し、左右腕を `intent: "tracking"`、`confidence: 0`、`reliability: 0`、`expressiveness: 0`、`source: "fallback"` にする。`performance.now()` は呼ばず、top-level warning には `fallback_active` を含める。
    - `MotionIntentEstimator` は `TemporalUpperBodyState`、optional `ReliabilityMap`、optional `SincroHandMotionSnapshot`、optional gesture observation、caller 指定 `mediaTimeMs` だけを入力にする。estimator 内で `performance.now()`、DOM、MediaPipe raw landmark、VRM pose、`AnimationMixer` は読まない。
    - Gesture Recognizer は主制御器ではなく補助入力として扱う。v1 の raw label mapping は `"Open_Palm" -> "explain"`、`"Pointing_Up" -> "pointing"`、`"Thumb_Up" -> "thumbsUp"`、`"Victory" -> "peace"`、`"Closed_Fist" -> "guarded"` に固定し、`"None"`、`"Thumb_Down"`、`"ILoveYou"`、unknown label は semantic intent にしない。
    - confidence gate は gesture confidence `>= 0.70`、hand side confidence `>= 0.60`、ReliabilityMap の該当 hand part `>= 0.60`、finger part `>= 0.45` を既定値とする。ReliabilityMap 欠損時は hand side confidence だけで判定し、`low_hand_reliability` は付けない。`MotionIntentEstimatorConfig.thresholds` 指定時だけ既定値を override する。
    - minimum duration / cooldown は side ごとに持つ。既定値は `wave 400ms / 650ms`、`pointing 200ms / 500ms`、`thumbsUp 200ms / 500ms`、`peace 200ms / 500ms`、`nearFace 250ms / 300ms`、`explain 300ms / 400ms`、`clapLike 150ms / 800ms`、`guarded 250ms / 500ms`、`fallback 300ms / 0ms` とする。`timing` config は `wave` を含まず、wave の duration / cooldown は `config.wave` だけで override する。
    - `wave` は `"Open_Palm"` label だけでは発火しない。temporal wrist の body-local x velocity を最優先し、欠損時だけ前回 `hand.<side>Hand.fullFrameWrist[0]` との差分から image velocity を補う。`elevationRad >= 0.05`、1200ms 窓内の x 速度符号反転 2 回以上、body-local x `abs >= 0.05` または image x `abs >= 0.12`、minimum duration、cooldown 終了をすべて満たす場合だけ `wave` にする。`opennessPerSec` は wave 判定に使わない。
    - `nearFace` は Face bbox を再解釈せず、temporal arm の `classification === "front"`、`elevationRad >= 0.20`、`forwardness >= 0.45`、hand confidence `>= 0.45` の近似条件で判定する。`clapLike` は左右 hand detected、両 wrist の 2D 距離 `<= 0.16`、左右 wrist x velocity が対向している場合だけ candidate にする。
    - `guarded` は arm classification `crossed`、左右 wrist 2D 距離 `<= 0.18` かつ左右どちらかの `forwardness >= 0.35`、または Reliability / Hand warning の `side_inconsistent` で candidate にする。`side_inconsistent` 後は既定 500ms の間、前回 semantic intent を同じ side に保持し、`left_right_swap_suspect` を付ける。
    - hand / pose lost 時は temporal arm state が `predicted` / `recovering` なら前回 semantic intent を既定 500ms まで保持し、その間 `fallback_active` は付けない。`observedAgeMs > 700` または `state === "lost" && confidence < 0.15` の side は `lost` にする。fallback 判定の torso confidence は `reliability.parts.torso.finalWeight` を優先し、欠損時は左右 temporal arm confidence 平均を使う。左右両腕が lost または confidence `< 0.15` で torso confidence も `< 0.15` の場合だけ arms を `fallback` にする。
    - `MotionIntentEstimator.reset()` は camera stop、video fixture load、recording load、replay stop、source reset で呼び、過去 frame の hysteresis / cooldown / wave 窓を破棄する。`dtMs <= 0`、`dtMs > 250`、非 finite dt の frame は counters を更新せず、`invalid_dt` warning を返す。`createMotionIntentState(input, config?)` は単発 helper であり、過去 frame が必要な semantic intent は初回 frame では発火しない。
    - `createSemanticMotionPoseLayer()` は `MotionIntentState`、完成版 `AvatarMotionProfile`、optional previous semantic debug snapshot、optional `deltaSeconds` だけを入力にし、Temporal / Hand / raw gesture / MediaPipe raw landmark は読まない。`tracking` と `guarded` は no-op、片側だけの `clapLike` も no-op とし、左右両方が `clapLike` の場合だけ `side: "both"` の `soft_clap_like` を 1 layer 返す。
    - `createFingerCurlPoseLayer()` は Hand snapshot の `fingerCurl` を主値とし、`pointing` / `thumbsUp` / `peace` / `wave` / `explain` の MotionIntent override を group curl へ適用する。raw landmark から per-finger 3D rotation は作らず、curl / splay / thumb oppose の低次元値だけを quaternion へ写す。
    - Gesture Recognizer の初期化、authored semantic clip asset、`VRMCharacterManager.update()` の適用順序変更は後続 task に残す。AnimationMixer を使う場合も semantic clip 再生は staging に留め、最終的には pose delta を `VrmPoseComposer` の semantic layer として渡す。
- `TemporalUpperBodyState` → arm IK bridge
    - Phase 6 bridge は `src/character/motionSolver/temporalArmSolverBridge.ts` の `createTemporalArmIkInput()` を正本とし、既存 `solveWorldArmIk()` の Pose snapshot 入力経路は残す。bridge は本番切替ではなく、Temporal / profile 由来の solver input 候補を作る純粋 helper として扱う。
    - 入力は `TemporalUpperBodyState`、腕 side、`MinimalAvatarMotionProfile`、`SincroArmIkSolver` と同等の `shoulderWidth` / `upperArmLength` / `lowerArmLength` measurement である。scale snapshot は profile measurement を優先し、欠損時だけ solver measurement に fallback する。`maxReachRatio` は `0.985` に固定する。
    - `bodyLocalWrist` がある場合は主入力とし、body-local absolute tuple から `sideSign = left ? -1 : 1`、`shoulderLocal = [sideSign * shoulderWidth * 0.5, 0, 0]` を再構成し、`relative = bodyLocalWrist - shoulderLocal` を作る。wrist target は `x = relative.x * lateralScale * defaultReachScale`、`y = relative.y * verticalScale * defaultReachScale`、`z = relative.z * depthCompression * defaultReachScale` とする。`bodyLocalElbow` がある場合の `elbowPole` も同じ式で肩相対へ変換する。
    - `bodyLocalWrist` がない場合は scalar fallback を使う。`rawReach = reach * (upperArmLength + lowerArmLength)`、`x = openness * sideSign * rawReach * lateralScale * defaultReachScale`、`y = sin(elevationRad) * rawReach * verticalScale * defaultReachScale`、`z = forwardness * rawReach * depthCompression * defaultReachScale` とし、solver 前 target 長を arm length `* 0.985` 以下へ clamp する。
    - `weight` は temporal arm `confidence` と `state` だけから決める。`tracked` は `confidence`、`suspect` は `confidence * 0.55`、`recovering` は `confidence * recoveringBlend.progress`、`predicted` は `confidence * 0.35`、`lost` は `0` とする。`lost` または非 finite 入力では `target` を返さず、`reasonCodes` と zero weight debug を返す。
    - Phase 6 bridge は Pose wrist / Hand wrist の raw world z を再読解しない。depth は temporal `forwardness` と `profile.solverDefaults.depthCompression`、または保存済み `bodyLocalWrist` の body-local z から決定し、Hand wrist は palm / finger / gesture 補助の入力に留めて arm IK target の主入力にしない。
- `MinimalAvatarMotionProfile`
    - `src/character/avatarProfile/minimalAvatarMotionProfile.ts` を正本とする、VRM load 時に測れる最小 avatar-local profile contract。
    - schema version は `sincro.minimal-avatar-motion-profile.v1` に固定し、`optionalBones`、`measurements`、`solverDefaults`、`warnings` だけを持つ plain object として保存する。`THREE.Vector3`、`THREE.Quaternion`、`Object3D`、`VRM` instance は profile に保持しない。
    - `optionalBones` は `upperChest`、`leftShoulder`、`rightShoulder`、`leftHand`、`rightHand`、`leftThumbProximal`、`rightThumbProximal`、`leftIndexProximal`、`rightIndexProximal` の boolean capability とする。欠損しても throw せず、該当 field を `false` にして `missing_<bone>` 系 reason code を `warnings` に重複なく残す。
    - `measurements` は `shoulderWidth`、`leftUpperArmLength`、`leftLowerArmLength`、`rightUpperArmLength`、`rightLowerArmLength`、`headSize` を optional number として持つ。計測不能値は `undefined` にし、`NaN` / `Infinity` は保存しない。
    - 腕長と肩幅は `SincroArmIkSolver` と同じく `vrm.scene.updateMatrixWorld(true)` 後の `vrm.humanoid.getNormalizedBoneNode()` と world position distance を使う。upper / lower arm length は node が揃う場合 `Math.max(distance, 0.04)`、shoulder width は左右 upper arm node が揃う場合 `Math.max(distance, 0.08)` とする。
    - `headSize` は neck-head の world distance を優先し、neck / head が揃わず shoulder width が測れている場合だけ `shoulderWidth * 0.75` で推定し、`head_size_estimated_from_shoulder_width` を `warnings` に残す。どちらも不可なら `headSize` は `undefined` とし、`head_size_unmeasured` を残す。
    - `solverDefaults` は `defaultReachScale: 1.0`、`depthCompression: 0.55`、`lateralScale: 1.0`、`verticalScale: 0.92`、`shoulderDamping: 0.65`、`wristRollInfluence: 0.25` に固定する。
    - Phase 7 以降は完成版 `AvatarMotionProfile` から `toMinimalAvatarMotionProfile()` で明示変換して得る互換 view とする。Debug Console / `motion-debug` の `poseRetargetRuntime.avatarMotionProfile` と Phase 6 snapshot schema は minimal 形状のまま維持する。
- `AvatarMotionProfile`
    - `src/character/avatarProfile/avatarMotionProfile.ts` を正本とする、VRM 個体差を保存可能な plain object として表す完成版 avatar-local profile contract。
    - schema version は `sincro.avatar-motion-profile.v1` に固定する。parser は未知 `schemaVersion` を `unknown_schema_version`、extra key / unknown enum / runtime object 風 value を `invalid_state`、非 finite number や値域外 scalar を `out_of_range` として返し、replay / viewer を例外で落とさない。
    - profile は `model`、`capabilities`、`restLocalRotation`、`metrics`、`torso`、`arm`、`wrist`、`fingers`、`risk`、`warnings` を持つ。`THREE.Vector3`、`THREE.Quaternion`、`Object3D`、`VRM` instance、function、class instance、`NaN` / `Infinity` は保存しない。
    - `capabilities.bones` は normalized humanoid bone の有無を `Partial<Record<VRMHumanBoneName, boolean>>` で持ち、`fingerChains.left/right.thumb/index/middle/ring/little` は `proximal`、`intermediate`、`distal` の有無を保存する。VRM thumb は `thumbMetacarpal` を chain の `intermediate` として扱う。
    - `fingers.curlScale` は finger curl semantic layer の最終 curl に掛け、`0..1` に clamp する。`curlMode` が `"grouped"` でも `"perFinger"` でも v1 の pose helper は group input を使い、raw landmark rotation は作らない。`fingers.splayLimitDeg` は splay angle の上限として使う。
    - `restLocalRotation` は available bone だけを `[x, y, z, w]` tuple で保存する。local quaternion が非 finite の bone は保存せず、`invalid_rest_rotation:<VRMHumanBoneName>` を `warnings` に残す。
    - `metrics` は `shoulderWidth`、`torsoLength`、`headSize`、左右 `upperArmLength`、左右 `lowerArmLength`、左右 `handSize` を optional finite number として持つ。測定は `vrm.scene.updateMatrixWorld(true)` 後、`vrm.humanoid.getNormalizedBoneNode()` と world position distance だけで行い、glTF node 名検索は使わない。
    - 測定不能値は `undefined` にし、`<snake_field>_unmeasured` を `warnings` に重複なく残す。`headSize` は neck-head を優先し、測れず `shoulderWidth` がある場合だけ `shoulderWidth * 0.75` で推定し、`head_size_estimated_from_shoulder_width` を残す。
    - warning code は Phase 7 contract の命名を正本にする。missing bone は `missing_<VRMHumanBoneName>`、測定不能は `left_hand_size_unmeasured` のような snake field、推定値は `<snake_field>_estimated_from_<source>` とする。旧 minimal の `missing_upper_chest` 形式は新規生成しない。
    - `torso.distribution` は capability から決定する。`spine+chest+upperChest` は `{ spine: 0.25, chest: 0.40, upperChest: 0.35 }`、`spine+chest` は `{ spine: 0.35, chest: 0.65, upperChest: 0 }`、それ以外は `{ spine: 1, chest: 0, upperChest: 0 }` とする。
    - default は Phase 7 contract 値を使う。`arm.reachScale: 0.92`、`lateralScale: 0.90`、`verticalScale: 0.95`、`depthCompression: 0.60`、`elbowOutwardBias: 0.25`、`shoulderDamping: 0.55`、`wrist.wristRollInfluence: 0.40`、`fingers.curlScale: 0.80`、`torso.chestFollow: 0.55` とする。
    - `toMinimalAvatarMotionProfile()` は Phase 6 と同じ shape を返し、`optionalBones`、`measurements`、`warnings` を互換 field へ落とす。`solverDefaults` は minimal の旧既定値ではなく完成版 profile 値から写し、`defaultReachScale = arm.reachScale`、`depthCompression = arm.depthCompression`、`lateralScale = arm.lateralScale`、`verticalScale = arm.verticalScale`、`shoulderDamping = arm.shoulderDamping`、`wristRollInfluence = wrist.wristRollInfluence` とする。
    - `SincroPoseRetargeter.attachVrm()` は完成版 `AvatarMotionProfile` を生成・保持し、`getAvatarMotionProfile()` は deep clone 済みの完成版 profile を返す。`VRMCharacterManager.getAvatarMotionProfile()` / `VRMScene.getAvatarMotionProfile()` は motion-debug 用にこの clone を公開する。既存 Debug Console / Phase 6 composer / solver へ渡す箇所では minimal 互換変換を明示する。
    - online calibration が後続 task で追加されても、avatar bone length、rest local rotation、humanoid mapping、finger chain capability は avatar 構造値として変更しない。calibration は user pose / camera / control response 由来の補正値だけを別 contract に持つ。
    - `motion-debug` snapshot
    - `pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、camera readiness、render fps をまとめて返す。
    - live camera / video fixture の最新 video frame timing は optional `camera.frameTiming` に載せる。field は `source`、`receivedAtPerformanceMs`、`mediaTimeMs`、`videoCurrentTimeMs`、optional `presentationTimeMs`、optional `expectedDisplayTimeMs`、optional `presentedFrames`、`droppedPresentedFrames` を持つ。
    - live camera / video fixture の camera quality は optional `camera.quality` に `sincro.camera-quality.v1` として載せる。source が `none` の場合は score を生成せず、viewer camera layer は従来どおり未記録扱いになる。
    - live camera / video fixture の active runtime performance profile は `camera.performanceProfile` を正本にする。schema version は `sincro.tracker-performance-profile.v1` で、camera constraints、Face / Pose / Hand / Face ROI / Gesture cadence、debug log 粒度、degradation budget の説明値を持つ。`tracker.budget` や frame metrics へ profile を重複保存しない。
    - `window.__SINCRO_MOTION_DEBUG__.startCamera(options?)` は optional `performanceProfileId` / `performanceProfile` を受け付ける。未指定時は `debug` profile を使い、`performanceProfileId` 指定時は固定 `POSE_TARGET_INFERENCE_FPS` override ではなく profile cadence の Pose fps を `TrackerRuntime` default として使う。
    - `CameraQualityScore` の guide message は reason code から `"少し下がってください"`、`"体を画面中央に入れてください"`、`"手が画面から出ないようにしてください"`、`"部屋を明るくしてください"`、`"カメラ解像度を上げてください"` の固定文言へ決定的に変換する。v1 は ReliabilityMap / retarget weight / IK weight へは接続しない。
    - live camera / video fixture / replay pose-snapshot の最新 `CanonicalUpperBodyState` は optional `canonical` field に載せる。replay frame の `frame.canonical` が invalid な場合は、同じ field に parse error summary を載せ、window API 利用者が replay failure と切り分けられるようにする。
    - live camera / video fixture / replay pose-snapshot の最新 `ReliabilityMap` は optional `reliability` field に載せる。replay frame の `frame.reliability` が invalid な場合は、同じ field に parse error summary を載せ、window API 利用者が replay failure と切り分けられるようにする。
    - live camera / video fixture / replay pose-snapshot の最新 `TemporalUpperBodyState` は optional `temporal` field に載せる。replay frame の `frame.temporal` が invalid な場合は、同じ field に parse error summary を載せ、window API 利用者が replay failure と切り分けられるようにする。
    - live camera / video fixture / replay pose-snapshot の最新 `MotionIntentState` は optional `intent` field に載せる。recording 中でない live state でも pose callback ごとに更新し、`pose-snapshot` replay では saved `frame.intent` で estimator state を上書きせず、pipeline 再実行結果としての latest intent を snapshot 側にだけ出す。
    - VRM load 後の最新 `MinimalAvatarMotionProfile` は `poseRetargetRuntime.avatarMotionProfile` に optional field として載せる。Debug Console と Phase 6 snapshot はこの minimal 形状を維持し、完成版 `AvatarMotionProfile` や calibration state は Debug Console snapshot へ直接載せない。
    - motion-debug live snapshot は optional `phase7` field に `sincro.phase7-profile-calibration.v1` の `MotionDebugPhase7Snapshot` を載せられる。通常 UI 文言は保存せず、developer-visible な `profile`、`initialCalibration`、`onlineCalibration`、`activeCanonicalCalibration`、`warnings` だけを JSON value として扱う。
    - Phase 4 の reliability downstream 接続は canonical confidence / source / warnings と developer-only `canonicalReliabilityInput` までに限定する。`canonicalReliabilityInput` は canonical 生成に使った左右 arm の `partWeight` / `minJointWeight` と reliability `schemaVersion` / `mediaTimeMs` を保存し、retarget / IK solver weight へはまだ接続しない。
    - 既存 field 名は維持し、optional `viewer` field に viewer mode、selected layer、layer status / value、recording、replay、metrics summary を追加する。
    - Playwright からの調整値変更は UI control と同じ retarget config に反映し、画面 snapshot と window API の観測値を揃える。
    - 複数 VRM の IK 検証では `motion-debug/?vrm=/characters/<file>.vrm` を使い、同じ camera / tracker / retarget 経路で model 差分を確認する。
- Initial calibration
    - `InitialSincroCalibrationSession.schemaVersion` は `sincro.initial-calibration.v1` に固定する。標準 step は `precheck`、`neutral`、`a_pose`、`hand_open` で、`face_yaw_optional` は失敗しても session status を下げない optional step とする。
    - session status は `not_started`、`ready`、`ready_without_hands`、`retry_recommended`、`failed` の固定 enum とする。`hand_open` は optional hand step として扱い、`precheck` / `neutral` / `a_pose` が ready で `hand_open` だけ degraded / retry / failed / skipped の場合は `ready_without_hands` を返す。
    - step 評価は `ReliabilityMap`、optional `CameraQualityScore`、optional `CanonicalUpperBodyState`、`validDurationMs` の pure input だけを読む。通常 UI は score や内部 field 名を出さず、retry reason を固定文言へ最大 2 件に絞って表示する。debug UI / motion-debug は step status、retry reason、score、measurements、debug field を developer-visible JSON として表示できる。
    - `createCanonicalCalibrationFromInitialSession()` は completed session の measurements から `CanonicalCalibrationSnapshot` を作る。`id` は `initial-calibration:<startedAtMediaTimeMs>:<completedAtMediaTimeMs>`、`source` は `initial`、`capturedAtMediaTimeMs` は completion 時刻に固定し、欠損 measurement は `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` へ fallback する。
- Online calibration
    - `OnlineSincroCalibrationState.schemaVersion` は `sincro.online-calibration.v1` に固定し、`initial`、optional `candidate`、optional `committed`、`freezeReasons` を保存する。`candidate.stableDurationMs >= 3000` かつ gate open が継続した場合だけ `committed` へ promote する。
    - 更新対象は `CanonicalCalibrationSnapshot` の `neutralYawRad`、`shoulderWidth`、`torsoScale`、`handBaseline.left/right.palmSize`、`handBaseline.left/right.openSpread` に限定する。`AvatarMotionProfile`、VRM rest local rotation、avatar bone length、humanoid / handedness / finger chain mapping、joint limit は online calibration で変更しない。
    - gate は torso reliability `> 0.85`、head reliability `> 0.80`、both shoulders visible、border risk `< 0.30`、motion blur risk `< 0.50`、arm activity `< 0.20`、face yaw `< 12deg`、bone length consistency `> 0.80` を満たす時だけ open とする。gate close frame では calibration 値を進めず、`candidate` を破棄して `freezeReasons` だけを更新する。
    - gate open 中でも `mediaTimeMs` が前回 candidate から増加していない frame は candidate を更新せず、`candidate_not_stable` を debug reason に残す。candidate が 3000ms 未満の場合も committed へは反映しない。
    - drift clamp は停止条件ではなく、clamp 済み値で candidate / committed 更新を続ける。clamp 範囲は initial calibration から `shoulderWidth ±15%`、`torsoScale ±20%`、`neutralYawRad ±10deg`、`handBaseline` の `palmSize` / `openSpread` `±20%` とし、clamp 発生時は `drift_clamped` を debug reason に残す。
    - EMA は `alpha = 1 - Math.exp(-dtSec / tauSec)` に固定する。tau は shoulder/body scale が `120s`、neutral yaw が `90s`、hand baseline が `20s` である。時刻は replay 決定性のため `mediaTimeMs` だけを使い、`performance.now()` は使わない。
    - debug 表示では `freezeReasons` として `torso_low_reliability`、`head_low_reliability`、`shoulders_not_visible`、`border_risk`、`motion_blur`、`arm_activity_high`、`face_yaw_not_neutral`、`bone_length_inconsistent`、`candidate_not_stable`、`drift_clamped` を表示できる。通常 UI 文言化と永続化接続は後続 task の責務とする。
- motion evaluation log
    - developer 向け評価ログの schema は `src/character/motionEvaluation/motionDebugLogSchema.ts` を正本とする。
    - schema version は `sincro.motion-debug-log.v1` とし、NDJSON の 1 行目を manifest record、2 行目以降を frame record として保存する。
    - recording の active runtime performance profile は `manifest.pipeline.performanceProfile` を正本にする。`frame.metrics.tracker`、`frame.metrics.cameraQuality`、`tracker.budget` には profile を保存せず、frame ごとの重複を避ける。
    - `manifest.pipeline.performanceProfile.debugLog` は numeric ring buffer の既定 frame 数と dump / overlay capture の既定粒度を説明する。常時記録は numeric 値に限定し、PNG / overlay / full dump の連続保存は profile 既定では有効化しない。
    - `manifest.pipeline.performanceProfile.degradationBudget` は後続 ordered degradation policy が読む入力 contract であり、recording 時点の自動 degradation 履歴ではない。実際の over-budget / fallback 状態は従来どおり `frame.metrics.tracker.budget` と ROI stats に保存する。
    - recorder core は `src/character/motionEvaluation/motionDebugRecorder.ts` に置き、manifest / frame validation、dedupe、maxDuration / maxFrames stop、NDJSON / Blob export を DOM 非依存で扱う。
    - replay / metrics が読む正規化 pose snapshot の保存先は `frame.poseSnapshot` に固定し、MediaPipe raw result や solver 出力とは別 slot に分ける。
    - replay は `frame.timestamp.mediaTimeMs` を正本時刻として使い、autoplay の順序と手動 step の対象 frame を `performance.now()` へ依存させない。`mediaTimeMs` は video frame clock の media time 基準であり、MediaPipe / Worker detect timestamp と tracker cadence 判定も同じ値を使う。
    - frame は pose callback / pose fallback callback 起点で記録し、render loop は recording state 表示だけを更新する。
    - `MotionDebugRecordingController.recordPoseFrame()` は同じ pose callback / fallback callback 起点で `estimateCanonicalTorsoFrame()`、`createCanonicalUpperBodyState()` を呼び、`frame.canonical` に JSON 保存可能な `CanonicalUpperBodyState` を保存する。連続 frame の `bodyFront` 反転抑制は previous canonical を torso estimator へ渡して効かせ、recording 停止、source 停止、replay 読み込み時に previous を reset する。
    - `MotionDebugApp.handlePoseMotion()` / `handlePoseFallback()` は camera quality 更新後、recording 前に `createPoseReliabilityMap()` を呼び、live snapshot の `reliability` と recording frame の `frame.reliability` を同期する。`mediaTimeMs` は `TrackerVideoFrameTiming.mediaTimeMs`、`pose.lastUpdatedAtMs`、`0` の順に選び、live camera / video fixture 停止、replay load、recording reset で previous reliability を reset する。
    - `MotionDebugRecordingController.recordPoseFrame()` は canonical / reliability 解決後に同じ `mediaTimeMs` で `TemporalStateEstimator.update()` を呼び、live snapshot の `temporal` と recording frame の `frame.temporal` を同期する。`frame.timestamp.mediaTimeMs` と `temporal.timestamp.mediaTimeMs` が一致しない外部入力は recording failure にせず、frontend warning と temporal JSON の `out_of_range` warning に留める。
    - v1 frame は最低限 `frame.timestamp.mediaTimeMs`、`frame.video.width`、`frame.video.height`、`frame.poseSnapshot`、`frame.reliability`、`frame.canonical`、`frame.temporal`、`frame.intent`、`frame.solver.poseRetarget`、`frame.solver.poseRetargetRuntime`、`frame.solver.phase6`、`frame.solver.phase7`、`frame.solver.phase9`、`frame.finalPose`、`frame.metrics.receivedAtPerformanceMs`、`frame.metrics.tracker` を保存する。
    - `frame.solver.phase6` は `sincro.phase6-solver.v1` の保存専用 snapshot であり、`profile.schemaVersion`、finite number だけを残した `profile.measurements`、左右 arm の optional `bridge` と `ik` を持つ。runtime の `SincroArmIkTarget` は直接 JSON 化せず、`target.wrist` / `target.elbowPole` は `[number, number, number]` tuple へ変換する。
    - `frame.solver.phase7` は `sincro.phase7-profile-calibration.v1` の保存専用 snapshot であり、完成版 `AvatarMotionProfile`、optional `InitialSincroCalibrationSession`、optional `OnlineSincroCalibrationState`、optional `CanonicalCalibrationSnapshot` の `activeCanonicalCalibration`、`warnings` を持つ。`profile` は `VRMScene.getAvatarMotionProfile()` 由来の clone を使い、`activeCanonicalCalibration` は同じ frame の latest canonical calibration から plain snapshot として保存する。未実行時は default initial / online session で埋めず、存在する field だけを保存する。
    - `MotionDebugRecorder` の manifest / frame validation は `frame.intent` と `frame.solver.phase9` を unknown object として保持し、厳密検証は replay / viewer の `parseMotionIntentState()` と Phase 9 parser 境界に閉じる。top-level `profile` / `calibration` / `semantic` / `finger` frame slot は追加しない。
    - `frame.finalPose` は `sincro.vrm-pose-composer-result.v1` の top-level `schemaVersion` を持つ `VrmPoseComposerResult` snapshot であり、`finalPose`、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を含む。
    - `frame.reliability` は optional slot として `sincro.reliability-map.v1` の `ReliabilityMap` を保存する。v1 は `timestamp`、`camera`、`joints`、`parts`、`gesture`、`warnings` を持つ JSON contract であり、finite number、lower-case enum、plain object だけを許可する。
    - `ReliabilityMap` の `finalWeight` と component `score` は `0..1` の低 weight 観測を含めて保存する。`finalWeight < threshold` は parse failure ではなく観測値として保持し、破棄や downstream weight 反映は後続 estimator / controller task の責務とする。
    - `parseReliabilityMap()` は replay / viewer 境界の検証 API であり、未知 `schemaVersion`、値域外 scalar、非 finite number、unknown joint / part key、runtime object 風 extra key を reject する。
    - 旧 log で `frame.reliability` が無い場合、replay viewer は `frame.poseSnapshot`、`frame.timestamp.mediaTimeMs`、`frame.video.width` / `height` から `createPoseReliabilityMap()` を再計算する。`poseSnapshot` も無い frame は reliability layer を `not_recorded` とし、log load 自体は失敗させない。
    - `frame.timestamp` は optional で `presentationTimeMs`、`expectedDisplayTimeMs`、`presentedFrames`、`droppedPresentedFrames`、`clockSource` を保存できる。`clockSource` は `request-video-frame-callback`、`request-animation-frame`、`timer` のいずれかで、fallback では rVFC 固有 field を欠損のままにする。
    - frame ごとの camera quality は optional `frame.metrics.cameraQuality` に保存する。top-level `cameraQuality` は追加しない。replay viewer の camera layer はこの frame 値がある場合、manifest camera settings より優先して表示する。
    - tracker performance budget は optional `frame.metrics.tracker.budget` として保存する。schema version は `sincro.tracker-performance-budget.v1`、degradation state は `"full"`、`"main-thread-low-fps"`、`"pose-reduced-fps"`、`"face-only"`、`"fallback"` の固定 enum とする。
    - ordered degradation policy は optional `frame.metrics.tracker.degradationPolicy` として保存する。schema version は `sincro.tracker-degradation-policy.v1`、stage は `"full"`、`"gesture-reduced-fps"`、`"optional-pass-reduced-fps"`、`"roi-hand-paused"`、`"pose-reduced-fps"`、`"face-only"`、`"comfortable-idle"` の固定 enum とし、既存 budget degradation state の enum とは分ける。
    - `timestamp.receivedAtPerformanceMs` や top-level `tracker` は schema 外なので追加しない。`mediaTimeMs` と `metrics.receivedAtPerformanceMs` は時刻原点が異なるため、latency として差分を取らない。
    - recorder の duplicate 判定は rVFC の `presentedFrames` がある場合はそれを優先し、同じ `presentedFrames` の連続入力を保存しない。`presentedFrames` が 2 以上進んだ場合、clock は `droppedPresentedFrames = 差分 - 1` を保存する。
    - camera の `deviceId` / `groupId` は raw 値を保存しない。保存が必要になった場合も export 単位の salt で hash し、cross-export stable hash を残さない。
    - `CameraQualityScore.track` も raw `deviceId` / `groupId` / `label` を保存せず、`width`、`height`、`frameRate`、`facingMode`、`readyState` だけを持つ。
    - `MediaStreamTrack.getSettings()` 由来の camera settings は `MotionDebugApp` で scrub してから manifest へ渡し、recorder core は scrub 済み manifest を strict schema で検証する。
- motion metrics
    - metrics の公開入口は `src/character/motionEvaluation/motionMetrics.ts` facade を正本とし、既存 import 名を維持する。実体は `motionMetricTypes.ts`、`motionMetricThresholds.ts`、`motionMetricFrameParsers.ts`、`motionMetricBaseCalculators.ts`、`motionMetricTrackerCalculators.ts`、`motionMetricTemporalCalculators.ts`、`motionMetricSolverCalculators.ts`、`motionMetricIntentCalculators.ts`、`motionMetricSummary.ts`、`motionMetricComparison.ts` に分け、各 calculator は `SincroMotionDebugFrame[]` と `MotionMetricConfig` 由来の値だけを読む pure function とする。`motionMetricRecoveryCalculators.ts` は temporal recovery jump の補助実装であり、外部公開は temporal module 経由に留める。
    - summary schema は `sincro.motion-metrics.v1` とし、`neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`angularVelocitySpikeCount`、`reachClampOccupancy`、`trackingLossDurationMs`、`sideSwapCount`、`addedLatencyMs`、`temporalPredictedArmFrameCount`、`temporalRecoveringArmFrameCount`、`temporalLostArmDurationMs`、`temporalMaxRecoveryJumpDegEquivalent`、`temporalNeutralWristJitter`、`solverElbowFlipRejectCount`、`solverReachClampOccupancy`、`solverPoleUncertainFrameCount`、`finalPoseAngularVelocityClampCount`、`finalPoseOwnedBoneConflictCount`、`gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount`、`trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` を固定 key とする。
    - Phase 5 temporal metrics は `frame.temporal` の valid `TemporalUpperBodyState` だけを読む。predicted / recovering count は arm-frame 単位、lost duration は左右腕 lost duration 合算、recovery jump は recovering 中 arm scalar の frame 差分を deg 相当に換算した最大値、neutral wrist jitter は `neutral-10s` の tracked / suspect `bodyLocalWrist` 連続差分 RMS とする。
    - Phase 6 solver / finalPose metrics は saved `frame.solver.phase6` と `frame.finalPose` だけを読む。`solverElbowFlipRejectCount` は `constraintReasonCodes` の `pole_flip_rejected`、`solverReachClampOccupancy` は `ik.targetClamped` arm-frame ratio、`solverPoleUncertainFrameCount` は `poleState === "uncertain"`、`finalPoseAngularVelocityClampCount` は `clampedBones[].reason === "angular_velocity"`、`finalPoseOwnedBoneConflictCount` は `warnings` の `owned_bone_conflict:` prefix だけを数える。
    - Phase 9 intent metrics は saved `frame.intent` だけを読む。`gestureFlickerCount` は同一 side の semantic intent が `stableDurationMs < 150` のまま `tracking` または別 semantic intent へ戻った回数、`semanticFallbackFrameCount` は左右 arm-side sample の `lost` / `fallback` 数、`intentCooldownSuppressionCount` は side warnings の `gesture_cooldown` 数、`intentInvalidFrameCount` は `parseMotionIntentState()` が失敗した frame 数とする。invalid intent frame は他 3 件の sample から除外し、valid intent sample が 0 の場合は `not_available` / `intent_not_recorded` にする。
    - Phase 10 degradation metrics は tracker stats と frame timestamp だけを読む。`trackerBudgetOverrunFrameCount` は `frame.metrics.tracker.budget.budgetStatus === "over_budget"` の frame 数であり、`warn` は数えない。`trackerDroppedFrameCount` は `frame.timestamp.droppedPresentedFrames` と累積値 `frame.metrics.tracker.droppedFrames` の frame 間差分を同一 frame ごとに比較し、大きい値だけを採用する。`degradationStageFrameCount` は `frame.metrics.tracker.degradationPolicy.stage !== "full"`、または旧 log の `frame.metrics.tracker.budget.degradation.state !== "full"` の frame 数とする。`degradationRecoveryFrameCount` は `frame.metrics.tracker.degradationPolicy.recovering === true`、`roiPausedFrameCount` は `frame.metrics.tracker.roi.pauseState !== "active"` を数える。
    - Phase 10 degradation metrics はすべて `unit: "count"`、`direction: "lower_is_better"` とする。初期閾値は `trackerBudgetOverrunFrameCount { pass: 0, warn: 30, fail: 90 }`、`trackerDroppedFrameCount { pass: 0, warn: 15, fail: 60 }`、`degradationStageFrameCount { pass: 0, warn: 45, fail: 150 }`、`degradationRecoveryFrameCount { pass: 0, warn: 60, fail: 180 }`、`roiPausedFrameCount { pass: 0, warn: 60, fail: 180 }` に固定する。
    - 旧 log で `degradationPolicy` が無い場合、`degradationRecoveryFrameCount` は recovery を推測せず `not_available` にする。旧 log で `roi` が無い場合、`roiPausedFrameCount` は `not_available` にする。`degradationStageFrameCount` だけは旧 `budget.degradation.state` を fallback として読む。
    - baseline parser は新しい fixed key が旧 baseline に無い場合、unknown key ではなく missing key として `not_available` metric を `severity: "warn"` で補完する。threshold は `MotionMetricThreshold` の finite `pass` / `warn` / `fail` 境界だけを保存し、表現上の `fail > N` は判定説明として扱う。
    - 入力 slot が不足する metric は `status: "not_available"`、`severity: "warn"`、`value: null` とし、summary 全体を pass 扱いにしない。
    - 初期閾値は `DEFAULT_MOTION_METRIC_THRESHOLDS` に固定し、比較は `compareMotionMetricSummaries()` が metric ごとに `improved` / `unchanged` / `regressed` / `not_comparable` を返す。
    - P0 fixture ID は `neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、`arms-cross`、`fast-wave` に固定する。
    - baseline JSON は `src/character/motionEvaluation/motionMetricBaselineSchema.ts` の `parseMotionMetricBaseline()` を正本にし、schema version は `sincro.motion-metric-baseline.v1` とする。
    - `motion-debug` window API は replay 読み込み済み log に対して `calculateReplayMetrics(config)` を公開し、API 内では時刻を生成せず `config.generatedAtIso` を summary へ渡す。

## IK Solver Policy

- 本流:
    - 自前 3D two-bone IK を維持し、`@pixiv/three-vrm` normalized bones に local quaternion を適用する。
    - 理由は ADR-260517 に記録する。
    - 腕単体の人体的 constraint と head / chest no-go zone は solver 内の軽量 safety として扱い、full-body IK や物理 collision へ拡張しない。
- 比較対象:
    - `CCDIKSolver` は `SkinnedMesh.skeleton.bones` の index を要求するため、normalized bone 直適用とは責務が合わない。
    - raw skeleton chain では PoC smoke test 可能だが、target bone の追加と normalized/raw pose bridge が必要になる。
- 将来候補:
    - full-body、複数 effector、足接地拘束が必要になった場合に `closed-chain-ik-js` 等を再評価する。
    - 再評価時は worker 化、bundle size、Debug Console での説明可能性、VRM 個体差への強さを同時に見る。
- 参考のみ:
    - Kalidokit は deprecated のため、API / 出力形式の参考に留める。

## Change Checklist

- 新しい motion を追加する時は、どの talk mode で有効かを先に決める。
- 複数 controller が同時に最大値を出さないよう、orchestrator で motion policy を調整する。
- 欠損 bone / expression は無効化または近い bone への fallback にする。
- Debug Console で切り分けたい値は snapshot / retarget frame に載せる。

## References

- `documents/design/frontend/character/overview.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
