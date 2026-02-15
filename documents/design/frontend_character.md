# Frontend Character / VRM描画設計

SincromisorフロントエンドのVRMキャラクター描画層（シーン、骨制御、表情制御、顔追従）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/frontend_character.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的: VRMキャラクターの読み込み・描画・表情制御・視線制御の責務とデータフローを明確化する
- 対象範囲:
  - `SincroVRMInitializer` 以降のVRM描画パス
  - `VRMScene` / `VRMCharacterManager` / 各Bone/Face controller
  - `CharacterGaze` と自動ミュート連動
- 非対象範囲:
  - legacy（Babylon.js系）キャラクター実装
  - サーバー側音声合成・テロップ生成ロジック
- LLM向け要約（3-5行）:
  - Start後、`VRMScene` が Three.js renderer/camera/light を初期化し、`VRMCharacterManager` がVRMをロードする。
  - `FaceMorphController` は `TalkManager.currentMora()` を参照して母音ごとの口形を駆動する。
  - `HeadBoneController` は `CharacterGaze` の鼻座標から首向きを更新し、未検出時はカメラ追従にフォールバックする。
  - `CharacterGaze` は MediaPipe FaceDetector を `public/mediapipe-wasm` から読み込み、検出状態で自動ミュート連動も行う。

## 3. 背景

- 解決したい課題:
  - 低遅延で「話しているように見える」VRMキャラクター表示
  - ユーザーの顔向きに追従した自然なインタラクション
- 現状の問題点:
  - 表情は母音中心で、感情表現や全身モーションは限定的
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
  - 表情制御: `FaceMorphController`
  - 顔認識: `CharacterGaze`
- 責務分割:
  - 読込/更新ループ: `VRMScene` + `VRMCharacterManager`
  - ボーン更新: BoneController群
  - 口形同期: FaceMorphController + TalkManager
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
  - `HeadBoneController`: CharacterGazeまたはCamera方向に首回転を更新
  - `FaceMorphController`: `aa/ih/ou/ee/oh/blink` のExpression制御
  - `CharacterGaze`: 顔キーポイント追跡、視線角推定、arrive/leaveイベント通知
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-frontend/src/ts/SincroVRM/VRMScene/VRMScene.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/VRMCharacterManager.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/HeadBoneController.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
  - `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- 変更時に同時確認が必要なファイル:
  - 口形ロジック変更: `FaceMorphController.ts` と `TalkManager.ts`
  - 顔認識ロジック変更: `CharacterGaze.ts` と `SincroController.ts`（自動ミュート連動）
  - シーン初期化変更: `VRMScene.ts` と `SincroVRMInitializer.ts`

### 7.2 データ設計

- 主要データ構造:
  - `CurrentMora`（TalkManagerが現在発話中の母音区間を保持）
  - CharacterGazeの `movingAverage[6]`（右目/左目/鼻/口/右耳/左耳）
- 永続化対象:
  - VRMモデルURL（`DialogManager.vrmUrl`）と、ローカル保存済みVRM（DialogManager経由）
- スキーマ/モデル:
  - `sincromisor-frontend/src/ts/RTC/RTCMessage.ts` の `TelopChannelMessage`
- バージョニング方針:
  - `vowel` の表現変更時は `FaceMorphController` 側で後方互換を維持

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - 直接参照はしないが、`telop_ch` の `TelopChannelMessage` を入力として利用
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

## 9. 監視・運用

- ログ設計:
  - VRMロード進捗/エラーをconsole出力
  - DebugConsoleで `faceX/faceY/facing/status` を表示
- メトリクス:
  - 未導入
- 障害時の切り分け手順:
  - 1. `default.vrm` またはアップロードVRMが読み込めるか
  - 2. `characterGazeVideo` に映像が来ているか
  - 3. `faceX/faceY` が更新されるか
  - 4. `telop_ch` 受信時に口形が変化するか
- よくある失敗と対処:
  - wasm未配置で顔認識不可
  - VRM表情キー未対応で口形が動かない
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
  - 口形は母音中心で感情表現が不足
  - 顔未検出時のニュートラル復帰は鼻中心で不自然な場合がある
- 技術的負債:
  - Bone制御パラメータが経験則で、モデル差異に弱い
- リスク一覧:
  - VRM個体差による表情キー不一致
  - カメラ環境差による検出不安定
- 軽減策:
  - モデルごとの補正値導入、表情キー存在チェックの強化

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

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/frontend_ui.md`
  - `documents/design/networking_rtc.md`
- 参照実装:
  - `sincromisor-frontend/src/ts/SincroVRM/VRMScene/VRMScene.ts`
  - `sincromisor-frontend/src/ts/SincroVRM/VRMCharacter/FaceMorphController.ts`
  - `sincromisor-frontend/src/ts/CharacterGaze/CharacterGaze.ts`
- 外部リンク:
  - https://github.com/pixiv/three-vrm
  - https://developers.google.com/mediapipe
