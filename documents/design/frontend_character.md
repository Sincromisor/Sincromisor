# Frontend Character / VRM描画設計

SincromisorフロントエンドのVRMキャラクター描画層（シーン、骨制御、表情制御、顔追従）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/frontend_character.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-05-08
- ステータス: Active

## 2. 目的とスコープ

- 目的: VRMキャラクターの読み込み・描画・表情制御・視線制御の責務とデータフローを明確化する
- 対象範囲:
  - `SincroVRMInitializer` 以降のVRM描画パス
  - `VRMScene` / `VRMCharacterManager` / 各Bone/Face controller
  - `CharacterGaze` と自動ミュート連動
- 非対象範囲:
  - 削除済みの Babylon.js legacy 実装
  - サーバー側音声合成・テロップ生成ロジック
- LLM向け要約（3-5行）:
  - Start後、`VRMScene` が Three.js renderer/camera/light を初期化し、`VRMCharacterManager` がVRMをロードする。
  - `FaceMorphController` は `TalkManager.currentMora()` を参照して母音ごとの口形を駆動する。
  - `FaceEmotionController` は `text_ch` の `ChatMessage.expression_code` を受けて VRM感情プリセットを駆動する。
  - `HeadBoneController` は `CharacterGaze` の鼻座標から首向きを更新し、未検出時はカメラ追従にフォールバックする。
  - `CharacterBehaviorState` は VAD、顔検出、text/telop、感情コードを集約し、後続モーションが同じ snapshot を参照できるようにする。
  - `CharacterMotionOrchestrator` は呼吸・重心移動・肩周りの idle motion を毎フレーム適用し、腕/脚 controller は同じ motion config の時間係数を使って低振幅の手首・肘・足先揺れを足す。
  - `CharacterGaze` は MediaPipe FaceDetector を `public/mediapipe-wasm` から読み込み、検出状態で自動ミュート連動も行う。

## 3. 背景

- 解決したい課題:
  - 低遅延で「話しているように見える」VRMキャラクター表示
  - ユーザーの顔向きに追従した自然なインタラクション
- 現状の問題点:
  - 表情は母音中心で、感情表現や全身モーションは限定的
  - VRMごとに感情プリセットが口形morphを含む場合、口パクとの干渉が起こり得る
- 採用理由:
  - `@pixiv/three-vrm` により VRM 1.0 との互換性が高い
- 制約条件:
  - ブラウザ性能とGPU依存が大きい
  - FaceDetector用のwasm/modelアセット配置が必須

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| VRM | 3D humanoid avatar format。ここでは主に VRM 1.0 を指す |
| Mora | テロップ由来の短い音素単位。口形同期の最小単位として扱う |
| FaceDetector | MediaPipe Tasks Vision の顔検出モデル |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - VRM 1.0 ファイルを読み込み、シーン上に表示できる
  - `telop_ch` 由来の母音情報で口形を時間同期できる
  - 顔検出結果で首の向きを制御できる
  - 顔検出の有無で自動ミュートを切替可能
- 優先度（Must/Should/Could）:
  - Must: VRM読込、描画、口形同期
  - Should: 顔追従、まばたき
  - Could: VR/XRモード、全身モーション拡張

### 5.2 非機能要件

- 性能: 連続アニメーションは `requestAnimationFrame` / renderer loop で更新
- 可用性: モデル未検出時はニュートラル姿勢へ戻す
- スケーラビリティ: クライアント側計算中心でサーバー負荷に依存しない
- セキュリティ: ローカルVRMアップロードを扱うためファイル種別の最低限検証を実施
- 運用性/保守性: 表情・骨制御をクラス分離
- 監視性: DebugConsoleで顔検出座標や状態を可視化

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - シーン: `VRMScene`, `VRMCamera`, `VRMLight`
  - キャラクター: `VRMCharacterManager`
  - 骨制御: `HeadBoneController`, `ArmBoneController`, `LegBoneController`
  - 表情制御: `FaceMorphController`, `EyeBehaviorController`
  - 感情表情制御: `FaceEmotionController`
  - 対話状態集約: `CharacterBehaviorState`
  - 顔認識: `CharacterGaze`
