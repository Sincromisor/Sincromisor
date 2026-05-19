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
    - `window.__SINCRO_MOTION_DEBUG__` から `startCamera()`、`loadVideoFixture()`、`setRetargetConfig()`、`waitForPoseDetected()`、`getSnapshot()`、`captureFrame()` を呼べる。
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
- `motion-debug` snapshot
    - `pose`、`tracker`、`poseRetarget`、`poseRetargetRuntime`、camera readiness、render fps をまとめて返す。
    - Playwright からの調整値変更は UI control と同じ retarget config に反映し、画面 snapshot と window API の観測値を揃える。

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
