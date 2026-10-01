# フロントエンドのキャラクター概要

## 要約

- キャラクター層はThree.js + `@pixiv/three-vrm`でVRM 1.0を読み込み、描画・表情・骨制御を行う。
- `chat`は対話相手を見る会話モード、`sincro`はユーザーの顔・姿勢を動作へ変換する同期モードとして扱う。
- MediaPipeの生結果は制御処理へ直接渡さず、追跡スナップショットと動作の変換処理を挟む。

## 対象範囲

- 対象
    - VRMシーン / キャラクター管理処理
    - 顔 / 動作 / 追跡の大枠
    - 会話モードによる責務分離
- 非対象
    - RTC送受信データの詳細
    - バックエンドのテロップ生成

## 責務

- `src/character/scene`
    - VRMシーン、カメラ、照明を置く。ページ起動処理は `src/app/bootstrap`が所有する。
- `src/character/runtime/sincroMotionComputation.ts`
    - 共通表現生成と時系列・意図推定の共通手順を持つ。本番の観測蓄積と公開要約は `SincroMotionObserveOnlyPipeline`に残し、Pose以外の観測更新では状態付き推定を進めない。
- `src/character/behavior`
    - 会話、VAD、視線、表情、まばたきなどの振る舞い状態と制御処理を置く。
- `src/character/retargeting`
    - 顔 / 姿勢追跡スナップショットからVRM向けの動作値へ変換する処理を置く。
- `src/character/ik`
    - 腕IKソルバー、幾何計算、制約、疎通確認を置く。
- [`sincroVrmPoseComposer.ts`](../../../../sincromisor-frontend/src/character/runtime/sincroVrmPoseComposer.ts)
    - `SincroVrmPoseComposerService`が本番へ適用する最終姿勢を計算し、前回姿勢と指の保持状態を管理する。VRMへの書き込みは `VRMCharacterManager`から `normalizedPoseWriter`へ委ねる。保存・診断キー `composerDryRun`は維持する。
- `src/character/vrmPose`
    - VRM正規化済みローカル姿勢、`VrmPoseComposer`、所有するボーン / 値の制限 / 警告の姿勢合成処理契約を置く。
- `src/character/lookingGlass` / `src/character/vrm360`
    - Looking Glass / VRM360固有シーン実行時を置く。アプリ開始・設定接続は `src/app/bootstrap`の共通手順で行う。
- `src/character/vrmCharacter`
    - VRMキャラクター管理処理と動作制御処理のうち、振る舞い / 動作の変換 / IKに属さないVRM適用処理を置く。
- `src/character/motionEvaluation`
    - motion-debugログスキーマ、段階6ソルバー / 段階7 profile-calibration / 段階9 semantic-motion / finalPoseスナップショット解析処理、再生指標、基準解析処理を置く。
- `src/character/reliability`
    - `ReliabilityMap` v1を置き、Pose / Hand / Face / ROI / カメラ品質由来の観測品質を開発者が確認できるスナップショットとして保存する。
    - 段階8ではHand / Face入力があるフレームの頭部 / 手 / 指信頼性を埋める。ジェスチャー信頼性は仮の値のまま維持し、段階9のMotionIntent推定処理が時系列 / 信頼性 / 手 / 任意ジェスチャー観測値から意味に基づく動作意図を推定する。
- `src/character/motionIntent`
    - `MotionIntentState` v1を置き、時系列 / 信頼性 / 手 / ジェスチャーの後段で左右腕と体幹の動作意図を保存可能な開発者が確認できる契約として表す。
    - `schemaVersion`は `sincro.motion-intent.v1`に固定し、ジェスチャーRecognizerの元のラベルは `sourceGestureLabel`に閉じて `intent`列挙値へ混ぜない。
    - `createSemanticMotionPoseLayer()`は `MotionIntentState`と完成版 `AvatarMotionProfile`から `semantic`姿勢レイヤーを作る補助処理であり、プリセットID、暫定腕上書き、診断用スナップショットを開発者専用に観測できるようにする。本番のVRMボーン書き込み順序は変更しない。
    - `createFingerCurlPoseLayer()`は `SincroHandMotionSnapshot`と `MotionIntentState`、完成版 `AvatarMotionProfile`から指の曲げ用の `semantic`姿勢レイヤーを作る補助処理である。入力は低次元手特徴量とプロファイル対応能力に限定し、MediaPipe未加工のランドマーク、VRM Object3D、元のボーンノードは読まない。
- `VRMScene`
    - 描画処理、カメラ、照明、サイズ変更、描画ループを持つ。
- `VRMCharacterManager`
    - VRM読み込み、制御処理初期化、毎フレーム更新を持つ。表情ログは任意の `onEmotionLog`を表情制御へ渡し、アプリとmotion-debugの入口が既存テキストログへ接続する。
    - ページ初期化処理はアプリの姿勢設定窓口を使い、生成済みシーンへ正規化後の設定を適用する。設定の所有と操作通知はアプリ側、motion-debugの明示適用は独立ページ側が担う。
    - 診断は任意の `VRMDiagnostics`コールバックへプロファイル、姿勢変換結果、合成要約、適用注釈付き詳細の順に返す。診断未接続でも姿勢計算・適用は継続し、通常・360度・Looking Glassのアプリ窓口とmotion-debugの入口が診断管理へ接続する。
