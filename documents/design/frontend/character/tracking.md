# Frontend Character Tracking

## Summary

- `CharacterGaze` は `chat` 向けの注視入力と AutoMute を担当する。
- `SincroFaceTracker` / `SincroPoseTracker` は `sincro` 向けの同期入力を担当し、MediaPipe 生結果を正規化 snapshot へ変換する。
- `SincroHandTracker` は Pose wrist 由来 ROI で HandLandmarker を実行し、palm / finger の低次元 snapshot だけを出力する。
- Tracker runtime は camera track、video element、推論 loop、Worker fallback を所有し、UI 更新や VRM 適用は持たない。
- Tracker runtime は performance budget report と degradation state を Debug Console / motion-debug に出し、Worker round trip、Worker 内推論、main-thread fallback を切り分ける。
- Tracker runtime は ordered degradation policy v1 により、負荷上昇時の fps 低下、ROI pause、face-only / comfortable-idle 退避を固定順序で進める。既存 budget degradation state は互換のため維持し、詳細 stage は `SincroTrackerWorkerStats.degradationPolicy` に閉じる。
- Phase 8 の Hand / Face ROI は Pose 起点の full-frame normalized coordinate contract として `roiTracking` に置き、MediaPipe 実行や ReliabilityMap 変換とは分ける。
- Hand / Face ROI は lower fps の optional pass として扱い、Pose stale、ROI over-budget、main-thread fallback を stats と motion-debug metrics で観測できる。

## Scope

- 対象:
    - FaceDetector / FaceLandmarker / PoseLandmarker の責務境界
    - tracker runtime
    - face / pose / hand motion snapshot
    - Hand / Face ROI coordinate contract
    - Worker / main-thread fallback
- 非対象:
    - VRM controller の最終適用
    - Audio / RTC 接続

## Responsibilities

- `src/features/gaze/characterGaze`
    - `chat` mode の顔位置検出、注視 target、AutoMute 連動を置く。
- `src/features/gaze/faceTracking`
    - FaceLandmarker 結果から face motion snapshot を作る tracker を置く。
- `src/features/gaze/poseTracking`
    - PoseLandmarker 結果から pose motion snapshot / pose target を作る tracker と spike page runtime を置く。
- `src/features/gaze/handTracking`
    - HandLandmarker 結果から hand motion snapshot を作る tracker を置く。
    - Hand snapshot は `SincroHandMotionSnapshot`、左右 `SincroHandSideSnapshot`、`SincroHandFeatureSnapshot` の plain object に固定する。
    - 保存対象は `fullFrameWrist`、palm normal / direction、finger curl / splay、thumb oppose、openness、confidence、handedness summary、ROI observation、warning だけに限定する。MediaPipe landmark object、crop object、raw landmarks は保存しない。
    - `openness` は index / middle / ring / little の平均 curl から決め、`<= 0.35` を `open`、`0.35..0.72` を `half`、`>= 0.72` を `closed`、landmark 欠損または confidence `< 0.2` を `unknown` とする。
    - `palmNormal` / `palmDirection` は正規化済み 3 要素 tuple、scalar feature / confidence / handedness score は `0..1` に clamp する。
- `src/character/canonical`
    - tracker 観測から独立した後段共有 contract として `CanonicalUpperBodyState` を置く。
    - tracker は MediaPipe 生結果を直接 canonical state と同一視せず、後続 estimator が body-local 意味量へ変換する。
- `src/character/calibration`
    - initial calibration は tracker runtime の外側で `ReliabilityMap`、optional `CameraQualityScore`、optional `CanonicalUpperBodyState`、`validDurationMs` を読み、`InitialSincroCalibrationSession` を更新する pure boundary とする。
    - tracker runtime / Worker / MediaPipe 正規化 snapshot は step 遷移、camera permission retry、保存、UI wizard を所有しない。
- `src/character/reliability`
    - tracker / camera / temporal 由来の観測品質を後段へ渡す `ReliabilityMap` v1 contract を置く。
    - MediaPipe confidence は入力材料に留め、IK / filter / fallback が読む制御用 weight は joint / part / gesture 単位の `finalWeight` と component `score` として保存する。
- `src/character/temporal`
    - tracker が直接出す観測 snapshot ではなく、`CanonicalUpperBodyState` と `ReliabilityMap` の後段で共有する `TemporalUpperBodyState` v1 contract を置く。
    - dropout、prediction、recovering などの時系列状態を保存するが、MediaPipe raw result、Three.js object、VRM bone pose、IK quaternion は持たない。
- `src/features/gaze/trackingRuntime`
    - MediaPipe fileset、worker client、video frame clock、fallback stats、performance budget report、ordered degradation policy、performance gate を置く。
    - `trackerRuntime.ts` は `TrackerRuntime` の public facade と lifecycle state 接続を担当し、constructor / start / stop / dispose の公開挙動を保持する。
    - `trackerRuntimePredictionPlan.ts` は Face / Pose / Hand / Face ROI の cadence 判定を pure helper としてまとめる。
    - `trackerRuntimeMainThreadPipeline.ts` は main-thread 推論順序、snapshot callback publish、ROI stats への接続を担当する。
    - `trackerRuntimeWorkerPipeline.ts` は Worker detect、ImageBitmap transfer、Worker failure 時の main-thread fallback 起点を担当する。
    - `trackerRuntimeDegradationApplication.ts` は ordered degradation policy decision を runtime state と effective cadence へ反映する。
    - `trackerRuntimeStats.ts` は main-thread stats と performance budget / degradation policy / ROI stats の合成を担当する。
    - `trackerRuntimeRoiSnapshot.ts` は Face ROI metadata clone、pause warning、Pose stale 時の ROI skipped reason を担当する。
- `src/features/gaze/trackingRuntime/roiTracking`
    - Pose wrist / shoulder 由来の Hand / Face ROI contract と crop-local / full-frame 座標変換を置く。
    - ROI は full-frame normalized image coordinate の `centerX`、`centerY`、`width`、`height`、`clamped` だけを rect に持つ。
    - `SincroRoiObservation` は `side`、`source`、`rect`、`confidence`、optional `referencePoint`、`warnings` を持つ JSON 保存可能な plain object とする。
    - `referencePoint` と変換対象 point は `readonly [number, number]` の tuple に固定し、`{ x, y }` object、pixel 座標、MediaPipe landmark object、ImageBitmap / canvas / Three.js object は contract に入れない。
    - v1 は axis-aligned square / rectangle のみを扱い、rotated crop や `rotationRad` は保存しない。手首 roll、palm basis、Hand handedness は Hand result 後段の feature として扱う。
    - ROI warning は `SincroRoiWarningCode` として ReliabilityMap の warning enum とは別型にする。後続 reliability task は ROI warning を reason / warning へ明示変換する。
