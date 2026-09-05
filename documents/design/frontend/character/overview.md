# フロントエンドのキャラクター概要

## 要約

- キャラクター層は Three.js + `@pixiv/three-vrm` で VRM 1.0 を読み込み、描画・表情・骨制御を行う。
- `chat` は対話相手を見る会話モード、`sincro` はユーザーの顔・姿勢を動作へ変換する同期モードとして扱う。
- MediaPipe の生結果は制御処理へ直接渡さず、追跡スナップショットと動作の変換処理を挟む。

## 対象範囲

- 対象:
    - VRM シーン / キャラクター管理処理
    - 顔 / 動作 / 追跡の大枠
    - 会話モードによる責務分離
- 非対象:
    - RTC 送受信データの詳細
    - バックエンドのテロップ生成

## 責務

- `src/character/scene`
    - VRM シーン、カメラ、照明、通常 VRM 初期化処理を置く。
- `src/character/behavior`
    - 会話、VAD、視線、表情、視線、まばたきなどの振る舞い状態と制御処理を置く。
- `src/character/retargeting`
    - 顔 / 姿勢追跡スナップショットから VRM 向け動作値へ変換する処理を置く。
- `src/character/ik`
    - 腕 IK ソルバー、幾何計算、制約、疎通確認を置く。
- `src/character/vrmPose`
    - VRM 正規化済みローカル姿勢、`VrmPoseComposer`、所有するボーン / 値の制限 / 警告の姿勢合成処理契約を置く。
- `src/character/lookingGlass` / `src/character/vrm360`
    - Looking Glass / VRM360 固有シーン実行時と初期化処理を置く。
- `src/character/vrmCharacter`
    - VRM キャラクター管理処理と動作制御処理のうち、振る舞い / 動作の変換 / IK に属さない VRM 適用処理を置く。
- `src/character/motionEvaluation`
    - motion-debug ログスキーマ、段階 6 ソルバー / 段階 7 profile-calibration / 段階 9 semantic-motion / finalPose スナップショット解析処理、再生指標、基準解析処理を置く。
- `src/character/reliability`
    - `ReliabilityMap` v1 を置き、Pose / Hand / Face / ROI / カメラ品質由来の観測品質を開発者が確認できるスナップショットとして保存する。
    - 段階 8 では Hand / Face 入力があるフレームの頭部 / 手 / 指信頼性を埋める。ジェスチャー信頼性は仮の値のまま維持し、段階 9 の MotionIntent 推定処理が時系列 / 信頼性 / 手 / 任意ジェスチャー観測値から意味に基づく動作意図を推定する。
- `src/character/motionIntent`
    - `MotionIntentState` v1 を置き、時系列 / 信頼性 / 手 / ジェスチャーの後段で左右腕と体幹の動作意図を保存可能な開発者が確認できる契約として表す。
    - `schemaVersion` は `sincro.motion-intent.v1` に固定し、ジェスチャー Recognizer の元のラベルは `sourceGestureLabel` に閉じて `intent` 列挙値へ混ぜない。
    - `createSemanticMotionPoseLayer()` は `MotionIntentState` と完成版 `AvatarMotionProfile` から `semantic` 姿勢レイヤーを作る補助処理であり、プリセット ID、暫定腕上書き、診断用スナップショットを開発者専用に観測できるようにする。本番の VRM ボーン書き込み順序は変更しない。
    - `createFingerCurlPoseLayer()` は `SincroHandMotionSnapshot` と `MotionIntentState`、完成版 `AvatarMotionProfile` から指の曲げ用の `semantic` 姿勢レイヤーを作る補助処理である。入力は低次元手特徴量とプロファイル対応能力に限定し、MediaPipe 未加工のランドマーク、VRM Object3D、元のボーンノードは読まない。
- `VRMScene`
    - 描画処理、カメラ、照明、サイズ変更、描画ループを持つ。
- `VRMCharacterManager`
    - VRM 読み込み、制御処理初期化、毎フレーム更新を持つ。
