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
    - motion-debug log schema、Phase 6 solver / Phase 7 profile-calibration / Phase 9 semantic-motion / finalPose snapshot parser、replay metrics、baseline parser を置く。
- `src/character/reliability`
    - `ReliabilityMap` v1 を置き、Pose / Hand / Face / ROI / camera quality 由来の観測品質を developer-visible snapshot として保存する。
    - Phase 8 では Hand / Face 入力がある frame の head / hand / finger reliability を埋める。Gesture reliability は placeholder のまま維持し、Phase 9 の MotionIntent estimator が temporal / reliability / hand / optional gesture observation から semantic intent を推定する。
- `src/character/motionIntent`
    - `MotionIntentState` v1 を置き、temporal / reliability / hand / gesture の後段で左右腕と torso の motion intent を保存可能な developer-visible contract として表す。
    - `schemaVersion` は `sincro.motion-intent.v1` に固定し、Gesture Recognizer の raw label は `sourceGestureLabel` に閉じて `intent` enum へ混ぜない。
    - `createSemanticMotionPoseLayer()` は `MotionIntentState` と完成版 `AvatarMotionProfile` から `semantic` pose layer を作る helper であり、preset id、partial arm override、debug snapshot を developer-only に観測できるようにする。本番の VRM bone 書き込み順序は変更しない。
    - `createFingerCurlPoseLayer()` は `SincroHandMotionSnapshot` と `MotionIntentState`、完成版 `AvatarMotionProfile` から finger curl 用の `semantic` pose layer を作る helper である。入力は低次元 hand feature と profile capability に限定し、MediaPipe raw landmark、VRM Object3D、raw bone node は読まない。
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
- Reliability / Debug Replay
    - motion-debug は live snapshot と `frame.reliability` に `ReliabilityMap` を保存し、saved reliability を replay viewer の正本にする。
    - `MotionDebugSnapshot.hand` / `frame.hand` は Hand snapshot の debug / replay 用 optional slot であり、raw landmarks や crop object は含めない。
    - `frame.metrics.tracker.roi` は Hand / Face ROI の pause state、fallback count、skip count、over-budget count、reason code を保存する debug / replay 用 optional stats である。full-frame Face / Pose の既存 cadence と budget target / observed shape は維持する。
    - 旧 log に `frame.reliability` が無い場合だけ pose snapshot 由来の pose-only placeholder reliability を fallback 表示し、保存されていない Hand / Face 観測は再構成しない。
    - `frame.intent` は MotionIntent v1 の optional slot として保存する。replay viewer は saved `frame.intent` を `parseMotionIntentState()` で検証し、欠損を `not_recorded`、schema 違反を `invalid` として表示するが、旧 log 互換のため log load 全体では strict validation しない。`pose-snapshot` replay の live snapshot には pipeline 再実行結果としての latest intent を別に出し、saved intent で estimator state は上書きしない。
- IK / Pose Composer
    - `SincroArmIkSolver` は腕 IK quaternion と constraint reason を返す。
    - `VrmPoseComposer` は fallback / tracking / semantic / idle / style layer から normalized local pose と `ownedBones` を作る。semantic layer は `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`soft_clap_like`、`lost_to_comfort` の preset id を持ち、upperArm / lowerArm / hand 相当の partial override に限定する。
    - finger curl semantic layer は arm semantic preset とは別に `finger-curl:<side>` として作る。finger group は `thumb`、`index`、`middle`、`ringLittle` に固定し、`ring` / `little` は同じ group curl を使う。curl distribution は `AvatarMotionProfile.fingers.curlDistribution` を正本にし、欠損 finger chain は存在 bone の weight だけを正規化して fallback する。
    - finger quaternion は curl local `+X`、splay local `+Z`、thumb oppose local `+Y` の低次元 mapping から作り、左右の splay / oppose 符号だけを反転する。raw landmark から per-finger 3D rotation を直接作らず、layer / debug には plain quaternion object だけを保存する。
    - authored clip や AnimationMixer を使う場合も staging に留め、composer へ渡す最終表現は `semantic` pose delta とする。
    - motion-debug は `frame.solver.phase6` に Phase 6 solver snapshot、`frame.solver.phase7` に Phase 7 の完成版 `AvatarMotionProfile` / calibration snapshot、`frame.solver.phase9` に Phase 9 semantic / finger debug snapshot、`frame.finalPose` に composer result を保存・表示する。本番の `VRMCharacterManager.update()` の bone 書き込み順序はまだ全面移行しない。
    - production dry-run は semantic / finger application stage で、保存済み `MotionIntentState`、低次元 Hand snapshot、完成版 `AvatarMotionProfile` が valid な frame だけ semantic pose / finger curl layer を composer input へ追加する。`composerSemanticFingerApplicationMode` は developer rollback flag であり、raw landmark、Gesture Recognizer raw result、VRM Object3D、raw bone node は layer 生成入力にしない。
    - full normalized pose application stage では `fullNormalizedPoseApplicationMode="upper_body"` の時だけ、同一 frame の available dry-run `finalPose` を `VRMCharacterManager.update()` から `vrm.humanoid.setNormalizedPose(finalPose)` へ 1 回渡す。full stage が所有する upper body / finger bone は毎 frame identity quaternion で埋め、`finalPose` 欠損 bone に前 frame の finger pose を残さない。unavailable / invalid / missing profile / result 欠損では stale finalPose を使わず、前回 full 適用済みなら所有 bone を identity に戻してから arm / torso / shoulder / semantic / finger の段階別 path へ rollback する。head / neck / leg / expression は composer 所有に含めない。
    - motion metrics は saved `frame.intent` から `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount` を計算する。invalid intent は `intentInvalidFrameCount` だけに数え、他の Phase 9 metrics では valid intent sample が無い場合 `not_available` にする。
    - 完成版 `AvatarMotionProfile` は `VRMScene.getAvatarMotionProfile()` / `VRMCharacterManager.getAvatarMotionProfile()` から debug 用 clone として公開する。Debug Console と Phase 6 snapshot の `avatarMotionProfile` は `MinimalAvatarMotionProfile` のまま維持する。

## 本番組み込み段階

roadmap で検証した motion pipeline は、現在設計では次の順に本番組み込みへ進める。各段階の entry / exit criteria、required artifacts、required metrics status、required manual verification、rollback condition は [motion.md](motion.md) を正本にし、Hand / Face ROI、degradation、camera quality が gate に与える条件は [tracking.md](tracking.md) を正本にする。

```text
roadmap / research
  -> observe-only pipeline
  -> production composer dry-run
  -> arm application flag
  -> torso / shoulder migration
  -> semantic / finger application
  -> full setNormalizedPose(finalPose) application
```

段階を飛ばして `VRMCharacterManager.update()` の書き込み順序を全面移行しない。metric が pass でも、複数 VRM の手動確認、degradation / ROI / camera quality の説明 artifact、rollback 条件が揃うまで次段の production flag は開けない。

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