- `CharacterGaze`
    - FaceDetector による顔位置検出。
    - `chat` mode の注視入力。
    - arrive / leave event と AutoMute 連動。
- `TrackerRuntime`
    - camera track の取得・差し替え・解放。
    - video frame metadata 基準の推論 loop。
    - `requestVideoFrameCallback()` 対応環境では `mediaTime` / `presentationTime` / `expectedDisplayTime` / `presentedFrames` を `TrackerVideoFrameTiming` として callback 第 2 引数へ渡す。
    - `requestVideoFrameCallback()` 非対応環境では `requestAnimationFrame + video.currentTime`、RAF も使えない test / hidden runtime 境界では 5fps timer fallback を使う。fallback の rVFC 固有 field は欠損のままにする。
    - production `sincro` の observe-only motion pipeline へは Face / Pose callback の `TrackerVideoFrameTiming.mediaTimeMs`
      を渡す。stop など timing が無い callback では controller / sink 側が callback 受信時刻を明示的に渡し、
      estimator 内部の現在時刻参照には戻さない。
    - Worker 経路と main-thread fallback。
    - Worker が使える環境では Worker 経路を標準にし、Worker unavailable / 初期化失敗 / Worker detect failure では main-thread fallback へ切り替える。
    - main-thread fallback では effective target を face `<= 8fps`、pose `<= 4fps`、Hand ROI `<= 2fps`、Face ROI `<= 3fps` に clamp し、`SincroTrackerWorkerStats.budget.degradation.state = "main-thread-low-fps"` として保存する。
    - Ordered degradation policy v1 は詳細 stage を `"full" -> "gesture-reduced-fps" -> "optional-pass-reduced-fps" -> "roi-hand-paused" -> "pose-reduced-fps" -> "face-only" -> "comfortable-idle"` の順に 1 段ずつ進める。`budgetStatus === "over_budget"` または ROI over-budget が profile の `consecutiveOverBudgetFrames` に達した frame を over-budget frame とし、stage 進行後は over-budget / recovery counter を reset する。
    - Recovery は逆順に 1 段ずつ進め、`budgetStatus === "ok"` かつ ROI over-budget counter `0` の frame が profile の `recoveryFrames` 続いた場合だけ戻る。`face-only` から `pose-reduced-fps` へ戻るには、Pose が検出済みで、Pose inference time が profile 由来 pose budget 以下であることも必要とする。
    - `gesture-reduced-fps` は `gestureFps = max(1, floor(profile.cadence.gestureFps / 2))` を stats / debug に出すだけで、Gesture Recognizer runtime は本 stage では起動しない。`optional-pass-reduced-fps` は Hand / Face ROI cadence を半減し、`pose-reduced-fps` は Pose cadence を `max(2, floor(profile.cadence.poseFps / 2))` に下げる。Face full-frame cadence は維持する。
    - `roi-hand-paused` は policy 由来の `hand-paused` として ROI budget controller の effective pause state に合成する。`hand_roi_paused` reason code は stats に出すが、policy pause だけで ROI controller の `fallbackCount` / `skippedFrames` は増やさない。
    - `face-only` は既存 `degradePoseToFaceOnly()` 経路を使い、Pose / Hand を止めて full-frame Face tracking を継続する。`comfortable-idle` は camera / Face tracking を止めず、Pose / Hand / Face ROI を止めて Pose fallback と Hand lost snapshot を出す。どちらの stage でも `latestPoseSnapshot` は clear し、ROI optional pass が古い Pose snapshot を無期限に fresh 扱いしないようにする。comfortable pose の実際の blend は tracker runtime ではなく Temporal / MotionSolver / VrmPoseComposer 側の責務に残す。
    - `ignorePerformanceFallback` は `face-only` と `comfortable-idle` への自動遷移だけを抑制する。`gesture-reduced-fps`、`optional-pass-reduced-fps`、`roi-hand-paused`、`pose-reduced-fps` の cadence 低下と `degradationPolicy` stats は抑制しない。
    - Hand tracking は `poseOptions.enabled === true` かつ `poseOptions.hand?.enabled === true` の場合だけ有効にする。`onHandMotion` callback の有無だけでは起動しない。
    - Hand cadence は既定 `4fps`、指定範囲 `1..8fps` とする。`poseOptions.faceRoi?.enabled === true` の場合だけ Face ROI を有効にし、Face ROI cadence は既定 `6fps`、指定範囲 `1..12fps` とする。どちらも `SincroPoseMotionSnapshot.lastUpdatedAtMs` が `mediaTimeMs - lastUpdatedAtMs > 250` の場合は `pose_stale_for_roi` として skip し、frame count だけで fresh 判定しない。full-frame Face cadence は従来どおり `DEFAULT_TARGET_INFERENCE_FPS` を正本にする。
    - production `sincro` の `startSincroFaceTracking()` は `enableSincroPoseTracking()` が true のときだけ `poseOptions.hand.enabled` と `poseOptions.faceRoi.enabled` を true で渡し、`onHandMotion` を observe-only pipeline / Debug Console summary へ接続する。Pose tracking が disabled の場合は Hand / Face ROI も起動しない。
    - production Debug Console は Hand availability、source、ROI warning、openness、confidence の低頻度 summary だけを表示する。MediaPipe raw landmark、crop object、Hand wrist 座標は常時 snapshot に入れない。
    - ROI pause state は `"active" -> "hand-paused" -> "face-paused" -> "all-paused"` の順に進む。`hand-paused` は Hand ROI だけを止め、`face-paused` は Hand / Face ROI を止めるが full-frame Face は継続する。`all-paused` でも camera / full-frame Face は止めず、既存 Pose face-only fallback へ委譲する。
    - ROI over-budget は `handInferenceTimeMs + faceRoiInferenceTimeMs > 1000 / max(1, targetPoseInferenceFps) * 0.55` で判定する。5 ROI 実行 frame 連続で pause state を 1 段進め、budget 内 30 ROI 実行 frame 連続で 1 段戻す。
    - Worker stats は optional `effectiveHandFps`、`effectiveFaceRoiFps`、`roi` を持つ。`roi` は pause state、fallbackCount、skippedFrames、consecutiveOverBudgetFrames、ROI reason code を保持し、既存 `effectiveFaceFps` / `effectivePoseFps` の意味は変えない。
    - `SincroTrackerWorkerStats.budget` は `sincro.tracker-performance-budget.v1` の report で、`target`、`observed`、`budgetStatus`、`degradation`、`reasonCodes` を持つ。`observed.clockSource` は `TrackerVideoFrameTiming.source` を使い、欠損値は `undefined` のままにする。
    - `SincroTrackerWorkerStats.degradationPolicy` は optional `sincro.tracker-degradation-policy.v1` snapshot で、`stage`、`previousStage`、`reasonCodes`、`sinceMediaTimeMs`、`effectiveCadence`、`recovering` を持つ。既存 `TrackerRuntimeDegradationState` は `"full"`、`"main-thread-low-fps"`、`"pose-reduced-fps"`、`"face-only"`、`"fallback"` のまま維持し、policy 詳細 stage へ rename しない。
    - `budgetStatus` は Worker round trip と Pose inference cost を対象に、target frame / pose budget の `0.9x` 超を `warn`、`1.25x` 超を `over_budget` とする。
    - ROI reason code は `hand_roi_skipped`、`face_roi_skipped`、`roi_fallback_full_frame`、`roi_inference_over_budget`、`pose_stale_for_roi`、`hand_roi_paused`、`face_roi_paused` を使う。budget report の `target` / `observed` shape は変えず、詳細は `SincroTrackerWorkerStats.roi` に閉じる。
