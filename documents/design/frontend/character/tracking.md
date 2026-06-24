# Frontend Character Tracking

## Summary

- `CharacterGaze` は `chat` 向けの注視入力と AutoMute を担当する。
- `SincroFaceTracker` / `SincroPoseTracker` は `sincro` 向けの同期入力を担当し、MediaPipe 生結果を正規化 snapshot へ変換する。
- Tracker runtime は camera track、video element、推論 loop、Worker fallback を所有し、UI 更新や VRM 適用は持たない。
- Tracker runtime は performance budget report と degradation state を Debug Console / motion-debug に出し、Worker round trip、Worker 内推論、main-thread fallback を切り分ける。

## Scope

- 対象:
    - FaceDetector / FaceLandmarker / PoseLandmarker の責務境界
    - tracker runtime
    - face / pose motion snapshot
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
- `src/character/canonical`
    - tracker 観測から独立した後段共有 contract として `CanonicalUpperBodyState` を置く。
    - tracker は MediaPipe 生結果を直接 canonical state と同一視せず、後続 estimator が body-local 意味量へ変換する。
- `src/character/reliability`
    - tracker / camera / temporal 由来の観測品質を後段へ渡す `ReliabilityMap` v1 contract を置く。
    - MediaPipe confidence は入力材料に留め、IK / filter / fallback が読む制御用 weight は joint / part / gesture 単位の `finalWeight` と component `score` として保存する。
- `src/features/gaze/trackingRuntime`
    - MediaPipe fileset、worker client、video frame clock、fallback stats、performance budget report、performance gate を置く。
- `CharacterGaze`
    - FaceDetector による顔位置検出。
    - `chat` mode の注視入力。
    - arrive / leave event と AutoMute 連動。
- `TrackerRuntime`
    - camera track の取得・差し替え・解放。
    - video frame metadata 基準の推論 loop。
    - `requestVideoFrameCallback()` 対応環境では `mediaTime` / `presentationTime` / `expectedDisplayTime` / `presentedFrames` を `TrackerVideoFrameTiming` として callback 第 2 引数へ渡す。
    - `requestVideoFrameCallback()` 非対応環境では `requestAnimationFrame + video.currentTime`、RAF も使えない test / hidden runtime 境界では 5fps timer fallback を使う。fallback の rVFC 固有 field は欠損のままにする。
    - Worker 経路と main-thread fallback。
    - Worker が使える環境では Worker 経路を標準にし、Worker unavailable / 初期化失敗 / Worker detect failure では main-thread fallback へ切り替える。
    - main-thread fallback では effective target を face `<= 8fps`、pose `<= 4fps` に clamp し、`SincroTrackerWorkerStats.budget.degradation.state = "main-thread-low-fps"` として保存する。
    - `SincroTrackerWorkerStats.budget` は `sincro.tracker-performance-budget.v1` の report で、`target`、`observed`、`budgetStatus`、`degradation`、`reasonCodes` を持つ。`observed.clockSource` は `TrackerVideoFrameTiming.source` を使い、欠損値は `undefined` のままにする。
    - `budgetStatus` は Worker round trip と Pose inference cost を対象に、target frame / pose budget の `0.9x` 超を `warn`、`1.25x` 超を `over_budget` とする。
- `SincroFaceTracker`
    - FaceLandmarker から head pose、blendshape、confidence を抽出する。
    - `SincroFaceMotionSnapshot` を出力する。
- `SincroPoseTracker`
    - optional PoseLandmarker から肩、胴体、腕 target を抽出する。
    - 腕 target は通常 retarget 用の `tracked` と IK 用の `quality` / `usableForIk` / `ikWeight` を分けて出力する。
    - PoseLandmarker の `worldLandmarks` は tracker 内で `SincroPoseTargetPointSnapshot.world` へ正規化し、MediaPipe 生座標を controller / VRM 層へ直接渡さない。
    - 3D target は肩基準（腕）または腰基準（下半身）の local target と、VRM rig scale へ変換する前の normalized target に分けて保持する。
    - performance gate により face-only fallback できる。
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
    - 構造化 motion log recording は pose callback / pose fallback callback 起点で canonical upper body state を生成してから `MotionDebugRecorder.recordFrame()` に渡し、TrackerRuntime や tracker worker には canonical 生成、DOM / download / UI の責務を持たせない。
    - 構造化 motion log replay は `MotionReplayPlayer` が plain NDJSON を parse し、`pose-snapshot` mode では `frame.poseSnapshot` を後段の behavior / retarget 経路へ再投入する。`frame.canonical` がある場合は saved canonical を viewer / snapshot の正本にし、無い場合だけ live fallback の canonical を使う。invalid canonical は replay failure にせず、canonical layer の parse error summary として表示する。
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