- [`normalizedPoseWriter.ts`](../../../../sincromisor-frontend/src/character/vrmCharacter/normalizedPoseWriter.ts)
    - 現在フレームの最終姿勢の検査、所有ボーンの欠損補完、VRMへの一括書き込みを担う。管理処理は適用順序と診断への注釈付与を保持する。
- `CharacterBehaviorState`
    - VAD、視線、テキスト / テロップ、AI発話、エラー、会話モードをスナップショット化する。
- `CharacterRootStabilizer`
    - VRM内部更新後に腰の位置と初期回転を復元する。上半身の最終姿勢は姿勢合成処理が一括適用する。
- Motion制御処理
    - 頭部、目、顔、腕、脚、上半身をVRM向け値で更新する。
- Trackers / 動作の変換処理
    - MediaPipe結果を正規化スナップショットへ変換し、VRM向けの動作値へ変換する。
- 信頼性 / 診断Replay
    - motion-debugはライブスナップショットと `frame.reliability`に `ReliabilityMap`を保存し、保存済み信頼性を再生閲覧画面の正本にする。
    - `MotionDebugSnapshot.hand` / `frame.hand`はHandスナップショットのデバッグ / 再生用任意格納先であり、未加工のランドマークや切り抜きオブジェクトは含めない。
    - `frame.metrics.tracker.roi`はHand / Face ROIの一時停止状態、代替処理件数、省略件数、許容時間超過件数、理由コードを保存するデバッグ / 再生用任意統計である。全画面Face / Poseの既存実行頻度と予算目標 / 観測済み構造は維持する。
    - 旧ログに `frame.reliability`が無い場合だけ姿勢スナップショット由来の姿勢のみの仮の値信頼性を代替処理表示し、保存されていないHand / Face観測は再構成しない。
    - `frame.intent`はMotionIntent v1の任意格納先として保存する。再生閲覧画面は保存済み `frame.intent`を `parseMotionIntentState()`で検証し、欠損を `not_recorded`、スキーマ違反を `invalid`として表示するが、旧ログ互換のためログ読み込み全体では厳格に検証しない。`pose-snapshot`再生のライブスナップショットには処理工程再実行結果としての最新意図を別に出し、保存済み意図で推定処理状態は上書きしない。