- `SincroFaceTracker`
    - FaceLandmarker から head pose、blendshape、confidence を抽出する。
    - `SincroFaceMotionSnapshot` を出力する。
    - `detect()` は従来どおり full-frame FaceLandmarker 推論を行う。
    - `detectWithRoi(videoFrame, poseSnapshot, timestampMs, options?)` は Pose face ROI が valid な frame だけ crop 推論を試し、ROI 欠損、ROI no-face、consistency score `0` では同一 frame で full-frame fallback を 1 回だけ実行する。v1 の `options` は空 object の予約枠であり設定 field は持たない。
    - ROI 推論の crop-local landmark は consistency 判定にだけ使い、snapshot には `SincroRoiObservation`、`source`、`warnings` だけを残す。ImageBitmap / canvas / MediaPipe raw result は保存しない。
- `SincroPoseTracker`
    - optional PoseLandmarker から肩、胴体、腕 target を抽出する。
    - 腕 target は通常 retarget 用の `tracked` と IK 用の `quality` / `usableForIk` / `ikWeight` を分けて出力する。
    - PoseLandmarker の `worldLandmarks` は tracker 内で `SincroPoseTargetPointSnapshot.world` へ正規化し、MediaPipe 生座標を controller / VRM 層へ直接渡さない。
    - 3D target は肩基準（腕）または腰基準（下半身）の local target と、VRM rig scale へ変換する前の normalized target に分けて保持する。
    - performance gate により face-only fallback できる。
- `SincroHandTracker`
    - HandLandmarker を `/3rd_party/hand_landmarker.task` から初期化する。
    - Pose が実行された frame の `SincroPoseMotionSnapshot` から left / right hand ROI を作り、valid な side だけ crop 推論する。両 side の ROI が invalid の場合だけ、同一 frame で full-frame fallback を 1 回実行する。
    - ROI crop-local landmark は `mapCropPointToFullFrame()` で full-frame normalized coordinate へ戻してから feature 化し、snapshot には crop object や raw landmark を残さない。
    - 左右 assignment は Hand handedness 単独で決めず、復元後 wrist と Pose wrist の距離を主条件にする。距離 `> 0.18` は `side_inconsistent` として捨てる。
    - full-frame fallback では同じ hand result を両 side に割り当てず、duplicate は `duplicate_assignment` warning として lost side に残す。同距離 tie は前フレーム assignment、次に wrist confidence で片側だけ採用する。
    - Hand wrist は palm / finger reliability 材料であり、`SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` を上書きしない。
    - HandLandmarker の未ロード、初期化失敗、推論例外は lost hand snapshot に落とし、Face / Pose 経路は継続する。
    - Gesture Recognizer の MediaPipe 実行接続は後続に残す。Phase 9 の MotionIntent estimator は optional gesture observation を受け取れるが、Phase 8 の Hand snapshot 自体には gesture label を流さない。
- Retargeters
    - neutral calibration、clamp、deadband、smoothing、confidence gate を扱う。
    - MediaPipe target の欠損や confidence 低下は retargeter の gate で扱い、人体的 joint constraint と head / chest no-go zone は `SincroArmIkSolver` の責務とする。
    - solver-side constraint は誤 target を完全に修正するものではなく、取り得ない姿勢や自己貫通を抑える最終 safety として runtime snapshot へ理由を返す。
- `pose-landmarker-spike`
    - MediaPipe PoseLandmarker の model / delegate / inference cost / landmark visibility を単体で確認する experimental page。
    - VRM retarget や IK 適用後の姿勢比較は扱わない。