- `SincroFaceMotionSnapshot`
    - detected
    - confidence
    - headPose
    - blendshapes
    - inferenceTimeMs
    - inferenceFps
    - fallbackReason
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
    - MediaPipe raw result は必要な場合も `frame.mediapipe` に分け、`frame.poseSnapshot` には `SincroPoseMotionSnapshot` 相当の normalized data を置く。
    - replay API の `loadRecording()` は plain NDJSON `string` または `File` だけを受け付ける。`startReplay({ mode })`、`stepReplay(frameIndex)`、`stopReplay()`、`getReplayState()` は developer-only の window API として公開する。
    - `frame.timestamp.mediaTimeMs` は tracker callback の `TrackerVideoFrameTiming.mediaTimeMs` を正本にする。fallback 時だけ `video.currentTime * 1000` を使う。
    - callback 受信時の `performance.now()` は `frame.metrics.receivedAtPerformanceMs` として保存する。tracker stats は `frame.metrics.tracker` に入れ、`timestamp.receivedAtPerformanceMs` や top-level `tracker` は使わない。
    - tracker performance budget は `frame.metrics.tracker.budget` に保存する。`reasonCodes` は dropped frame、Worker pending detect、Worker failure / unavailable、pose repeated failures、pose inference too slow、main-thread fallback を enum として保持し、既存 `fallbackReason` の文字列は互換のため変更しない。
    - 同一 `presentedFrames` と同一 `SincroPoseMotionSnapshot.lastUpdatedAtMs` の連続入力は duplicate frame として recorder が捨てる。`presentedFrames` が無い fallback / legacy 入力では、同一 `mediaTimeMs` と同一 `lastUpdatedAtMs` を duplicate とする。
    - camera 実設定を manifest に残す場合、raw `deviceId` / `groupId` は保存しない。hash を保存する場合も export 単位だけで比較可能にし、export をまたいで安定する識別子を残さない。
    - frame ごとの camera quality は `frame.metrics.cameraQuality` に保存する。top-level `cameraQuality` は schema 外とし、manifest の camera settings と同じく raw device identifier は持たない。
    - exported NDJSON は `parseMotionDebugLogLines()` が manifest と frame records を validation できる schema に固定する。
- motion metrics input boundary
    - `trackingLossDurationMs` は `frame.poseSnapshot.detected`、`degradedToFaceOnly`、`frame.timestamp.mediaTimeMs` を入力境界とし、lost / degraded の連続区間を timestamp 差分で合計する。
    - `sideSwapCount` は `frame.poseSnapshot.leftArm.targets.wrist.cameraX` / `rightArm.targets.wrist.cameraX` と両 wrist の `confidence > 0.5` を入力境界とし、低 confidence の frame では左右反転を数えない。
    - `addedLatencyMs` は `frame.metrics.tracker.workerRoundTripMs` の p95 を入力境界とする。`frame.timestamp.mediaTimeMs` と `frame.metrics.receivedAtPerformanceMs` は時刻原点が異なるため、latency metric では差分を取らない。
    - `recoveryJumpAngleDeg` は lost / degraded から recovered へ戻った frame の `mediaTimeMs` を起点に、500ms window の `frame.applied.angularVelocityDegPerSec` を優先し、欠落時だけ `frame.solver.poseRetarget` の arm quaternion 連続差分へ fallback する。
- `SincroPoseRetargetedArm.constraint`
    - `reasons`: solver-side safety の発火理由。入力欠損とは分けて、joint limit / pole stabilization / collision avoidance を表示する。
    - `weightScale`: constraint / collision による IK weight 減衰率。最終 IK weight は target confidence 由来 weight とこの値を掛けたものになる。
    - `targetPushDistance`: head sphere / chest ellipsoid から hand target を押し戻した距離。forearm segment の no-go zone 検出だけでは 0 のままになり得る。

## Failure Modes

- MediaPipe model / wasm 配置漏れ:
    - tracking を無効化し、UI / Debug Console に理由を表示する。
- Worker 初期化失敗:
    - main-thread tracker へ fallback し、effective target を face `<= 8fps`、pose `<= 4fps` に clamp する。
    - `degradation.state` は `"main-thread-low-fps"`、reason code は `main_thread_fallback` とし、Worker unavailable / failure は `reasonCodes` で切り分ける。
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