- `CharacterBehaviorState`
    - VAD、視線、テキスト / テロップ、AI 発話、エラー、会話モードをスナップショット化する。
- Motion 制御処理
    - 頭部、目、顔、腕、脚、上半身を VRM 向け値で更新する。
- Trackers / 動作の変換処理
    - MediaPipe 結果を正規化スナップショットへ変換し、VRM 向け値へ動作へ変換する。
- 信頼性 / 診断 Replay
    - motion-debug はライブスナップショットと `frame.reliability` に `ReliabilityMap` を保存し、保存済み信頼性を再生閲覧画面の正本にする。
    - `MotionDebugSnapshot.hand` / `frame.hand` は Hand スナップショットのデバッグ / 再生用任意格納先であり、未加工のランドマークや切り抜きオブジェクトは含めない。
    - `frame.metrics.tracker.roi` は Hand / Face ROI の一時停止状態、代替処理件数、省略件数、許容時間超過件数、理由コードを保存するデバッグ / 再生用任意統計である。全画面 Face / Pose の既存実行頻度と予算目標 / 観測済み構造は維持する。
    - 旧ログに `frame.reliability` が無い場合だけ姿勢スナップショット由来の姿勢のみの仮の値信頼性を代替処理表示し、保存されていない Hand / Face 観測は再構成しない。
    - `frame.intent` は MotionIntent v1 の任意格納先として保存する。再生閲覧画面は保存済み `frame.intent` を `parseMotionIntentState()` で検証し、欠損を `not_recorded`、スキーマ違反を `invalid` として表示するが、旧ログ互換のためログ読み込み全体では厳格な検査検証しない。`pose-snapshot` 再生のライブスナップショットには処理工程再実行結果としての最新意図を別に出し、保存済み意図で推定処理状態は上書きしない。