- `motion-debug`
    - `TrackerRuntime` が出力する `SincroPoseMotionSnapshot` を VRM retarget へ流し、カメラ映像上の Sincro pose target と VRM の動きを比較する developer page。
    - Playwright 用 selector と `window.__SINCRO_MOTION_DEBUG__` は、手動調整の再現と screenshot / snapshot 取得のための内部 debug API とする。
    - `ignorePerformanceFallback` を有効にして、低性能端末での IK 調整時も pose snapshot を観測し続ける。
    - `ignorePerformanceFallback` 有効時も ordered degradation policy の reduced fps / ROI pause stage と `degradationPolicy` stats は記録する。face-only / comfortable-idle 退避だけを抑制し、motion-debug の IK 調整で Pose 観測を継続できるようにする。
    - 構造化 motion log recording は pose callback / pose fallback callback 起点で canonical upper body state を生成してから `MotionDebugRecorder.recordFrame()` に渡し、TrackerRuntime や tracker worker には canonical 生成、DOM / download / UI の責務を持たせない。
    - 構造化 motion log recording は同じ pose callback / pose fallback callback 起点で `ReliabilityMap` を生成し、`frame.reliability` へ保存する。reliability が未計算の frame でも slot は省略せず、同じ `mediaTimeMs` の default reliability map を保存する。
    - 構造化 motion log recording は canonical / reliability 解決後に motion-debug page 側の `TemporalStateEstimator.update()` を呼び、`frame.temporal` へ `TemporalUpperBodyState` を保存する。camera stop、video fixture load、recording load、replay stop、source reset では temporal estimator を reset する。
    - 構造化 motion log recording は temporal 解決後に同じ `mediaTimeMs` で motion-debug page 側の `MotionIntentEstimator.update()` を呼び、`frame.intent` へ `MotionIntentState` を保存する。recording 中でない live snapshot でも latest intent を保持し、reset timing は temporal estimator と揃える。
    - production `sincro` の observe-only pipeline でも `TemporalStateEstimator` と `MotionIntentEstimator` の
      reset timing は揃える。mode 切替、camera refresh、tracking stop、runtime error では pipeline を reset し、
      過去 frame の filter / hysteresis / cooldown を次の camera source へ持ち越さない。
    - 構造化 motion log recording は tracker callback と同じ `mediaTimeMs` で、motion-debug page 側の debug runtime snapshot から `frame.solver.phase6`、`frame.solver.phase7`、`frame.solver.phase9`、`frame.finalPose` を保存する。tracker runtime / Worker は Phase 6 solver snapshot、Phase 7 profile / calibration snapshot、Phase 9 semantic / finger debug snapshot、VrmPoseComposer result、baseline metrics を所有しない。
    - 構造化 motion log replay は `MotionReplayPlayer` が plain NDJSON を parse し、`pose-snapshot` mode では `frame.poseSnapshot` を後段の behavior / retarget 経路へ再投入する。`frame.canonical` がある場合は saved canonical を viewer / snapshot の正本にし、無い場合だけ live fallback の canonical を使う。invalid canonical は replay failure にせず、canonical layer の parse error summary として表示する。
    - reliability layer は live snapshot、saved `frame.reliability`、旧 log の `frame.poseSnapshot` 再計算の順に解決する。saved reliability は `parseReliabilityMap()` で検証し、invalid な場合も replay failure にせず `parseStatus: "invalid"`、parse errors、raw value を `available` layer value として表示する。`frame.reliability` と `frame.poseSnapshot` の両方が無い旧 log だけ `not_recorded` とする。
    - temporal layer は saved `frame.temporal`、live snapshot の順に解決する。replay frame に saved temporal がある場合は `parseTemporalUpperBodyState()` で検証し、invalid な場合も replay failure にせず `parseStatus: "invalid"`、parse errors、raw value を `available` layer value として表示する。replay frame に `frame.temporal` が無い旧 log は live recompute で隠さず `not_recorded` とする。
    - intent layer は replay frame の saved `frame.intent` だけを正本にする。旧 log で `frame.intent` が無い場合は `not_recorded`、schema invalid は `invalid` とし、live recompute で欠損を隠さない。`pose-snapshot` replay では saved intent があっても estimator state を上書きせず、snapshot 側には pipeline 再実行の latest intent を optional で出す。
    - solver layer は saved `frame.solver.phase6`、`frame.solver.phase7`、`frame.solver.phase9` を `{ phase6, phase7, phase9 }` の substatus として表示する。3 件すべて欠損した旧 log だけ外側 `solver` を `not_recorded` とし、いずれかが valid または invalid なら外側は `available` にする。旧 log の legacy `frame.solver.poseRetarget` は残すが、Phase 6 / Phase 7 / Phase 9 solver layer の代替として再計算しない。旧 log で `frame.solver.phase9` が無い場合は `phase9.status = "not_recorded"`、schema invalid は `phase9.status = "invalid"` とする。
    - Phase 7 sublayer は `sincro.phase7-profile-calibration.v1` として、完成版 `AvatarMotionProfile`、initial / online calibration、active canonical calibration を developer-visible JSON で表示する。通常 UI の案内文言は保存せず、tracker runtime / Worker も calibration state を所有しない。
    - finalPose layer は saved `frame.finalPose` を parse して `available`、欠損時は `not_recorded`、schema 違反時は `invalid` として表示する。
    - replay 中は `TrackerRuntime.startFaceTracking()` を呼ばず、live camera / video fixture runtime と camera track を停止してから進める。raw MediaPipe result からの再推論は Phase 1 の対象外である。
    - `mediapipe-raw-result` mode は `frame.mediapipe` slot の予約であり、Pose / Hand / Face raw serializer が揃うまでは `unsupported_mode` を返す。
    - live snapshot の camera state は optional `camera.frameTiming` に最新 `TrackerVideoFrameTiming` を載せ、既存 top-level `status`、`camera.source`、`camera.width`、`camera.height`、`pose`、`tracker`、`canonical` の field 名は維持する。
    - live snapshot の camera state は source が `camera` / `fixture` の場合だけ optional `camera.quality` に `sincro.camera-quality.v1` の `CameraQualityScore` を載せる。source が `none` の場合は score を生成せず、viewer の camera layer は未記録扱いにする。
    - `CameraQualityScore` は resolution、cadence、torso / hands in frame、border risk、hand small risk、motion blur risk の 7 component を持つ pure score である。guide message は reason code から固定文言へ変換し、自由文生成は行わない。
    - `CameraQualityScore.track` は scrub 済みの `width`、`height`、`frameRate`、`facingMode`、`readyState` だけを保存し、raw `deviceId`、`groupId`、`label` は保存しない。
    - v1 の `motionBlurRisk` は cadence、actual `frameRate`、低 pose confidence 継続だけを見る proxy であり、pixel blur / brightness 解析は行わない。
    - CameraQualityScore は Phase 3 の debug / recording 表示用であり、ReliabilityMap、TemporalStateEstimator、IK weight にはまだ接続しない。
    - live camera / video fixture の source 判定、camera setting scrub、manifest 生成、download link 生成は `src/pages/motionDebug/` 側の責務とする。

## Data / State

- `TrackerRuntimePerformanceProfile`
    - `src/features/gaze/trackingRuntime/trackerRuntimePerformanceProfile.ts` を正本とする runtime profile contract。
    - schema version は `sincro.tracker-performance-profile.v1` に固定し、`id`、optional `requestedId`、`camera`、`cadence`、`debugLog`、`degradationBudget`、`warnings` だけを持つ JSON 保存可能な plain object とする。
    - profile id は `high-end-desktop`、`standard-laptop`、`mobile-safari`、`debug` の 4 種に固定する。未知 id は throw せず `standard-laptop` に fallback し、`warnings: ["unknown_profile_id_defaulted"]` と `requestedId` に caller 指定値を残す。
    - resolver 入力は `{ performanceProfileId?: string; performanceProfile?: unknown; defaultProfileId?: TrackerRuntimePerformanceProfileId }` とし、通常 runtime の default は `standard-laptop`、motion-debug 呼び出し時だけ caller が `defaultProfileId: "debug"` を渡す。
    - `performanceProfile` と `performanceProfileId` が同時指定された場合、実体は `performanceProfile` を優先し、`performanceProfileId` は `requestedId` と debug 表示用の要求値としてだけ扱う。
    - custom profile は finite number、固定 enum、plain object だけを受け付ける。`NaN` / `Infinity`、DOM object、runtime class instance、function は invalid custom profile として `standard-laptop` fallback に落とす。
    - camera constraints は profile の `camera` から `idealWidth`、`idealHeight`、`idealFrameRate`、`maxFrameRate`、`facingMode: "user"` を読む。browser `getUserMedia()` へ渡す際は `ideal` / `max` だけを使い、`exact` や強い `min` は使わない。
    - cadence は Face / Pose / Hand / Face ROI / Gesture の target fps default である。`TrackerRuntime.startFaceTracking()` は明示 `targetInferenceFps`、`poseOptions.targetInferenceFps`、`poseOptions.hand.targetInferenceFps`、`poseOptions.faceRoi.targetInferenceFps` がある場合は明示値を優先し、未指定 field だけ profile cadence を使う。
    - profile 固定値:

        | id                 | camera           | cadence Face/Pose/Hand/Face ROI/Gesture | numeric ring buffer |
        | ------------------ | ---------------- | --------------------------------------- | ------------------- |
        | `high-end-desktop` | `1280x720 30fps` | `15/12/8/10/6`                          | `600`               |
        | `standard-laptop`  | `960x540 24fps`  | `12/8/4/6/3`                            | `600`               |
        | `mobile-safari`    | `640x480 15fps`  | `8/4/2/3/1`                             | `600`               |
        | `debug`            | `1280x720 30fps` | `15/12/4/6/2`                           | `1800`              |

    - `debugLog.captureFullDumpByDefault` は全 profile で `false`、`overlayCaptureFps` は `1` 以下に固定する。常時記録は numeric ring buffer に限定し、PNG / overlay / full dump は明示操作または後続 debug tool の責務とする。
    - `degradationBudget` は Phase 3 / Phase 8 の既定値として `workerRoundTripWarnRatio: 0.9`、`workerRoundTripOverBudgetRatio: 1.25`、`roiBudgetRatio: 0.55`、`consecutiveOverBudgetFrames: 5`、`recoveryFrames: 30` を持つ。Phase 10 後続の ordered degradation policy はこの profile と budget を入力にするが、本 profile contract 自体は自動 profile downgrade や fps 低下の state machine を持たない。

