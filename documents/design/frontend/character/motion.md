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

## Change Checklist

- 新しい motion を追加する時は、どの talk mode で有効かを先に決める。
- 複数 controller が同時に最大値を出さないよう、orchestrator で motion policy を調整する。
- 欠損 bone / expression は無効化または近い bone への fallback にする。
- Debug Console で切り分けたい値は snapshot / retarget frame に載せる。

## References

- `documents/design/frontend/character/overview.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
