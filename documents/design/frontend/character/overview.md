# Frontend Character Overview

## Summary

- Character 層は Three.js + `@pixiv/three-vrm` で VRM 1.0 を読み込み、描画・表情・骨制御を行う。
- `chat` は対話相手を見る会話モード、`sincro` はユーザーの顔・姿勢を retarget する同期モードとして扱う。
- MediaPipe の生結果は controller へ直接渡さず、tracking snapshot と retargeter を挟む。

## Scope

- 対象:
    - VRM scene / character manager
    - face / motion / tracking の大枠
    - talk mode による責務分離
- 非対象:
    - RTC payload の詳細
    - backend のテロップ生成

## Responsibilities

- `src/character/scene`
    - VRM scene、camera、light、通常 VRM initializer を置く。
- `src/character/behavior`
    - 会話、VAD、gaze、表情、視線、まばたきなどの振る舞い状態と controller を置く。
- `src/character/retargeting`
    - face / pose tracking snapshot から VRM 向け motion value へ変換する処理を置く。
- `src/character/ik`
    - arm IK solver、geometry、constraint、probe を置く。
- `src/character/vrmPose`
    - VRM normalized local pose、`VrmPoseComposer`、owned bone / clamp / warning の composer contract を置く。
- `src/character/lookingGlass` / `src/character/vrm360`
    - Looking Glass / VRM360 固有 scene runtime と initializer を置く。
- `src/character/vrmCharacter`
    - VRM character manager と motion controller のうち、behavior / retargeting / IK に属さない VRM 適用処理を置く。
- `src/character/motionEvaluation`
    - motion-debug log schema、Phase 6 solver / finalPose snapshot parser、replay metrics、baseline parser を置く。
- `VRMScene`
    - renderer、camera、light、resize、render loop を持つ。
- `VRMCharacterManager`
    - VRM load、controller 初期化、毎 frame update を持つ。
- `CharacterBehaviorState`
    - VAD、gaze、text / telop、AI speech、error、talk mode を snapshot 化する。
- Motion controllers
    - head、eye、face、arm、leg、upper body を VRM 向け値で更新する。
- Trackers / Retargeters
    - MediaPipe 結果を正規化 snapshot へ変換し、VRM 向け値へ retarget する。
- IK / Pose Composer
    - `SincroArmIkSolver` は腕 IK quaternion と constraint reason を返す。
    - `VrmPoseComposer` は tracking / idle / style layer から normalized local pose と `ownedBones` を作る。
    - Phase 6 時点の motion-debug は solver / finalPose snapshot を保存・表示・計測するが、本番の `VRMCharacterManager.update()` の bone 書き込み順序はまだ全面移行しない。

## Talk Mode Boundary

| 観点     | `chat`                             | `sincro`                                |
| -------- | ---------------------------------- | --------------------------------------- |
| 目的     | 対話相手を見る                     | ユーザーの顔・姿勢をまねる              |
| 主入力   | `CharacterGaze`                    | `faceMotion`, optional `poseMotion`     |
| 口形     | `telop_ch` の mora / vowel         | ユーザー口形 retarget 優先              |
| motion   | idle、聞き姿勢、AI speech gesture  | retarget 優先、gesture は抑制           |
| fallback | 顔未検出時は neutral / camera 方向 | confidence 低下時は neutral / face-only |

## Change Checklist

- motion policy を変える場合は `motion.md` を確認する。
- MediaPipe / tracker を変える場合は `tracking.md` を確認する。
- telop / mora 契約を変える場合は `contracts/frontend-rtc.md` を確認する。
- VRM 個体差により欠損する bone / expression は例外停止ではなく fallback する。

## References

- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