- `SincroFaceMotionSnapshot`
    - detected
    - confidence
    - headPose
    - blendshapes
    - roi（optional `SincroRoiObservation`。ROI crop や MediaPipe raw result は含めない）
    - source（`"roi"`、`"full-frame"`、`"full-frame-fallback"`、`"lost"`）
    - warnings
    - inferenceTimeMs
    - inferenceFps
    - fallbackReason
    - FaceLandmarker の full-frame 既存経路では `source: "full-frame"`、`warnings: []` を返す。ROI fallback で full-frame が検出した場合は `source: "full-frame-fallback"`、fallback でも未検出の場合は `source: "lost"`、`fallbackReason: "face_not_detected"` を返す。
    - Worker / TrackerRuntime は最新 Pose snapshot が fresh な場合だけ Pose snapshot から Face ROI を作る。Pose が stale、Face ROI が cadence skip / pause、または pose performance gate により face-only fallback 中の frame では full-frame Face tracking を継続し、Face cadence を Pose cadence に引きずらない。Face ROI pause 中の snapshot は `face_roi_paused` warning を持ち、motion-debug / reliability が stale と pause を区別できる。
- `SincroPoseMotionSnapshot`
    - trackingEnabled
    - detected
    - shoulder / torso / arm target
    - lowerBodyTargets（hip / knee / ankle の観測確認用 target）
    - consecutiveFailures
    - degradedToFaceOnly
    - fallbackReason
    - MediaPipe / camera 由来の観測 snapshot であり、後段共有の `CanonicalUpperBodyState` ではない。
    - `leftArm` / `rightArm` の target は tracking 入力 video の観測値を正規化したもので、body-local な reach / elevation / openness などの意味量は canonical estimator の責務とする。
- `SincroHandMotionSnapshot`
    - `trackingEnabled`
    - `detected`
    - `leftHand` / `rightHand`
    - `inferenceTimeMs`
    - `inferenceFps`
    - `lastUpdatedAtMs`
    - `fallbackReason`
    - 左右 hand snapshot は `detected`、`assignedSide`、`source`、`confidence`、optional `handednessLabel`、`handednessScore`、optional `roi`、optional `fullFrameWrist`、`features`、`warnings` を持つ。
    - default lost hand は `detected: false`、`source: "lost"`、`confidence: 0`、`handednessScore: 0`、`fullFrameWrist: undefined`、`palmNormal: [0, 0, 1]`、`palmDirection: [0, -1, 0]`、scalar feature `0`、`openness: "unknown"`、`warnings: ["landmarks_missing"]` とする。
    - `source` は `"roi"`、`"full-frame-fallback"`、`"previous"`、`"lost"` の固定 enum とする。`previous` は後続 temporal / reliability 接続用の予約値であり、Phase 8 tracker は raw landmark replay を保存しない。
- `CanonicalUpperBodyState`
    - `sincro.canonical-upper-body.v1` の schema version を持つ、body-local upper body の意味量 contract。
    - `SincroPoseMotionSnapshot` を置き換えず、tracking 観測、temporal、intent、IK、metrics が共有する中間表現として別 slot に保存する。
    - 保存形式は finite number、string enum、3 要素 tuple、plain object に限定し、MediaPipe landmark object、Three.js object、VRM bone keyed pose は入れない。
    - 左右は解剖学的な `left` / `right` に固定し、camera preview の mirror 表示や screen-space の左右反転とは分けて扱う。
    - `parseCanonicalUpperBodyState()` は log / replay 境界の検証 API であり、未知 schema version、値域外 scalar、非 finite number、runtime object 風 extra key を reject する。
- `ReliabilityMap`
    - `sincro.reliability-map.v1` の schema version を持つ、tracking 観測品質の保存 contract。
    - `timestamp`、`camera`、`joints`、`parts`、`gesture`、`warnings` を持ち、`frame.reliability` optional slot に保存する。v1 は finite number、lower-case enum、plain object に限定し、Three.js object、MediaPipe landmark object、class instance は入れない。
    - `JointReliability` / `PartReliability` の `finalWeight` と各 component `score` は `0..1` で、低 weight 観測も parse 成功として保持する。threshold 未満の観測を破棄するかどうかは後続 estimator / controller が判断する。
    - `parseReliabilityMap()` は未知 `schemaVersion` を先に `unknown_schema_version` として返し、値域外 scalar は `out_of_range`、構造違反や unknown enum / extra key は `invalid_state` として返す。
- `TemporalUpperBodyState`
    - `sincro.temporal-upper-body.v1` の schema version を持つ、canonical upper body の時間方向 state contract。
    - `TemporalPartState` は `"tracked"`、`"suspect"`、`"predicted"`、`"lost"`、`"recovering"` の lower-case enum に固定し、`ReliabilityMap` の同名 enum とは別型として扱う。Reliability は観測品質、Temporal は時系列推定状態を表す。
    - `frame.temporal` optional slot に保存する plain object であり、`arms.left` / `arms.right` は canonical arm scalar と optional body-local wrist / elbow tuple、velocity、optional recovering blend を持つ。head は optional で、未観測時は省略できる。
    - `parseTemporalUpperBodyState()` は未知 `schemaVersion` を `unknown_schema_version`、値域外 scalar / blend duration / blend progress を `out_of_range`、非 finite number / unknown enum / extra key / class instance を `invalid_state` として返す。
    - Temporal は canonical / reliability の後段に位置し、tracker runtime、Worker、MediaPipe 正規化 snapshot の責務ではない。VRM pose 合成、IK solver quaternion、final applied pose は MotionSolver / VrmPoseComposer と final pose 系 slot の責務に残す。
