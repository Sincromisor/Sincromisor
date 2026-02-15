# Networking RTC / Frontend - RTCSignalingServer

Sincromisor のフロントエンドと `sincro-rtc` 間の WebRTC 通信（シグナリング + Media/DataChannel）仕様を定義する文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/networking_rtc.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - フロントエンドとRTCサーバーの通信契約を明文化し、変更時の破壊を防ぐ
- 対象範囲:
  - HTTP API: `config.json`, `offer`, `statuses`, `cleanup`
  - WebRTC: audio track, `text_ch`, `telop_ch`
  - 主要実装: frontend `RTCTalkClient` / backend `RTCSignalingServer`, `RTCSessionProcess`
- 非対象範囲:
  - AudioBroker 以降のWebSocket契約（`networking_websocket.md`）
  - UI表示詳細
- LLM向け要約（3-5行）:
  - フロントは `GET /config.json` で `offerURL` と `iceServers` を取得する。
  - `POST /offer` に `{sdp,type,talk_mode}` を送信し、Answer SDP を受け取る。
  - WebRTC接続後、音声は MediaTrack で送信し、`text_ch` と `telop_ch` を受信する。
  - `text_ch` はチャット表示、`telop_ch` はテロップと口形同期に利用する。

## 3. 背景

- 解決したい課題:
  - ブラウザで音声対話を低遅延に成立させる
  - フロント/サーバー間で契約を固定し、独立開発時の不整合を減らす
- 現状の問題点:
  - WebRTC契約は暗黙になりやすく、DataChannel名変更などで回帰しやすい
- 採用理由:
  - WebRTCにより双方向音声とDataChannelを同時に扱える
- 制約条件:
  - ブラウザのマイク権限が必須
  - ICE設定の妥当性に強く依存

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| Offer/Answer | WebRTCセッション確立時のSDP交換 |
| `text_ch` | テキストメッセージ用DataChannel |
| `telop_ch` | テロップ/母音同期情報用DataChannel |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - フロントは起動時にRTC設定を取得できること
  - Offer送信に対してAnswerを返却できること
  - 音声トラックが継続送受信できること
  - `text_ch` / `telop_ch` が利用できること
  - セッション上限超過時に明確なエラーを返すこと
- 優先度（Must/Should/Could）:
  - Must: config取得、offer/answer、audio track、2つのDataChannel
  - Should: `statuses` / `cleanup` による運用補助
  - Could: 追加DataChannel拡張

### 5.2 非機能要件

- 性能: リアルタイム会話品質を維持する遅延特性
- 可用性: 接続失敗時はフロントが再接続を試行
- スケーラビリティ: `SINCRO_RTC_MAX_SESSIONS` で上限管理
- セキュリティ: reverse proxy + `forwarded_allow_ips` 前提
- 運用性/保守性: APIとDataChannel名を固定契約化
- 監視性: `/statuses` とICE stateログで確認可能

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - Frontend: `SincroController`, `RTCTalkClient`, `SincroRTCConfigManager`
  - Backend: `RTCSignalingServer`, `RTCSessionManager`, `RTCSessionProcess`
  - Media変換: `VoiceTransformTrack`
- 責務分割:
  - フロント: Offer生成、接続管理、受信UI反映
  - サーバー: Answer生成、セッション分離、DataChannel紐付け
- 外部依存:
  - Browser WebRTC API
  - aiortc
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/networking_rtc_sequence.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `SincroRTCConfigManager`: `/config.json` 取得
  - `RTCTalkClient`: Offer作成、`/offer` POST、Answer適用、DataChannelイベント処理
  - `RTCSignalingServer`: API入口、セッション生成、上限制御
  - `RTCSessionProcess`: DataChannelラベル判定、audio track受理、`VoiceTransformTrack` 接続
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-frontend/src/ts/RTC/SincroRTCConfigManager.ts`
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionProcess.py`
- 変更時に同時確認が必要なファイル:
  - Offer JSON仕様変更: `RTCTalkClient.ts` と `RTCSessionOffer.py`
  - DataChannel名変更: `RTCTalkClient.ts` と `RTCSessionProcess.py`
  - configレスポンス変更: `SincroRTCConfigManager.ts` と `RTCSignalingServer.py`

### 7.2 データ設計

- 主要データ構造:
  - Offer request: `{ sdp: string, type: string, talk_mode: "chat"|"sincro" }`
  - Offer response: `{ sdp: string, type: string, session_id: string }`
  - config response: `{ offerURL: string, iceServers: IceServerConfig[] }`
  - DataChannel payload:
    - `text_ch`: `ChatMessage`
    - `telop_ch`: `TelopChannelMessage`
- 永続化対象:
  - なし（セッション中メモリ）
- スキーマ/モデル:
  - backend: `src/sincro_rtc/models/RTCSessionOffer.py`
  - frontend: `src/ts/RTC/RTCMessage.ts`
