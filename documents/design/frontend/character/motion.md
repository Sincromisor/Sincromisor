# Frontend Character Motion

## Summary

- Character motion は `CharacterBehaviorSnapshot` を入力に、head / eye / face / body / arm を低振幅で合成する。
- `chat` では会話の存在感を優先し、`sincro` では face / pose retarget を優先する。
- 各 controller は MediaPipe の生値ではなく、retarget 済みの VRM 向け値を読む。

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
- `src/character/reliability`
    - 後続 estimator / replay / temporal state が共有する `ReliabilityMap` v1 contract を置く。
    - MediaPipe confidence をそのまま制御重みにせず、joint / part / gesture ごとの保存可能な信頼度 snapshot として扱う。
    - Phase 4a の `PoseReliabilityEstimator` は `SincroPoseMotionSnapshot` と optional `CameraQualityScore`、optional `previous.pose` / `previous.mediaTimeMs` / `previous.reliability`、caller 指定の `mediaTimeMs`、`video` size から `ReliabilityMap` を作る pure function とする。Pose snapshot で未観測の Head / Hand / Finger / Gesture / ROI は placeholder に固定し、Face / Hand / Gesture 専用 estimator は後続 Phase 8 / 9 で接続する。
- `src/character/temporal`
    - canonical / reliability の後段で共有する `TemporalUpperBodyState` v1 contract を置く。
    - 保存対象は時系列状態、canonical arm scalar、body-local wrist / elbow tuple、速度、recovering blend に限定し、VRM bone rotation、quaternion、IK solver 出力は含めない。
