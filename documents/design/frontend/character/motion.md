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
- `SincroArmIkSolver`
    - VRM normalized arm chain の neutral quaternion、腕長、肩幅、pole 方向をロード時に測定する。
    - 肩相対の wrist target と elbow pole target から upper/lower arm の local quaternion を返す。
    - 到達不能 target は腕長内へ clamp し、neutral からの最大角で急な反転を抑える。
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
    - `solverProbe.ccdik` は external solver 採用判断用の診断値であり、実際の腕姿勢には適用しない。

## IK Solver Policy

- 本流:
    - 自前 3D two-bone IK を維持し、`@pixiv/three-vrm` normalized bones に local quaternion を適用する。
    - 理由は ADR-260517 に記録する。
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
