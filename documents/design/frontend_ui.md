# Frontend UI / アプリ制御設計

SincromisorフロントエンドのUI層とアプリ制御層（初期化、RTC連携、表示更新）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/frontend_ui.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的: フロントエンドUI層の画面構成、初期化処理、RTC連携、メッセージ表示の責務を明確化する
- 対象範囲:
  - `sincromisor-frontend/src/ts/SincroController.ts` を中心とした制御
  - UIコンポーネント（Dialog/Chat/Debug/Pop）
  - Vite MPA構成とHTML partial
- 非対象範囲:
  - VRMボーン制御や表情制御の詳細（`frontend_character.md` で扱う）
  - サーバー側のシグナリング実装詳細
- LLM向け要約（3-5行）:
  - エントリは `main-vrm.ts`（VRM系）と `main-legacy.ts`（legacy系）で分岐する。
  - `SincroVRMInitializer` が設定ダイアログ表示と開始ボタンを管理し、開始時に `SincroController` を生成する。
  - `SincroController` は UserMedia 取得、RTC開始、DataChannel受信、CharacterGaze開始を統括する。
  - チャット文は `text_ch`、テロップは `telop_ch` で受信し、`TalkManager` 経由でUI/口形同期に渡す。

## 3. 背景

- 解決したい課題:
  - ブラウザ単体で、対話UI・音声I/O・状態確認を一体で扱う
  - モード別UI（simple/legacy/実験系）の共通部品化
- 現状の問題点:
  - legacy系とVRM系が共存し、エントリや依存関係を誤ると回帰しやすい
- 採用理由:
  - Vite MPA + HTML partial により、ページ分割と共通UI部品の両立が可能
- 制約条件:
  - `getUserMedia` 利用のため HTTPS または localhost が前提
  - WebRTCの接続先は `/api/v1/RTCSignalingServer/config.json` の取得結果に依存

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| MPA | Multi Page Application。Viteで複数HTMLエントリを配信する構成 |
| RTC | WebRTC。Offer/AnswerとDataChannelで通信する |
| CharacterGaze | MediaPipe FaceDetectorを使った顔向き推定機能 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - 設定ダイアログで会話モード・キャラ表示・顔認識・自動ミュートを切替可能
  - 起動時にマイク/カメラを取得し、音声トラックでRTC接続する
  - `text_ch` / `telop_ch` の受信内容を画面に反映する
  - デバッグコンソールでICE/SDP/DataChannelログを確認できる
- 優先度（Must/Should/Could）:
  - Must: RTC接続、チャット表示、テロップ表示
  - Should: 顔認識と自動ミュート、VRMファイル差し替え
  - Could: 実験ページ（Looking Glass/360）

### 5.2 非機能要件

- 性能: UI更新はフレーム落ちを避け、重い処理はrequestAnimationFrameで分散
- 可用性: RTC失敗時は `RTCTalkClient.reConnect()` による再接続を試行
- スケーラビリティ: フロントはクライアント内完結。サーバー側水平分割に依存
- セキュリティ: ブラウザ権限（マイク/カメラ）とCORS/HTTPS前提
- 運用性/保守性: Singleton Managerによる責務分離
- 監視性: DebugConsoleで通信状態を可視化

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - エントリ: `main-vrm.ts`, `main-legacy.ts`
  - 初期化: `SincroVRMInitializer`, `SincroInitializer`
  - 制御: `SincroController`, `RTCTalkClient`, `TalkManager`
  - UI: `DialogManager`, `ChatMessageManager`, `DebugConsoleManager`, `PopManager`
- 責務分割:
  - 画面入力/設定: DialogManager
  - 通信: RTCTalkClient + SincroRTCConfigManager
  - 表示更新: ChatMessageManager/TalkManager/DebugConsoleManager
- 外部依存:
  - Browser APIs: WebRTC, getUserMedia, Fetch, dialog element
  - `@mediapipe/tasks-vision`（顔認識利用時）
- 全体図（必要なら図リンク）:
  - TODO: 図を追加する場合は `documents/design/assets/frontend_ui_overview.drawio` などに配置

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `SincroVRMInitializer`: 初期画面起動、開始ボタンイベント、シーン開始
  - `SincroController`: UserMedia取得、RTC開始/停止、DataChannel受信ハンドラ設定、CharacterGaze起動
  - `RTCTalkClient`: Offer生成、`/offer` POST、Answer適用、DataChannel管理
  - `TalkManager`: text/telop受信を集約し、チャットUIと口形同期向け状態を維持
  - `DialogManager`: 設定値の参照、タイトル反映、VRMファイル更新
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-frontend/src/ts/SincroController.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-frontend/src/ts/RTC/TalkManager.ts`
  - `sincromisor-frontend/src/ts/UI/DialogManager.ts`
  - `sincromisor-frontend/src/ts/UI/ChatMessageManager.ts`
  - `sincromisor-frontend/src/ts/UI/DebugConsoleManager.ts`
- 変更時に同時確認が必要なファイル:
  - RTCペイロード変更: `RTCTalkClient.ts` とサーバー側 `RTCSignalingServer.py`
  - ダイアログ項目変更: `DialogManager.ts` と `src/partials/configurationDialog.html`
  - チャット表示変更: `ChatMessageManager.ts` と `src/styles/sincroChatBox.css`

### 7.2 データ設計

- 主要データ構造:
  - `ChatMessage`（text_ch）
  - `TelopChannelMessage`（telop_ch）
  - `SincroRTCConfig`（offerURL, candidateURL, iceServers）
- 永続化対象:
  - ブラウザ側の永続ストレージ利用は基本なし
  - VRMファイルは `DialogManager` 経由で Cache API（`caches.open('file-cache')`）に保存/読込
- スキーマ/モデル:
  - `sincromisor-frontend/src/ts/RTC/RTCMessage.ts`
- バージョニング方針:
  - サーバーとの契約変更時は前方互換を優先し、必要なら `message_type` 等で吸収

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/RTCSignalingServer/config.json`
  - `POST {offerURL}`（configで配布）
  - `POST {candidateURL}`（configで配布）
  - DataChannel: `text_ch`, `telop_ch`