- IK / 姿勢合成処理
    - `SincroArmIkSolver` は腕 IK クォータニオンと制約理由を返す。
    - `VrmPoseComposer` は代替処理 / 追跡 / 意味に基づく動作 / 待機 / 演出層から正規化済みローカル姿勢と `ownedBones` を作る。意味に基づく動作のレイヤーは `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`soft_clap_like`、`lost_to_comfort` のプリセット ID を持ち、`upperArm` / `lowerArm` / 手相当の部分上書きに限定する。
    - 指の曲げ意味に基づく動作のレイヤーは腕意味に基づく動作のプリセットとは別に `finger-curl:<side>` として作る。指グループは `thumb`、`index`、`middle`、`ringLittle` に固定し、`ring` / `little` は同じグループ曲げを使う。曲げ配分は `AvatarMotionProfile.fingers.curlDistribution` を正本にし、欠損指のボーン列は存在ボーンの重みだけを正規化して代替処理する。
    - 指クォータニオンは曲げローカル `+X`、指の開きローカル `+Z`、親指の対向動作ローカル `+Y` の低次元対応付けから作り、左右の指の開き / 対向動作符号だけを反転する。未加工のランドマークから指ごとの 3D 回転を直接作らず、層 / デバッグには通常のクォータニオンオブジェクトだけを保存する。
    - 制作済み範囲制限や AnimationMixer を使う場合も準備段階に留め、姿勢合成処理へ渡す最終表現は `semantic` 姿勢差分とする。
    - motion-debug は `frame.solver.phase6` に段階 6 ソルバースナップショット、`frame.solver.phase7` に段階 7 の完成版 `AvatarMotionProfile` / 較正スナップショット、`frame.solver.phase9` に段階 9 意味に基づく動作 / 指診断用スナップショット、`frame.finalPose` に姿勢合成処理結果を保存・表示する。本番の `VRMCharacterManager.update()` のボーン書き込み順序はまだ全面移行しない。
    - 本番試行は意味に基づく動作・指の適用段階で、保存済み `MotionIntentState`、低次元 Hand スナップショット、完成版 `AvatarMotionProfile` が有効なフレームだけ意味に基づく動作の姿勢 / 指の曲げ層を姿勢合成処理入力へ追加する。`composerSemanticFingerApplicationMode` は開発者切り戻しフラグであり、未加工のランドマーク、ジェスチャー Recognizer 未加工の結果、VRM Object3D、元のボーンノードは層生成入力にしない。
    - 正規化済み姿勢の全面適用段階は本番の常時パスであり、同一フレームの利用可能試行 `finalPose` を `VRMCharacterManager.update()` から `vrm.humanoid.setNormalizedPose(finalPose)` へ 1 回渡す。追跡フレームの `active` が `false` の場合、代替処理層は体幹 / 肩を単位回転、`upperArm` / `lowerArm` / 手を腕を下ろした `CHARACTER_ARM_REST_POSE` にする。全面段階が所有するその他の欠損ボーンは毎フレーム単位クォータニオンで埋め、前フレームの指姿勢を残さない。利用不可 / 無効 / 欠損プロファイル / 結果欠損では古くなった finalPose を使わず、腕 / 体幹 / 肩の旧段階別の切り戻し書き込み処理も本番代替処理として実行しない。利用不可理由は診断 Console 要約 / 指標用の観測情報として残す。頭部 / 首 / 脚 / 表情は姿勢合成処理所有に含めず、従来制御処理で更新する。`composerSemanticFingerApplicationMode` は意味に基づく動作 / 指抑制を切り分ける開発者切り戻しフラグとして残す。
    - 動作指標は保存済み `frame.intent` から `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount` を計算する。無効意図は `intentInvalidFrameCount` だけに数え、他の段階 9 指標では有効意図サンプルが無い場合 `not_available` にする。
    - 完成版 `AvatarMotionProfile` は `VRMScene.getAvatarMotionProfile()` / `VRMCharacterManager.getAvatarMotionProfile()` からデバッグ用複製として公開する。診断 Console と段階 6 スナップショットの `avatarMotionProfile` は `MinimalAvatarMotionProfile` のまま維持する。

## 本番組み込み段階

取り組み計画で検証した動作処理工程は、現在設計では次の順に本番組み込みへ進める。各段階の開始・完了条件、必須成果物、必須指標の状態、必須の手動確認、切り戻し条件は [motion.md](motion.md) を正本にし、Hand / Face ROI、機能低下、カメラ品質が検査に与える条件は [tracking.md](tracking.md) を正本にする。

```text
ロードマップ / 調査
  -> 観測専用の処理工程
  -> 本番姿勢合成の試行
  -> 意味に基づく動作 / 指の適用
  -> setNormalizedPose(finalPose) による全面適用
```

旧腕適用と体幹 / 肩移行の段階別の切り戻しパスは後始末済みであり、現行本番実行時では全面 `setNormalizedPose(finalPose)` 適用が唯一の上半身の最終姿勢を書き込む処理である。指標が合格でも、複数 VRM の手動確認、機能低下 / ROI / カメラ品質の説明成果物、意味に基づく動作 / 指切り戻し条件は継続して記録する。

## 会話モードの責務境界

| 観点     | `chat`                              | `sincro`                                                  |
| -------- | ----------------------------------- | --------------------------------------------------------- |
| 目的     | 対話相手を見る                      | ユーザーの顔・姿勢をまねる                                |
| 主入力   | `CharacterGaze`                     | `faceMotion`, 任意 `poseMotion`                           |
| 口形     | `telop_ch` のモーラ / 母音          | AI発話中はモーラ / 母音、それ以外はユーザー口形動作の変換 |
| 動作     | 待機、聞き姿勢、AI 発話ジェスチャー | 動作の変換優先、ジェスチャーは抑制                        |
| 代替処理 | 顔未検出時は中立 / カメラ方向       | 信頼度低下時は中立 / 顔のみ                               |

## 変更時の確認

- 動作方針を変える場合は `motion.md` を確認する。
- MediaPipe / 追跡処理を変える場合は `tracking.md` を確認する。
- テロップ / モーラ契約を変える場合は `contracts/frontend-rtc.md` を確認する。
- VRM 個体差により欠損するボーン / 表情は例外停止ではなく代替処理する。

## 参照

- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