- 責務分割:
  - 読込/更新ループ: `VRMScene` + `VRMCharacterManager`
  - ボーン更新: BoneController群
  - 口形同期: FaceMorphController + TalkManager
  - 目線/まばたき: EyeBehaviorController + CharacterBehaviorSnapshot
  - 感情表情同期: FaceEmotionController + TalkManager(`text_ch`)
  - 対話状態集約: CharacterBehaviorState + TalkManager/UserMediaManager/CharacterGaze
  - 入力検出: CharacterGaze
- 外部依存:
  - `three`, `@pixiv/three-vrm`, `@mediapipe/tasks-vision`
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/frontend_character_flow.drawio` を後続追加

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `VRMScene`: renderer/camera/light初期化、リサイズ追従、描画ループ管理
  - `VRMCharacterManager`: GLTFLoader+VRMLoaderPluginでVRM読込、コントローラ初期化
  - `HeadBoneController`: `CharacterBehaviorSnapshot.gaze` またはCamera方向に首回転を更新。目線が先行するよう、顔検出座標へ遅めに追従する
  - `FaceMorphController`: `aa/ih/ou/ee/oh` のExpression制御
  - `FaceEmotionController`: `ChatMessage.expression_code` を `relaxed/happy/sad/angry/surprised` にマップし、短時間アニメーションで適用
  - `EyeBehaviorController`: VRM標準 `lookLeft/lookRight/lookUp/lookDown` expression を優先して目線を制御し、未実装モデルでは `leftEye/rightEye` ボーンへフォールバックする。対話状態に応じたblink schedule、考え中の短い視線外し、低振幅microsaccade、`surprised` 中のblink抑制を扱う
  - `CharacterBehaviorState`: VAD、顔検出、text/telop、感情コードを `idle/attending/user_speaking/thinking/ai_speaking/face_lost/error_or_disconnected` の対話状態 snapshot へ集約。VAD onset debounce、発話 hold、発話時間を持ち、短いノイズを聞き姿勢・相槌 trigger へ直結させない
  - `CharacterMotionOrchestrator`: `CharacterBehaviorSnapshot` と共通 motion config を参照し、呼吸・hips重心移動・spine/chest/shoulder の idle offset、VAD連動の聞き姿勢、発話終了後の小さな相槌 nod を適用
  - `CharacterMotionConfig`: idle/listening motion の周期・振幅を集約し、腕/脚/胴体 controller の `performance.now()` 直参照を避ける
  - `CharacterGaze`: 顔キーポイント追跡、視線角推定、arrive/leaveイベント通知
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-frontend/src/ts/SincroVRM/VRMScene/VRMScene.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceEmotionController.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/EyeBehaviorController.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionConfig.ts`
  - `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- 変更時に同時確認が必要なファイル:
  - 口形ロジック変更: `FaceMorphController.ts` と `TalkManager.ts`
  - 感情表情ロジック変更: `FaceEmotionController.ts` と `TalkManager.ts` / `RTCMessage.ts`
  - 顔認識ロジック変更: `CharacterGaze.ts` と `SincroController.ts`（自動ミュート連動）
  - シーン初期化変更: `VRMScene.ts` と `SincroVRMInitializer.ts`

### 7.2 データ設計

- 主要データ構造:
  - `CurrentMora`（TalkManagerが現在発話中の母音区間を保持）
  - `ChatMessage.expression_code`（text_ch先頭 `^N` 由来の感情コード。任意項目）
  - CharacterGazeの `movingAverage[6]`（右目/左目/鼻/口/右耳/左耳）
  - `CharacterBehaviorSnapshot`（VAD envelope、発話開始/終了時刻、直近発話時間、顔検出・顔位置・正面度、AI発話中speech_id/母音/感情コード、対話状態を保持）
- 永続化対象:
  - VRMモデルURL（`DialogManager.vrmUrl`）と、ローカル保存済みVRM（DialogManager経由）
- スキーマ/モデル:
  - `sincromisor-frontend/src/ts/RTC/RTCMessage.ts` の `TelopChannelMessage`, `ChatMessage`
- バージョニング方針:
  - `vowel` の表現変更時は `FaceMorphController` 側で後方互換を維持

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - 直接参照はしないが、`telop_ch` の `TelopChannelMessage` と `text_ch` の `ChatMessage.expression_code` を入力として利用
  - FaceDetectorアセット:
    - `/mediapipe-wasm`
    - `/3rd_party/blaze_face_short_range.tflite`
- リクエスト仕様:
  - なし（フロント内処理）
- レスポンス仕様:
  - なし
- エラー仕様:
  - VRMロード失敗はError throw
  - FaceDetector未ロード時は検出処理をスキップ
- タイムアウト/リトライ方針:
  - CharacterGazeモデルロード完了まで1秒間隔で起動待ち

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - Start -> `VRMScene.start()` -> animate loop
  - telop受信 -> `TalkManager.currentMora()` 更新 -> `FaceMorphController` が口形適用
  - text受信（chat mode） -> `TalkManager` イベント通知 -> `FaceEmotionController` が感情表情を適用
  - VAD/顔検出/text/telop受信 -> `CharacterBehaviorState` に集約 -> `VRMCharacterManager.update()` が毎フレーム snapshot 更新
  - `VRMCharacterManager.update()` -> `ArmBoneController` / `LegBoneController` が基準姿勢へ微小 idle offset を適用 -> `CharacterMotionOrchestrator` が hips/spine/chest/shoulder の呼吸・重心 offset と VAD 連動の聞き姿勢・相槌 nod を適用
  - 顔検出 -> `CharacterGaze` 更新 -> `HeadBoneController` に反映
- 異常系フロー:
  - VRMロード失敗 -> 例外出力（表示不可）
  - 顔未検出継続 -> ニュートラル位置に漸近
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: `networking_rtc.md` の telop フロー図と統合予定

## 8. 設定・デプロイ

- 環境変数:
  - 特になし（静的アセット配置に依存）
- 設定ファイル:
  - `sincromisor-frontend/vite.config.js`
- 起動方法:
  - `cd sincromisor-frontend && npm run dev`
- デプロイ/ローカル実行手順:
  - `npm run build`
  - `public/characters/default.vrm` を既定モデルとして配置
  - `public/mediapipe-wasm` と face model を配置
- 互換性に影響する設定変更:
  - VRM表情プリセット名の差異は `FaceMorphController` のマッピングに影響
  - 感情表情はVRM標準プリセット前提。LLM先頭 `^N` 出力ルール未設定時は表情連動しない

## 9. 監視・運用

- ログ設計:
  - VRMロード進捗/エラーをconsole出力
  - DebugConsoleで `faceX/faceY/facing/status` を表示
  - DebugConsole `text_ch` ログに `expression_code` 受信・感情プリセット適用・口パク重複bind除去数を出力（切り分け用）
- メトリクス:
  - 未導入
- 障害時の切り分け手順:
  - 1. `default.vrm` またはアップロードVRMが読み込めるか
  - 2. `characterGazeVideo` に映像が来ているか
  - 3. `faceX/faceY` が更新されるか
  - 4. `telop_ch` 受信時に口形が変化するか
  - 5. backend 未起動・カメラ/マイクOFFでも、胸/肩/腕/手首の idle motion が継続するか
- よくある失敗と対処:
  - wasm未配置で顔認識不可
  - VRM表情キー未対応で口形が動かない
  - Dify/LLM側の `^N` 出力未設定で感情表情が動かない
  - 感情表情と口パクが干渉するVRMでは、重複morph bind除去ログを確認し、必要に応じて強度を下げる
  - 低スペック端末で描画FPS低下

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - なし（描画層）
- 秘密情報の扱い:
  - なし
- 入力検証:
  - `.vrm` 拡張子チェック
- 脅威と対策:
  - 任意ファイル取扱いに対しては、実行コードではなくデータとしてのみ読込
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - VRM表示、首追従、口形同期、まばたき、自動ミュート
- 単体テスト:
  - 現状は未整備
- 結合テスト:
  - `simple-vrm/` でRTC接続し、telopに応じた口形変化を確認
- E2Eテスト:
  - 手動でカメラON/OFF・顔入退出・VRM差し替えを確認
- 負荷テスト（必要な場合のみ）:
  - 長時間（30分以上）描画でメモリ増加とFPS劣化を観察
- 受け入れ条件:
  - Start後にVRM描画が継続し、顔検出と口形同期が目視確認できる

## 12. 既知課題・リスク

- 既知課題:
  - 口形は母音中心で感情表現が不足（感情表情は追加済みだがVRM個体差により見え方の差が大きい）
  - 顔未検出時のニュートラル復帰は鼻中心で不自然な場合がある
  - idle motion はモデルごとの骨の向き・肩幅・衣装形状で見え方が変わるため、複数VRMで振幅調整が必要になる可能性がある
  - Looking Glass (`looking-glass-vrm`) では、`@lookingglass/webxr` の再開後セッションで mouse/wheel 操作が失効する環境がある（2026-02-23時点）
- 技術的負債:
  - Bone制御パラメータが経験則で、モデル差異に弱い
  - Looking Glass 再開時入力不具合に対して `LookingGlassXRController` へ段階的回復策（canvas参照再通知 / focus / fallback mouse controls）を実装しており、暫定コードが増えている
- リスク一覧:
  - VRM個体差による表情キー不一致
  - 感情プリセットに口形morphが含まれるVRMで、口パクと干渉する可能性
  - カメラ環境差による検出不安定
- 軽減策:
  - モデルごとの補正値導入、表情キー存在チェックの強化
  - 感情プリセットと viseme の重複morph bind を起動時に除去し、口パク優先で競合を軽減
  - Looking Glass は再開後入力失効の回避として `LookingGlassConfig` を直接更新する fallback 操作を再開時のみ有効化（初回セッションは vendor 実装を優先）

### 12.1 Looking Glass 運用メモ（2026-02-23）

- 背景:
  - `looking-glass-vrm` は `VRM360Scene` 流用を外し、`LookingGlassVRMScene`（通常VRM + LG起動導線）へ分離した
  - その過程で、renderer設定互換・終了後レイアウト復旧・再開時入力復旧の調整が `LookingGlassXRController` に集約された
- 現在の実装方針:
  - vendor (`@lookingglass/webxr`) の入力実装を基本とし、再開時にのみ回復策を追加する
  - runtime config 変更がない通常の停止/再開では polyfill を再生成しない
  - 再開後入力が失効する環境では fallback mouse controls を `lkgCanvas` に注入して `LookingGlassConfig.trackball* / target*` を直接更新する
- 将来のリファクタリング時に優先して確認する点:
  - `@lookingglass/webxr` の更新版で再開後 input 問題が解消していないか（解消済みなら fallback controls を削除）
  - `LookingGlassXRController` の「入力回復」と「XRセッション管理」を分離できるか
  - `LookingGlassVRMScene.bindLookingGlassStateRecovery()` の責務（レイアウト復旧 / camera interaction refresh）を Scene基底や専用Recoveryクラスへ分離できるか
- 手動回帰確認（最低限）:
  - `looking-glass-vrm` で `開始 -> 停止 -> 再開` 後に `wheel`, 左ドラッグ, 右ドラッグ（または `Shift+左ドラッグ`）が効く
  - LG終了後に通常画面のレンダリングエリアが崩れない

## 13. 代替案と設計判断

- 検討した代替案:
  - 表情を音量ベースで単純駆動
  - 首追従を完全にカメラ追従に固定
- 採用しなかった理由:
  - telop由来の母音同期のほうが視覚的な納得感が高い
  - 顔向き追従を切ると対話感が低下する
- 最終判断:
  - 母音同期 + 顔追従のハイブリッド方式を採用

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |
| 2026-02-23 | chatモード感情表情（`FaceEmotionController`）と `^N`/`expression_code` 連動、口パク競合軽減方針を追記 |
| 2026-02-23 | Looking Glass 専用シーン化、展示向け床テクスチャ/視点補正、終了後レイアウト復旧と再開時入力回復の暫定方針を追記 |
| 2026-05-08 | `CharacterBehaviorState` によるVAD/顔検出/text/telop/感情コードの集約と snapshot API を追記 |
| 2026-05-08 | `CharacterMotionOrchestrator` / `CharacterMotionConfig` による呼吸・重心移動・上半身 idle motion と、腕/脚 controller の低振幅 offset 化を追記 |
| 2026-05-08 | VAD onset debounce、発話終了 timing、聞き姿勢 blend、発話終了後の相槌 nod を追記 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/frontend_ui.md`
  - `documents/design/networking_rtc.md`
- 参照実装:
  - `sincromisor-frontend/src/ts/SincroVRM/VRMScene/VRMScene.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterBehaviorState.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionOrchestrator.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/CharacterMotionConfig.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceEmotionController.ts`
  - `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- 外部リンク:
  - https://github.com/pixiv/three-vrm
  - https://developers.google.com/mediapipe