- `SincroRoiObservation`
    - `side` は `"left"`、`"right"`、`"face"` に固定する。左右は解剖学的な side とし、camera preview の mirror 表示とは分ける。
    - `source` は `"pose-wrist"`、`"pose-face"`、`"full-frame-fallback"`、`"previous"`、`"none"` の固定 enum とする。Pose wrist / face region が欠損した場合は例外にせず `source: "none"`、`confidence: 0`、`roi_missing` warning を持つ observation を返す。
    - rect は full-frame normalized image coordinate の center 形式を正本にする。左上 `x/y/width/height` 形式は採用せず、crop-local normalized point から full-frame normalized point へ戻す式を左右対称に保つ。
    - rect clamp は left / top / right / bottom を `0..1` に clip してから center / size を再計算する。center だけを寄せて size を維持する方式は使わない。
    - `validateRoiRect()` は finite check、edge clip、min size check、confidence clamp の順に処理する。edge clip では `roi_clamped`、clip 後の width / height が `0.08` 未満なら `roi_too_small` と `confidence: 0` を残す。
    - `mapCropPointToFullFrame()` と `mapFullFramePointToCrop()` は ROI rect と normalized tuple だけを読む pure function とし、round-trip は `1e-6` 以下に保つ。
    - ROI consistency は expected point と observed full-frame point の正規化距離から算出し、`<= 0.04` は score `1`、`0.04..0.18` は線形低下、`> 0.18` は score `0` と `roi_inconsistent` warning にする。
- `PoseReliabilityEstimator`
    - `src/character/reliability/poseReliabilityEstimator.ts` の `createPoseReliabilityMap()` は Phase 8 時点の pure estimator であり、`pose: SincroPoseMotionSnapshot`、optional `hand: SincroHandMotionSnapshot`、optional `face: SincroFaceMotionSnapshot`、optional `cameraQuality: CameraQualityScore`、optional `previous: { pose: SincroPoseMotionSnapshot; mediaTimeMs: number; reliability?: ReliabilityMap }`、caller が渡す `mediaTimeMs`、`video: { width: number; height: number }` だけを入力にする。
    - estimator 内で `performance.now()` は呼ばず、temporal component は `mediaTimeMs - previous.mediaTimeMs` と wrist / elbow / shoulder の normalized image coordinate 差分だけで計算する。`previous.reliability` は入力 shape に含めるが、Phase 4a の boneLength / bodyScale / temporal の主計算は前回 pose を正本にする。
    - joint component は `modelPresence`、`modelVisibility`、`tracking`、`border`、`boneLength`、`bodyScale`、`temporal`、`side`、`roi`、`cameraQuality` を常に埋める。`boneLength` は左右 arm の upper / lower world length ratio と前回 total arm length ratio、`bodyScale` は `upperBody.shoulderWidth`、`cameraQuality` は `CameraQualityScore.overall.score` を使う。
    - `finalWeight` は component score の幾何平均で、0 score は `0.001` として扱う。state 境界は `>= 0.65` が `tracked`、`0.05..0.65` が `suspect`、`< 0.05` が `lost` であり、`predicted` / `recovering` は TemporalStateEstimator の責務として Phase 4a では返さない。
    - `face` が指定された場合、`joints.head` と `parts.head` は Face snapshot を正本にして `source: "face"` を返す。`face.roi.confidence` を ROI component score とし、Face center consistency は再計算しない。Face snapshot の `source` は旧 snapshot 互換で optional として扱い、`"lost"` の場合だけ tracking lost とする。
    - `hand` が指定された場合、`joints.leftHand/rightHand` と `parts.leftHand/rightHand` は Hand snapshot を正本にして `source: "hand"` を返す。Hand ROI component は `calculateRoiConsistency({ expected: hand.roi.referencePoint, observed: hand.fullFrameWrist })` を正本にし、`referencePoint` または `fullFrameWrist` が無い旧 snapshot では `not_available_in_pose_snapshot` に落とす。
    - `parts.leftFinger/rightFinger` は Hand `features.openness !== "unknown"` の場合だけ `source: "hand"` とし、finger curl の finite 性と hand reliability を読む。Phase 9 の finger curl pose layer はこの low-level Hand snapshot と MotionIntent を読み、VRM finger bone rotation 用の semantic layer を motion-debug / helper 側で生成する。
    - ROI reason は snapshot 入力自体が無い実行境界では既存 placeholder を維持し、snapshot はあるが `roi` field だけ無い旧 snapshot / 旧 replay log では `not_available_in_pose_snapshot`、新規 ROI metadata の failure warning では `roi_missing` / `roi_inconsistent` に写像する。同じ欠損に `roi_missing` と `not_available_in_pose_snapshot` を同時付与しない。
- Initial calibration input boundary
    - step id は `precheck`、`neutral`、`a_pose`、`hand_open`、`face_yaw_optional` の固定 enum とする。標準完了判定は `precheck` / `neutral` / `a_pose` / `hand_open` を使い、`face_yaw_optional` は debug / 改善案内用の optional step として扱う。
    - `precheck` は `CameraQualityScore.overall.status` と `components.torsoInFrame`、`neutral` は torso / head reliability と canonical torso yaw、`a_pose` は elbow / wrist reliability と border risk、`hand_open` は hand reliability と hand small risk、`face_yaw_optional` は head reliability と canonical torso yaw だけを読む。該当 camera component が無い場合はその camera check だけ skipped とし、reliability / canonical の欠損は threshold 未満の入力として扱う。
    - status は `not_started`、`ready`、`ready_without_hands`、`retry_recommended`、`failed` の固定 enum とする。手だけが degraded / retry / failed / skipped の場合は、腕・頭・体幹を開始できる `ready_without_hands` に落とし、`hand_open` 単独の不調を session 全体の `failed` にしない。
    - retry reason は `shoulders_out_of_frame`、`face_not_front`、`elbow_or_wrist_hidden`、`hand_not_visible`、`too_dark`、`motion_blur`、`low_reliability`、`camera_unavailable` の固定 enum とする。通常 UI はこの reason を固定日本語文言へ最大 2 件に変換して表示し、score、raw component 名、debug object は出さない。
    - debug UI / motion-debug は step status、retry reason、score、validDurationMs、measurements、debug field を developer-visible JSON として表示できる。MediaPipe raw landmark、camera device id / label、browser permission object は initial calibration session に保存しない。