- IK / 姿勢合成処理
    - `SincroArmIkSolver`は腕IKクォータニオンと制約理由を返す。
    - `VrmPoseComposer`は代替処理 / 追跡 / 意味に基づく動作 / 待機 / 演出層から正規化済みローカル姿勢と `ownedBones`を作る。意味に基づく動作のレイヤーは `small_wave`、`point_forward_or_up`、`thumbs_up_hold`、`peace_hold`、`shy_hand_near_face`、`explain_open_palm`、`soft_clap_like`、`lost_to_comfort`のプリセットIDを持ち、`upperArm` / `lowerArm` / 手相当の部分上書きに限定する。
    - 指の曲げ意味に基づく動作のレイヤーは腕意味に基づく動作のプリセットとは別に `finger-curl:<side>`として作る。指グループは `thumb`、`index`、`middle`、`ringLittle`に固定し、`ring` / `little`は同じグループ曲げを使う。曲げ配分は `AvatarMotionProfile.fingers.curlDistribution`を正本にし、欠損指のボーン列は存在ボーンの重みだけを正規化して代替処理する。
    - 指クォータニオンは曲げローカル `+X`、指の開きローカル `+Z`、親指の対向動作ローカル `+Y`の低次元対応付けから作り、左右の指の開き / 対向動作符号だけを反転する。未加工のランドマークから指ごとの3D回転を直接作らず、層 / デバッグには通常のクォータニオンオブジェクトだけを保存する。
    - 制作済み範囲制限やAnimationMixerを使う場合も準備段階に留め、姿勢合成処理へ渡す最終表現は `semantic`姿勢差分とする。
    - motion-debugは `frame.solver.phase6`に段階6ソルバースナップショット、`frame.solver.phase7`に段階7の完成版 `AvatarMotionProfile` / 較正スナップショット、`frame.solver.phase9`に段階9意味に基づく動作 / 指診断用スナップショット、`frame.finalPose`に姿勢合成処理結果を保存・表示する。本番では合成サービスが計算した同一フレームの最終姿勢を上半身へ一括適用する。
    - 本番の合成サービスは、保存済み `MotionIntentState`、低次元Handスナップショット、完成版 `AvatarMotionProfile`が有効なフレームだけ意味に基づく動作の姿勢 / 指の曲げ層を姿勢合成処理入力へ追加する。`composerSemanticFingerApplicationMode`は開発者切り戻しフラグであり、未加工のランドマーク、ジェスチャーRecognizer未加工の結果、VRM Object3D、元のボーンノードは層生成入力にしない。
    - 正規化済み姿勢の全面適用段階は本番の常時パスであり、同一フレームの利用可能な合成結果 `finalPose`を `VRMCharacterManager.update()`から `normalizedPoseWriter`を介して `vrm.humanoid.setNormalizedPose()`へ1回渡す。追跡フレームの `active`が `false`の場合、代替処理層は体幹 / 肩を単位回転、`upperArm` / `lowerArm` / 手を腕を下ろした `CHARACTER_ARM_REST_POSE`にする。全面段階が所有するその他の欠損ボーンは毎フレーム単位クォータニオンで埋め、前フレームの指姿勢を残さない。利用不可 / 無効 / 欠損プロファイル / 結果欠損では古くなったfinalPoseを使わず、腕 / 体幹 / 肩の旧段階別の切り戻し書き込み処理も本番代替処理として実行しない。利用不可理由は診断Console要約 / 指標用の観測情報として残す。頭部 / 首 / 脚 / 表情は姿勢合成処理の所有対象に含めず、従来制御処理で更新する。`composerSemanticFingerApplicationMode`は意味に基づく動作 / 指抑制を切り分ける開発者切り戻しフラグとして残す。
    - 動作指標は保存済み `frame.intent`から `gestureFlickerCount`、`semanticFallbackFrameCount`、`intentCooldownSuppressionCount`、`intentInvalidFrameCount`を計算する。無効意図は `intentInvalidFrameCount`だけに数え、他の段階9指標では有効意図サンプルが無い場合 `not_available`にする。
    - 保存契約は `avatarMotionProfileTypes.ts`、保存検証は `avatarMotionProfileSchema.ts`、共有複製と最小プロファイルへの変換は `avatarMotionProfileClone.ts`が担う。保存検証はVRM計測を読み込まず、既存の版・厳密なキー検証・数値範囲・エラー分類を維持する。
    - `avatarMotionProfileMeasurement.ts`がVRMのボーン・寸法・初期回転を計測し、通常データと警告を返す。`avatarMotionProfile.ts`は計測結果から既定値・対応能力・リスク値を組み立てる。`SincroPoseRetargeter.attachVrm()`で計測、組み立て、IK初期化の順に実行する。
    - 完成版 `AvatarMotionProfile`は `VRMScene.getAvatarMotionProfile()` / `VRMCharacterManager.getAvatarMotionProfile()`からデバッグ用複製として公開する。診断Consoleと段階6スナップショットの `avatarMotionProfile`は `MinimalAvatarMotionProfile`のまま維持する。

## 本番組み込み段階

取り組み計画で検証した動作処理工程は、現在設計では次の順に本番組み込みへ進める。各段階の開始・完了条件、必須成果物、必須指標の状態、必須の手動確認、切り戻し条件は [motion.md](motion.md) を正本にし、Hand / Face ROI、機能低下、カメラ品質が検査に与える条件は [tracking.md](tracking.md) を正本にする。

```text
ロードマップ / 調査
  -> 観測専用の処理工程
  -> 本番の姿勢合成
  -> 意味に基づく動作 / 指の適用
  -> setNormalizedPose(finalPose) による全面適用
```

旧腕適用処理と体幹 / 肩移行の段階別の切り戻しパスは後始末済みであり、現行本番実行時では全面 `setNormalizedPose(finalPose)`適用が唯一の上半身の最終姿勢を書き込む処理である。指標が合格でも、複数VRMの手動確認、機能低下 / ROI / カメラ品質の説明成果物、意味に基づく動作 / 指切り戻し条件は継続して記録する。

## 会話モードの責務境界

| 観点     | `chat`                             | `sincro`                                                  |
| -------- | ---------------------------------- | --------------------------------------------------------- |
| 目的     | 対話相手を見る                     | ユーザーの顔・姿勢をまねる                                |
| 主入力   | `CharacterGaze`                    | `faceMotion`, 任意 `poseMotion`                           |
| 口形     | `telop_ch`のモーラ / 母音          | AI発話中はモーラ / 母音、それ以外はユーザー口形動作の変換 |
| 動作     | 待機、聞き姿勢、AI発話ジェスチャー | 動作の変換優先、ジェスチャーは抑制                        |
| 代替処理 | 顔未検出時は中立 / カメラ方向      | 信頼度低下時は中立 / 顔のみ                               |

## 変更時の確認

- 動作方針を変える場合は `motion.md`を確認する。
- MediaPipe / 追跡処理を変える場合は `tracking.md`を確認する。
- テロップ / モーラ契約を変える場合は `contracts/frontend-rtc.md`を確認する。
- VRM個体差により欠損するボーン / 表情は例外停止ではなく代替処理する。

## 参照

- `documents/design/frontend/character/motion.md`
- `documents/design/frontend/character/tracking.md`
- `documents/design/contracts/frontend-rtc.md`
- `documents/design/archive/legacy-flat/frontend_character.md`