- リクエスト仕様:
  - Offer送信: `{ sdp, type, talk_mode }`
  - Candidate送信: `{ session_id, candidate }`（`candidate` は end-of-candidates のとき `null`）
- レスポンス仕様:
  - Answer: `{ sdp, type, session_id }`
- エラー仕様:
  - HTTP 429 は明示エラーとして扱う
  - それ以外の非200は再接続対象
- タイムアウト/リトライ方針:
  - Trickle ICE方式: `setLocalDescription`後にOfferを先に送信し、候補は`onicecandidate`で逐次送信
  - 接続失敗時は `10-30秒` ランダム遅延で再接続

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - 画面読込 -> 設定ダイアログ表示 -> Start押下
  - UserMedia取得 -> RTC Offer/Answer（session_id取得）-> ICE candidate逐次送信 -> DataChannel open
  - text/telop受信 -> UI更新
- 異常系フロー:
  - 設定取得失敗 -> チャット欄へエラー表示
  - マイク/カメラ取得失敗 -> 起動不可表示またはエラーメッセージ
  - ICE failed -> 再接続
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: `networking_rtc.md` と整合する図を後続で追加

## 8. 設定・デプロイ

- 環境変数:
  - フロント単体では `.env` 依存は薄く、主にサーバー配布configを利用
- 設定ファイル:
  - `sincromisor-frontend/vite.config.js`（MPA entry / partial plugin）
- 起動方法:
  - `cd sincromisor-frontend && npm run dev`
- デプロイ/ローカル実行手順:
  - `npm run build` で `dist/` 出力
  - `public/mediapipe-wasm` と `public/3rd_party/blaze_face_short_range.tflite` の配置が必要
- 互換性に影響する設定変更:
  - `config.json` の `offerURL` / `iceServers` 変更は接続性に直結

## 9. 監視・運用

- ログ設計:
  - チャット欄にシステム/エラーを表示
  - デバッグ欄に ICE/SDP/DataChannel ログを表示
- メトリクス:
  - ブラウザ内メトリクスの集約基盤は未導入
- 障害時の切り分け手順:
  - 1. `/config.json` が取得できるか
  - 2. ICE state が `connected/completed` に遷移するか
  - 3. `text_ch` / `telop_ch` のopenと受信ログが出るか
- よくある失敗と対処:
  - マイク権限なし: ブラウザ権限を許可
  - WASM未配置: CharacterGazeが起動しない
  - offerURL不整合: POST先エラーで再接続ループ

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - ブラウザUI側に独自認証は未実装（上位プロキシ/サービス構成に依存）
- 秘密情報の扱い:
  - フロントに長期秘密情報は保持しない
- 入力検証:
  - VRMアップロード時は拡張子 `.vrm` を最低限検証
- 脅威と対策:
  - XSS対策として通常は `innerText` を使用（必要時のみ `innerHTML`）
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - 起動導線、RTC接続、チャット表示、テロップ表示、設定反映
- 単体テスト:
  - 現状は薄い。主要ロジックは手動確認中心
- 結合テスト:
  - サーバー起動下で Offer/Answer と DataChannel を確認
- E2Eテスト:
  - 手動で `simple-vrm/` を用いた動作確認
- 負荷テスト（必要な場合のみ）:
  - 未整備
- 受け入れ条件:
  - Start後に接続完了メッセージが出て、text/telopが継続受信される

## 12. 既知課題・リスク

- 既知課題:
  - Singleton前提のため、複数インスタンス同時利用には不向き
  - legacyページとの差分が増えると保守コストが増加
- 技術的負債:
  - UIロジックとDOM依存が密結合な箇所がある
- リスク一覧:
  - WebRTC仕様変更時にフロント/サーバー差分が発生しやすい
  - Candidate送信経路（`candidateURL`）が不整合だと接続が成立しない
- 軽減策:
  - `networking_rtc.md` と本書を同時更新する運用を徹底
  - `offerURL`/`candidateURL`/payloadをフロントとサーバーで同時更新する

## 13. 代替案と設計判断

- 検討した代替案:
  - SPA化してルーティング統合
- 採用しなかった理由:
  - 実験ページを含む複数導線を小さく独立管理したい
- 最終判断:
  - MPA継続。共通部品は partial + Manager クラスで共有

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |
| 2026-02-15 | ChromiumでのOffer遅延対策として、ICE gathering待機に1500ms上限を設ける仕様を追記 |
| 2026-02-16 | FirefoxでのICE失敗を避けるため、ICE gathering待機をブラウザ別制御（Chromiumのみ1500ms上限）に更新 |
| 2026-02-16 | Trickle ICE導入。`candidateURL`追加、`session_id`付きAnswer、候補の逐次送信フローへ更新 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/networking_rtc.md`
  - `documents/design/frontend_character.md`
- 参照実装:
  - `sincromisor-frontend/src/ts/SincroController.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-frontend/vite.config.js`
- 外部リンク:
  - https://vitejs.dev/