- `SincroPoseTargetPointSnapshot`
    - `tracked`: 通常 target として十分な confidence と有限座標を持つ状態。
    - `quality`: `strong` / `weak` / `lost`。`weak` は座標を IK に使えるが、強度を落とすべき状態。
    - `usableForIk`: IK solver が target として使える状態。wrist / elbow は低 confidence でも有限座標かつ画面近傍なら weak target になり得る。
    - `ikWeight`: weak target を使う時に IK 強度へ掛ける 0.0-1.0 の重み。
    - `world`: MediaPipe world coordinates 由来の 3D target。`hasWorldCoordinates` / `worldQuality` / `worldIkWeight` / `worldStaleReason` を 2D target とは別に持つ。
    - `world.normalizedX/Y/Z`: shoulder width または hip width 由来の人物スケールで割った local 3D target。VRM bone 長や左右反転の適用は retargeter / solver 側の責務とする。
    - `world.worldUsableForIk`: `world_3d_ik` solver の gate。shoulder / elbow / wrist のいずれかが false の腕は、retargeter 側で部位 fallback し、feature retarget へ戻す。
    - `world.worldIkWeight`: weak target を許容する腕末端ほど低 confidence でも 0 より大きくなり得る。solver は最小 weight を腕全体の IK blend に使う。
- motion evaluation log frame
    - `sincro.motion-debug-log.v1` の保存単位は NDJSON の frame record であり、tracker が出力する正規化 pose snapshot は `frame.poseSnapshot` に保存する。
    - `frame.canonical` は motion-debug page 側で `SincroPoseMotionSnapshot` と latest face snapshot から生成した `CanonicalUpperBodyState` を保存する optional slot である。`parseMotionDebugLogLines()` は unknown optional slot として保持し、replay / viewer 境界で `parseCanonicalUpperBodyState()` により valid / invalid を判定する。
    - `frame.reliability` は motion-debug page 側で生成する `ReliabilityMap` の optional slot である。`parseMotionDebugLogLines()` は unknown optional slot として保持し、replay / viewer 境界で `parseReliabilityMap()` により valid / invalid を判定する。
    - `frame.hand` は motion-debug page 側で保存する optional Hand snapshot slot である。保存対象は `SincroHandMotionSnapshot` の JSON 可能な低次元 field に限定し、raw landmarks、crop object、MediaPipe result は入れない。
    - `frame.temporal` は motion-debug page 側で `CanonicalUpperBodyState` と `ReliabilityMap` から生成した `TemporalUpperBodyState` を保存する optional slot である。`arms.left` / `arms.right` の `state`、`confidence`、`source`、`stateAgeMs`、`observedAgeMs`、`warnings`、`recoveringBlend`、`velocity`、`bodyLocalWrist` は replay viewer の JSON value で確認できる。
    - `frame.intent` は motion-debug page 側で `TemporalUpperBodyState`、`ReliabilityMap`、optional Hand snapshot から生成した `MotionIntentState` を保存する optional slot である。replay / metrics は saved value を正本にし、旧 log 欠損を live recompute で補完しない。
    - `frame.solver.phase6` は motion-debug page 側で保存する Phase 6 solver snapshot であり、`profile.schemaVersion`、finite number だけの measurements、左右 arm の IK state / constraint reason code を確認するための developer-visible slot である。MediaPipe raw result や tracker worker stats はこの slot に入れない。
    - `frame.solver.phase7` は motion-debug page 側で保存する Phase 7 profile / calibration snapshot であり、`schemaVersion = "sincro.phase7-profile-calibration.v1"`、optional `profile`、optional `initialCalibration`、optional `onlineCalibration`、optional `activeCanonicalCalibration`、`warnings` を持つ。通常 UI の guide message や runtime object は保存しない。
    - `frame.solver.phase9` は motion-debug page 側で保存する Phase 9 semantic / finger debug snapshot であり、`schemaVersion = "sincro.phase9-semantic-motion.v1"`、`timestamp`、`intent`、`semantic`、optional `finger.left/right`、`layers`、`warnings` だけを持つ plain object とする。Phase 6 / Phase 7 / finalPose の schema へ semantic / finger field は混ぜない。
    - `frame.finalPose` は motion-debug page 側で保存する `VrmPoseComposerResult` snapshot であり、`ownedBones`、`suppressedLayers`、`clampedBones`、`warnings` を確認するための developer-visible slot である。実際の VRM bone 書き込み順序や tracker 推論 loop は変更しない。
    - 旧 log で `frame.reliability` が欠損している場合、replay viewer は `frame.poseSnapshot`、`frame.timestamp.mediaTimeMs`、`frame.video.width` / `height` から `createPoseReliabilityMap()` を再計算する。この fallback は旧 log 互換の pose-only placeholder であり、保存されていない Hand / Face 観測を replay 時に捏造しない。再計算にも使える `poseSnapshot` が無い場合だけ reliability layer は `not_recorded` になる。旧 log で `frame.intent` / `frame.solver.phase7` / `frame.solver.phase9` が欠損している場合は該当 sublayer だけ `not_recorded` にし、log load 自体は失敗させない。
    - MediaPipe raw result は必要な場合も `frame.mediapipe` に分け、`frame.poseSnapshot` には `SincroPoseMotionSnapshot` 相当の normalized data を置く。
    - replay API の `loadRecording()` は plain NDJSON `string` または `File` だけを受け付ける。`startReplay({ mode })`、`stepReplay(frameIndex)`、`stopReplay()`、`getReplayState()` は developer-only の window API として公開する。
    - `frame.timestamp.mediaTimeMs` は tracker callback の `TrackerVideoFrameTiming.mediaTimeMs` を正本にする。fallback 時だけ `video.currentTime * 1000` を使う。
    - callback 受信時の `performance.now()` は `frame.metrics.receivedAtPerformanceMs` として保存する。tracker stats は `frame.metrics.tracker` に入れ、`timestamp.receivedAtPerformanceMs` や top-level `tracker` は使わない。
    - tracker performance budget は `frame.metrics.tracker.budget` に保存する。`reasonCodes` は dropped frame、Worker pending detect、Worker failure / unavailable、pose repeated failures、pose inference too slow、main-thread fallback、ROI skip / pause / fallback / over-budget を enum として保持し、既存 `fallbackReason` の文字列は互換のため変更しない。ROI の累積 stats は `frame.metrics.tracker.roi` で確認する。
    - ordered degradation policy snapshot は `frame.metrics.tracker.degradationPolicy` に保存する。motion-debug viewer の metrics layer は `degradationPolicy.stage`、`recovering`、`reasonCodes`、`effectiveCadence` と active runtime performance profile を developer-visible JSON として表示する。camera resolution 再交渉と Gesture Recognizer runtime 実行はこの policy snapshot の予約情報に留め、実適用は後続 task に残す。
    - degradation metrics の保存側 boundary は `frame.metrics.tracker.budget.budgetStatus`、`frame.metrics.tracker.droppedFrames`、`frame.metrics.tracker.degradationPolicy.stage` / `recovering`、`frame.metrics.tracker.roi.pauseState`、`frame.timestamp.droppedPresentedFrames` に限定する。`budget.observed.droppedFrames` は budget report の観測値として残すが、motion metrics の正本入力にはしない。
    - 同一 `presentedFrames` と同一 `SincroPoseMotionSnapshot.lastUpdatedAtMs` の連続入力は duplicate frame として recorder が捨てる。`presentedFrames` が無い fallback / legacy 入力では、同一 `mediaTimeMs` と同一 `lastUpdatedAtMs` を duplicate とする。
    - camera 実設定を manifest に残す場合、raw `deviceId` / `groupId` は保存しない。hash を保存する場合も export 単位だけで比較可能にし、export をまたいで安定する識別子を残さない。
    - frame ごとの camera quality は `frame.metrics.cameraQuality` に保存する。top-level `cameraQuality` は schema 外とし、manifest の camera settings と同じく raw device identifier は持たない。
    - exported NDJSON は `parseMotionDebugLogLines()` が manifest と frame records を validation できる schema に固定する。