- バージョニング方針:
  - 後方互換を優先し、変更時は両端同時更新

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/RTCSignalingServer/config.json`
  - `POST /api/v1/RTCSignalingServer/offer`
  - `GET /api/v1/RTCSignalingServer/statuses`
  - `GET /api/v1/RTCSignalingServer/cleanup`
  - DataChannel: `text_ch` (ordered=true), `telop_ch` (ordered=false, maxRetransmits=0)
- リクエスト仕様:
  - `config.json`: bodyなし
  - `offer`: JSON bodyに `sdp/type/talk_mode`
- レスポンス仕様:
  - `200`: Answer SDPまたは設定JSON
  - `429`: `{"error":"Too many requests."}`
- エラー仕様:
  - `offer` 非200時はフロント側で接続失敗表示し再接続
  - 不正DataChannel/不正Trackはセッション側で終了
- タイムアウト/リトライ方針:
  - フロントはランダム遅延（約10-30秒）で再接続

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - 1. Front: `GET /config.json`
  - 2. Front: PeerConnection生成、audio track追加、DataChannel生成
  - 3. Front: `POST /offer`
  - 4. Server: Answer生成し返却
  - 5. Front: `setRemoteDescription`、接続確立
  - 6. Runtime: `text_ch` / `telop_ch` 受信処理
- 異常系フロー:
  - `429` 受信 -> 再接続待ち
  - ICE失敗 -> Frontの再接続処理へ移行
  - track/datachannel想定外 -> session終了
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: シーケンス図追加

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_RTC_HOST`, `SINCRO_RTC_PORT`
  - `SINCRO_RTC_PUBLIC_BIND_HOST`, `SINCRO_RTC_PUBLIC_BIND_PORT`
  - `SINCRO_RTC_MAX_SESSIONS`
  - `SINCRO_RTC_FORWARDED_ALLOW_IPS`
- 設定ファイル:
  - `examples/config.yml`（ICE）
  - `compose/sincro-rtc.yml`
- 起動方法:
  - backend: `uv run sincro-rtc/RTCSignalingServer.py`
  - frontend: `npm run dev`
- デプロイ/ローカル実行手順:
  - `docker compose --profile full up -d`
- 互換性に影響する設定変更:
  - `offerURL` パス変更
  - ICEサーバ設定変更

## 9. 監視・運用

- ログ設計:
  - frontend: ICE/DataChannelログ（DebugConsole）
  - backend: Offer/Answer・connection stateログ
- メトリクス:
  - `/statuses` の `sessions`
- 障害時の切り分け手順:
  - 1. `/config.json` 応答確認
  - 2. `/offer` のHTTPステータス確認
  - 3. ICE state遷移確認
  - 4. `text_ch` / `telop_ch` open/受信確認
- よくある失敗と対処:
  - マイク権限拒否 -> 権限設定を見直す
  - ICE不整合 -> STUN/TURN設定を見直す
  - セッション上限超過 -> `SINCRO_RTC_MAX_SESSIONS` 調整

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - API単体認証は未実装（上位レイヤで制御）
- 秘密情報の扱い:
  - TURN credentialはサーバー設定側で管理
- 入力検証:
  - Offer bodyはPydanticで型検証
- 脅威と対策:
  - セッション上限による過負荷緩和
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - config取得、offer/answer、audio送受信、2DataChannel受信
- 単体テスト:
  - 通信契約は主に統合試験で検証
- 結合テスト:
  - frontend + sincro-rtc で接続確認
- E2Eテスト:
  - compose fullで会話成立確認
- 負荷テスト（必要な場合のみ）:
  - 同時セッション上限付近で429挙動確認
- 受け入れ条件:
  - フロントから接続し text/telop が受信できる

## 12. 既知課題・リスク

- 既知課題:
  - CORS設定はコメントアウト状態
  - ネットワーク条件依存が大きい
- 技術的負債:
  - 契約変更時の自動検証が薄い
- リスク一覧:
  - DataChannel名ずれによる無通信
  - ICE設定ミスによる全面接続失敗
- 軽減策:
  - この文書と frontend/backend文書を同時更新

## 13. 代替案と設計判断

- 検討した代替案:
  - WebSocketのみで音声転送
- 採用しなかった理由:
  - 低遅延双方向音声にWebRTCが適している
- 最終判断:
  - 音声はMediaTrack、テキスト系はDataChannelの混在方式

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/frontend_ui.md`
  - `documents/design/backend_sincro_rtc.md`
  - `documents/design/networking_websocket.md`
- 参照実装:
  - `sincromisor-frontend/src/ts/RTC/RTCTalkClient.ts`
  - `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionProcess.py`
- 外部リンク:
  - https://developer.mozilla.org/docs/Web/API/WebRTC_API
