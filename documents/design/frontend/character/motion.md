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
    - `calibration` は default / initial / online / replay の snapshot とし、未実装時も `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` を保存して replay の決定性を保つ。
    - `SincroPoseRetargetFrame` の VRM additive rotation、IK solver の quaternion、AnimationMixer 出力は canonical arm feature の入力にも canonical state にも入れず、retarget / final pose の別 slot に分ける。
- `motion-debug` snapshot
    - `pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、camera readiness、render fps をまとめて返す。
    - 既存 field 名は維持し、optional `viewer` field に viewer mode、selected layer、layer status / value、recording、replay、metrics summary を追加する。
    - Playwright からの調整値変更は UI control と同じ retarget config に反映し、画面 snapshot と window API の観測値を揃える。
    - 複数 VRM の IK 検証では `motion-debug/?vrm=/characters/<file>.vrm` を使い、同じ camera / tracker / retarget 経路で model 差分を確認する。
- motion evaluation log
    - developer 向け評価ログの schema は `src/character/motionEvaluation/motionDebugLogSchema.ts` を正本とする。
    - schema version は `sincro.motion-debug-log.v1` とし、NDJSON の 1 行目を manifest record、2 行目以降を frame record として保存する。
    - recorder core は `src/character/motionEvaluation/motionDebugRecorder.ts` に置き、manifest / frame validation、dedupe、maxDuration / maxFrames stop、NDJSON / Blob export を DOM 非依存で扱う。
    - replay / metrics が読む正規化 pose snapshot の保存先は `frame.poseSnapshot` に固定し、MediaPipe raw result や solver 出力とは別 slot に分ける。
    - replay は `frame.timestamp.mediaTimeMs` を正本時刻として使い、autoplay の順序と手動 step の対象 frame を `performance.now()` へ依存させない。
    - frame は pose callback / pose fallback callback 起点で記録し、render loop は recording state 表示だけを更新する。
    - v1 frame は最低限 `frame.timestamp.mediaTimeMs`、`frame.video.width`、`frame.video.height`、`frame.poseSnapshot`、`frame.solver.poseRetarget`、`frame.solver.poseRetargetRuntime`、`frame.metrics.receivedAtPerformanceMs`、`frame.metrics.tracker` を保存する。`timestamp.receivedAtPerformanceMs` や top-level `tracker` は schema 外なので追加しない。
    - camera の `deviceId` / `groupId` は raw 値を保存しない。保存が必要になった場合も export 単位の salt で hash し、cross-export stable hash を残さない。
    - `MediaStreamTrack.getSettings()` 由来の camera settings は `MotionDebugApp` で scrub してから manifest へ渡し、recorder core は scrub 済み manifest を strict schema で検証する。
- motion metrics
    - metrics core は `src/character/motionEvaluation/motionMetrics.ts` を正本とし、`SincroMotionDebugFrame[]` と `MotionMetricConfig` だけを読む pure function とする。
    - summary schema は `sincro.motion-metrics.v1` とし、`neutralJitter`、`elbowFlipCount`、`recoveryJumpAngleDeg`、`angularVelocitySpikeCount`、`reachClampOccupancy`、`trackingLossDurationMs`、`sideSwapCount`、`addedLatencyMs` を固定 key とする。
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