- motion metrics input boundary
    - `trackingLossDurationMs` は `frame.poseSnapshot.detected`、`degradedToFaceOnly`、`frame.timestamp.mediaTimeMs` を入力境界とし、lost / degraded の連続区間を timestamp 差分で合計する。
    - `sideSwapCount` は `frame.poseSnapshot.leftArm.targets.wrist.cameraX` / `rightArm.targets.wrist.cameraX` と両 wrist の `confidence > 0.5` を入力境界とし、低 confidence の frame では左右反転を数えない。
    - `addedLatencyMs` は `frame.metrics.tracker.workerRoundTripMs` の p95 を入力境界とする。`frame.timestamp.mediaTimeMs` と `frame.metrics.receivedAtPerformanceMs` は時刻原点が異なるため、latency metric では差分を取らない。
    - `recoveryJumpAngleDeg` は lost / degraded から recovered へ戻った frame の `mediaTimeMs` を起点に、500ms window の `frame.applied.angularVelocityDegPerSec` を優先し、欠落時だけ `frame.solver.poseRetarget` の arm quaternion 連続差分へ fallback する。
    - Phase 5 temporal metrics は `temporalPredictedArmFrameCount`、`temporalRecoveringArmFrameCount`、`temporalLostArmDurationMs`、`temporalMaxRecoveryJumpDegEquivalent`、`temporalNeutralWristJitter` の 5 key を持つ。Phase 6 metrics は `solverElbowFlipRejectCount`、`solverReachClampOccupancy`、`solverPoleUncertainFrameCount`、`finalPoseAngularVelocityClampCount`、`finalPoseOwnedBoneConflictCount` を追加する。Phase 9 metrics は `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount` を追加する。Phase 10 metrics は `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount` を追加し、すべて `unit: "count"`、`direction: "lower_is_better"` とする。すべて `MotionMetricResult.value: number | null` の単一数値 metric とし、invalid / missing input は `not_available` にする。
    - `trackerDroppedFrameCount` は `frame.metrics.tracker.droppedFrames` を累積値として frame 間差分へ正規化し、`frame.timestamp.droppedPresentedFrames` と同一 frame で大きい値だけを採用する。`degradationStageFrameCount` は新 `degradationPolicy.stage` を優先しつつ旧 `budget.degradation.state` も fallback として読む。`degradationRecoveryFrameCount` と `roiPausedFrameCount` は旧 log から推測せず、それぞれ `degradationPolicy` / `roi` 欠損時に `not_available` とする。
- `SincroPoseRetargetedArm.constraint`
    - `reasons`: solver-side safety の発火理由。入力欠損とは分けて、joint limit / pole stabilization / collision avoidance を表示する。
    - `weightScale`: constraint / collision による IK weight 減衰率。最終 IK weight は target confidence 由来 weight とこの値を掛けたものになる。
    - `targetPushDistance`: head sphere / chest ellipsoid から hand target を押し戻した距離。forearm segment の no-go zone 検出だけでは 0 のままになり得る。

## Failure Modes

- MediaPipe model / wasm 配置漏れ:
    - tracking を無効化し、UI / Debug Console に理由を表示する。
- Worker 初期化失敗:
    - main-thread tracker へ fallback し、effective target を face `<= 8fps`、pose `<= 4fps`、Hand ROI `<= 2fps`、Face ROI `<= 3fps` に clamp する。
    - `degradation.state` は `"main-thread-low-fps"`、reason code は `main_thread_fallback` とし、Worker unavailable / failure は `reasonCodes` で切り分ける。
- ROI over-budget:
    - Hand ROI、Face ROI の順で optional pass を落とし、full-frame Face と camera loop は継続する。
    - pause 中の Hand は `fallbackReason: "hand_roi_paused"` の lost snapshot を出し、Face は full-frame snapshot に `face_roi_paused` warning を残す。
- HandLandmarker 初期化失敗:
    - Face / Pose tracking は継続し、Hand は `model_not_loaded` warning を持つ lost snapshot と Debug Console summary に落とす。
    - production observe-only pipeline は Hand 欠損を例外にせず、次の Pose callback で pose-only / face-only の既存 downstream 更新を続ける。
- 推論遅延または連続検出失敗:
    - pose のみ face-only に降格できる。
    - 既存 `fallbackReason` は `pose_inference_too_slow` を維持し、budget の `reasonCodes` では `pose_inference_warn` / `pose_inference_over_budget` に写像する。
    - `pose_inference_too_slow` は起動直後の MediaPipe warm-up サンプルを除外し、target pose inference fps から算出した推論予算で判定する。
    - `forceSincroPoseTracking` が有効な場合は、低性能端末でのデバッグを優先して `pose_inference_too_slow` による face-only 降格だけを無効化する。この場合も budget の `degradation.state` と reason code は残す。
- Firefox GPU delegate 相性:
    - CPU delegate を使う。

## Change Checklist

- tracker を変更したら camera track の二重取得と loop の二重起動がないか確認する。
- MediaPipe の category 名や matrix を controller へ漏らさない。
- Debug Console へ raw / normalized / retarget / applied のどこを表示するか決める。
- Gaze camera device 切替時に preview / AutoMute / tracker が正しく再初期化されるか確認する。
- IK 調整を行う場合は `motion-debug` で camera overlay、VRM、`poseRetargetRuntime` を同時に確認する。

## References

- `documents/design/frontend/character/overview.md`
- `documents/design/frontend/character/motion.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