- `src/character/ik`
    - `SincroArmIkSolver` と solver probe / constraint / geometry / pole を置く。
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
    - snapshot panel は `live`、`recording`、`replay`、`metrics` の viewer mode を持つ。`camera`、`mediapipe`、`poseSnapshot`、`reliability`、`canonical`、`temporal`、`intent`、`solver`、`finalPose`、`applied`、`metrics` を layer selector で切り替え、値あり / 未記録 / 未実装 / 未計算を区別する。
    - `metrics` layer は replay frame に `frame.metrics` がある場合、motion metric summary 未計算でも保存済み metrics JSON を表示する。tracker performance budget は `frame.metrics.tracker.budget` で確認し、motion metric summary の固定 key は増やさない。
    - `reliability` layer は live snapshot の `ReliabilityMap` を最優先し、無い場合は saved `frame.reliability`、さらに無い旧 log では `frame.poseSnapshot` から再計算した reliability を表示する。`RESERVED_PHASE_1_LAYERS` ではなく実装済み layer として扱い、`poseSnapshot` も無い frame だけ `not_recorded` にする。
    - saved `frame.reliability` は `parseReliabilityMap()` で検証し、valid な場合は保存値をそのまま表示する。invalid な場合も replay failure にはせず、`parseStatus: "invalid"`、parse errors、raw value を `available` layer value として表示する。
    - `canonical` layer は replay frame の `frame.canonical` を優先し、保存値がない場合だけ live snapshot の `canonical` へ fallback する。valid canonical は `schemaVersion`、`timestamp.mediaTimeMs`、左右腕特徴、`source`、`warnings`、`outOfRangeFields`、`calibration.id` を JSON value として確認できる。invalid canonical は replay failure にせず、`parseStatus: "invalid"` と parse error summary を `available` layer value として表示する。
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
    - head sphere と chest ellipsoid の軽量 no-go zone で、hand target と forearm segment の深い貫通を抑える。
    - constraint / collision 発火時は target の押し戻しと IK weight 減衰を優先し、入力 target の品質補正や外れ値除去は持たない。
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
    - `motion-debug` snapshot
    - `pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、camera readiness、render fps をまとめて返す。
    - live camera / video fixture の最新 video frame timing は optional `camera.frameTiming` に載せる。field は `source`、`receivedAtPerformanceMs`、`mediaTimeMs`、`videoCurrentTimeMs`、optional `presentationTimeMs`、optional `expectedDisplayTimeMs`、optional `presentedFrames`、`droppedPresentedFrames` を持つ。
    - live camera / video fixture の camera quality は optional `camera.quality` に `sincro.camera-quality.v1` として載せる。source が `none` の場合は score を生成せず、viewer camera layer は従来どおり未記録扱いになる。
    - `CameraQualityScore` の guide message は reason code から `"少し下がってください"`、`"体を画面中央に入れてください"`、`"手が画面から出ないようにしてください"`、`"部屋を明るくしてください"`、`"カメラ解像度を上げてください"` の固定文言へ決定的に変換する。v1 は ReliabilityMap / retarget weight / IK weight へは接続しない。
    - live camera / video fixture / replay pose-snapshot の最新 `CanonicalUpperBodyState` は optional `canonical` field に載せる。replay frame の `frame.canonical` が invalid な場合は、同じ field に parse error summary を載せ、window API 利用者が replay failure と切り分けられるようにする。
    - live camera / video fixture / replay pose-snapshot の最新 `ReliabilityMap` は optional `reliability` field に載せる。replay frame の `frame.reliability` が invalid な場合は、同じ field に parse error summary を載せ、window API 利用者が replay failure と切り分けられるようにする。
    - Phase 4 の reliability downstream 接続は canonical confidence / source / warnings と developer-only `canonicalReliabilityInput` までに限定する。`canonicalReliabilityInput` は canonical 生成に使った左右 arm の `partWeight` / `minJointWeight` と reliability `schemaVersion` / `mediaTimeMs` を保存し、retarget / IK solver weight へはまだ接続しない。
    - 既存 field 名は維持し、optional `viewer` field に viewer mode、selected layer、layer status / value、recording、replay、metrics summary を追加する。
    - Playwright からの調整値変更は UI control と同じ retarget config に反映し、画面 snapshot と window API の観測値を揃える。
    - 複数 VRM の IK 検証では `motion-debug/?vrm=/characters/<file>.vrm` を使い、同じ camera / tracker / retarget 経路で model 差分を確認する。
- motion evaluation log
    - developer 向け評価ログの schema は `src/character/motionEvaluation/motionDebugLogSchema.ts` を正本とする。
    - schema version は `sincro.motion-debug-log.v1` とし、NDJSON の 1 行目を manifest record、2 行目以降を frame record として保存する。
    - recorder core は `src/character/motionEvaluation/motionDebugRecorder.ts` に置き、manifest / frame validation、dedupe、maxDuration / maxFrames stop、NDJSON / Blob export を DOM 非依存で扱う。
    - replay / metrics が読む正規化 pose snapshot の保存先は `frame.poseSnapshot` に固定し、MediaPipe raw result や solver 出力とは別 slot に分ける。
    - replay は `frame.timestamp.mediaTimeMs` を正本時刻として使い、autoplay の順序と手動 step の対象 frame を `performance.now()` へ依存させない。`mediaTimeMs` は video frame clock の media time 基準であり、MediaPipe / Worker detect timestamp と tracker cadence 判定も同じ値を使う。
    - frame は pose callback / pose fallback callback 起点で記録し、render loop は recording state 表示だけを更新する。
    - `MotionDebugRecordingController.recordPoseFrame()` は同じ pose callback / fallback callback 起点で `estimateCanonicalTorsoFrame()`、`createCanonicalUpperBodyState()` を呼び、`frame.canonical` に JSON 保存可能な `CanonicalUpperBodyState` を保存する。連続 frame の `bodyFront` 反転抑制は previous canonical を torso estimator へ渡して効かせ、recording 停止、source 停止、replay 読み込み時に previous を reset する。
    - `MotionDebugApp.handlePoseMotion()` / `handlePoseFallback()` は camera quality 更新後、recording 前に `createPoseReliabilityMap()` を呼び、live snapshot の `reliability` と recording frame の `frame.reliability` を同期する。`mediaTimeMs` は `TrackerVideoFrameTiming.mediaTimeMs`、`pose.lastUpdatedAtMs`、`0` の順に選び、live camera / video fixture 停止、replay load、recording reset で previous reliability を reset する。
    - v1 frame は最低限 `frame.timestamp.mediaTimeMs`、`frame.video.width`、`frame.video.height`、`frame.poseSnapshot`、`frame.reliability`、`frame.canonical`、`frame.solver.poseRetarget`、`frame.solver.poseRetargetRuntime`、`frame.metrics.receivedAtPerformanceMs`、`frame.metrics.tracker` を保存する。
    - `frame.reliability` は optional slot として `sincro.reliability-map.v1` の `ReliabilityMap` を保存する。v1 は `timestamp`、`camera`、`joints`、`parts`、`gesture`、`warnings` を持つ JSON contract であり、finite number、lower-case enum、plain object だけを許可する。
    - `ReliabilityMap` の `finalWeight` と component `score` は `0..1` の低 weight 観測を含めて保存する。`finalWeight < threshold` は parse failure ではなく観測値として保持し、破棄や downstream weight 反映は後続 estimator / controller task の責務とする。
    - `parseReliabilityMap()` は replay / viewer 境界の検証 API であり、未知 `schemaVersion`、値域外 scalar、非 finite number、unknown joint / part key、runtime object 風 extra key を reject する。
    - 旧 log で `frame.reliability` が無い場合、replay viewer は `frame.poseSnapshot`、`frame.timestamp.mediaTimeMs`、`frame.video.width` / `height` から `createPoseReliabilityMap()` を再計算する。`poseSnapshot` も無い frame は reliability layer を `not_recorded` とし、log load 自体は失敗させない。
    - `frame.timestamp` は optional で `presentationTimeMs`、`expectedDisplayTimeMs`、`presentedFrames`、`droppedPresentedFrames`、`clockSource` を保存できる。`clockSource` は `request-video-frame-callback`、`request-animation-frame`、`timer` のいずれかで、fallback では rVFC 固有 field を欠損のままにする。
    - frame ごとの camera quality は optional `frame.metrics.cameraQuality` に保存する。top-level `cameraQuality` は追加しない。replay viewer の camera layer はこの frame 値がある場合、manifest camera settings より優先して表示する。
    - tracker performance budget は optional `frame.metrics.tracker.budget` として保存する。schema version は `sincro.tracker-performance-budget.v1`、degradation state は `"full"`、`"main-thread-low-fps"`、`"pose-reduced-fps"`、`"face-only"`、`"fallback"` の固定 enum とする。
    - `timestamp.receivedAtPerformanceMs` や top-level `tracker` は schema 外なので追加しない。`mediaTimeMs` と `metrics.receivedAtPerformanceMs` は時刻原点が異なるため、latency として差分を取らない。
    - recorder の duplicate 判定は rVFC の `presentedFrames` がある場合はそれを優先し、同じ `presentedFrames` の連続入力を保存しない。`presentedFrames` が 2 以上進んだ場合、clock は `droppedPresentedFrames = 差分 - 1` を保存する。
    - camera の `deviceId` / `groupId` は raw 値を保存しない。保存が必要になった場合も export 単位の salt で hash し、cross-export stable hash を残さない。
    - `CameraQualityScore.track` も raw `deviceId` / `groupId` / `label` を保存せず、`width`、`height`、`frameRate`、`facingMode`、`readyState` だけを持つ。
    - `MediaStreamTrack.getSettings()` 由来の camera settings は `MotionDebugApp` で scrub してから manifest へ渡し、recorder core は scrub 済み manifest を strict schema で検証する。
- motion metrics
    - metrics core は `src/character/motionEvaluation/motionMetrics.ts` を正本とし、`SincroMotionDebugFrame[]` と `MotionMetricConfig` だけを読む pure function とする。
    - summary schema は `sincro.motion-metrics.v1` とし、`neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`angularVelocitySpikeCount`、`reachClampOccupancy`、`trackingLossDurationMs`、`sideSwapCount`、`addedLatencyMs` を固定 key とする。
    - tracker budget overrun は Phase 1 metrics key へ追加しない。budget overrun は `frame.metrics.tracker.budget.budgetStatus` と `reasonCodes` を replay viewer の metrics layer で確認し、集計 metric 化は別タスクで扱う。
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
