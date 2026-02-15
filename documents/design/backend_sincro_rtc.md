# Backend Sincro RTC / RTC Signaling Server 設計

Sincromisor の `sincro-rtc` サービスにおける、WebRTCシグナリングAPIとRTCセッション管理の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_sincro_rtc.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - フロントエンドのOffer/Answerネゴシエーションを提供する
  - 1セッション=1プロセスでRTCセッションを安全に分離管理する
- 対象範囲:
  - `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
  - `src/sincro_rtc/RTCSession/*`
  - `src/sincro_rtc/RTCSession/VoiceTransformTrack.py`（RTC側境界）
- 非対象範囲:
  - AudioBroker内部詳細（`backend_audio_broker.md`）
  - SpeechExtractor / Recognizer / TextProcessor / VoiceSynthesizer 各サービス実装
- LLM向け要約（3-5行）:
  - `RTCSignalingServer` は FastAPI で `/offer` `/config.json` 等を提供する。
  - `/offer` ごとに `RTCSessionManager` が `RTCSessionProcess` を生成し、Answer SDP を返す。
  - `RTCSessionProcess` は audio track を `VoiceTransformTrack` に接続し、`text_ch`/`telop_ch` DataChannel を扱う。
  - セッション終了は共有 `rtc_finalize_event` で通知し、管理スレッドがプロセス終了/kill を担保する。

## 3. 背景

- 解決したい課題:
  - 音声対話セッションの分離と障害局所化
  - WebRTCネゴシエーションをフロントからシンプルに扱えるAPI設計
- 現状の問題点:
  - 1プロセス内多セッションよりメモリ効率は下がるが、障害分離を優先している
- 採用理由:
  - aiortc + プロセス分離で、セッション単位の異常終了を扱いやすい
- 制約条件:
  - 音声トラック以外は未対応（未知トラックはエラー扱い）
  - ICE設定は `SincromisorConfig.from_yaml()` 依存

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| RTCSessionProcess | 1つのWebRTCセッションを処理する子プロセス |
| rtc_finalize_event | セッション終了を親子で共有する multiprocessing Event |
| talk_mode | `chat` または `sincro`。下流処理モードに影響 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - Offer受信時にAnswerを返却できること
  - セッション数上限 (`max_sessions`) を超えたら 429 を返すこと
  - DataChannel `text_ch` / `telop_ch` をセッションに紐づけること
  - 音声トラック受信時に `VoiceTransformTrack` を返送トラックとして追加すること
  - 終了済みセッションをクリーンアップできること
- 優先度（Must/Should/Could）:
  - Must: Offer/Answer、セッション分離、終了処理
  - Should: Consul連携によるサービス登録
  - Could: CORS制御など運用向けミドルウェア拡張

### 5.2 非機能要件

- 性能: セッションごとに独立プロセスで処理し、相互干渉を抑制
- 可用性: セッション失敗時は該当セッションのみ終了
- スケーラビリティ: `max_sessions` による上限制御
- セキュリティ: reverse proxy 前提で `forwarded_allow_ips` 制御
- 運用性/保守性: `/statuses` と `/cleanup` を提供
- 監視性: セッション数と接続状態をログ・healthcheckで監視可能

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - API層: `RTCSignalingServer.py`
  - セッション管理: `RTCSessionManager.py`
  - セッション実行: `RTCSessionProcess.py`
  - 終了監視: `RTCSessionProcessManagementThread.py`
  - 音声変換トラック: `VoiceTransformTrack.py`
- 責務分割:
  - FastAPIは入口管理（認可/上限/設定配布）
  - SessionManagerはプロセスライフサイクル管理
  - SessionProcessはaiortcハンドラ登録とSDP応答
  - VoiceTransformTrackは下流音声処理との橋渡し
- 外部依存:
  - `fastapi`, `uvicorn`, `aiortc`, `sincro-config`, `sincro-models`
  - (任意) Consul `ServiceDiscoveryReporter`
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/backend_sincro_rtc_flow.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `RTCSignalingServer.start()`: API定義と起動、Consul登録、shutdown時cleanup
  - `RTCSessionManager.create_session()`: ULID採番、Pipe/Event生成、子プロセス起動
  - `RTCSessionProcess.__offer()`: Offer適用、イベントハンドラ設定、Answer作成
  - `RTCSessionProcessManagementThread.run()`: 終了待機、timeout時kill
  - `VoiceTransformTrack.recv()`: 入力音声を処理し、返却音声/テキスト/テロップを供給
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionManager.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionProcess.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionProcessManagementThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/VoiceTransformTrack.py`
- 変更時に同時確認が必要なファイル:
  - Offer payload変更: `RTCSessionOffer.py` と frontend `RTCTalkClient.ts`
  - DataChannel名変更: `RTCSessionProcess.py` と frontend `RTCTalkClient.ts`
  - ICE設定変更: `RTCSignalingServer.py` / `RTCSessionProcess.py` / `config.yml`

### 7.2 データ設計

- 主要データ構造:
  - `RTCSessionOffer`: `{ sdp, type, talk_mode }`
  - `RTCVoiceChatSession`: peer/desc/datachannel/track/session_id を保持
  - `RTCSessionProcessDescription`: process管理用の `event + pipe + mgmt thread`
- 永続化対象:
  - 永続DBなし。セッション状態はメモリ上で管理
- スキーマ/モデル:
  - `src/sincro_rtc/models/RTCSessionOffer.py`
  - `src/sincro_rtc/models/RTCVoiceChatSession.py`
- バージョニング方針:
  - API互換は frontend の送信JSONと同期管理

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - `GET /api/v1/RTCSignalingServer/statuses`
  - `POST /api/v1/RTCSignalingServer/offer`
  - `GET /api/v1/RTCSignalingServer/cleanup`
  - `GET /api/v1/RTCSignalingServer/config.json`
  - DataChannel: `text_ch`, `telop_ch`
- リクエスト仕様:
  - `/offer` body: `{"sdp": "...", "type": "...", "talk_mode": "chat|sincro"}`
- レスポンス仕様:
  - `/offer` success: `{"sdp": "...", "type": "...", "session_id": "..."}`
  - `/config.json`: `{"offerURL": "/api/v1/RTCSignalingServer/offer", "iceServers": [...]}`
  - `/statuses`: `{"worker_type":"RTCSignalingServer","sessions":<int>}`
- エラー仕様:
  - セッション超過: HTTP 429 + `{"error":"Too many requests."}`
  - ICE解決失敗等: セッション終了イベントを立て、接続失敗として終端
- タイムアウト/リトライ方針:
  - サーバー側で積極再試行は行わない（フロント側再接続に委譲）

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - `POST /offer` -> `RTCSessionManager.create_session()`
  - 子プロセスで `setRemoteDescription` -> `createAnswer` -> `setLocalDescription`
  - AnswerをPipe経由で親に返却 -> HTTP応答
  - audio track受信後に `VoiceTransformTrack` が稼働
- 異常系フロー:
  - `max_sessions` 超過 -> 429
  - 不明DataChannel/不明track -> finalize_event set -> セッション終了
  - `connectionState=failed` -> close + finalize
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: `documents/design/networking_rtc.md` に統合図を追加

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_RTC_HOST`, `SINCRO_RTC_PORT`
  - `SINCRO_RTC_PUBLIC_BIND_HOST`, `SINCRO_RTC_PUBLIC_BIND_PORT`
  - `SINCRO_RTC_FORWARDED_ALLOW_IPS`
  - `SINCRO_RTC_MAX_SESSIONS`
  - `SINCRO_RTC_FALLBACK_HOST`, `SINCRO_RTC_FALLBACK_PORT`
  - `SINCRO_CONSUL_AGENT_HOST`, `SINCRO_CONSUL_AGENT_PORT`
- 設定ファイル:
  - `examples/config.yml`（ICEサーバ設定含む）
  - `compose/sincro-rtc.yml`
- 起動方法:
  - `uv run sincro-rtc/RTCSignalingServer.py`
- デプロイ/ローカル実行手順:
  - `docker compose --profile rtc up -d`
  - healthcheck: `http://localhost:8001/api/v1/RTCSignalingServer/statuses`
- 互換性に影響する設定変更:
  - `SINCRO_RTC_PUBLIC_BIND_*` の不整合はService Discovery経由接続失敗を誘発
  - ICEサーバ情報変更は接続可否に直結

## 9. 監視・運用

- ログ設計:
  - Offer/Answer SDP、接続状態、セッション終了をログ出力
- メトリクス:
  - `/statuses` の `sessions` を簡易メトリクスとして利用
- 障害時の切り分け手順:
  - 1. `/statuses` が200応答するか
  - 2. `/config.json` が期待通りの `offerURL/iceServers` を返すか
  - 3. `connectionState` が `failed` で落ちていないかログ確認
  - 4. `cleanup` 後にゾンビセッションが残っていないか確認
- よくある失敗と対処:
  - ICEホスト名解決不可 -> config/ネットワーク/DNS確認
  - `max_sessions` 超過 -> 閾値見直しまたは接続数平準化

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 本API単体の認証は未実装（上位リバースプロキシで制御する前提）
- 秘密情報の扱い:
  - TURN credential は `config.yml` / 環境側で管理
- 入力検証:
  - `RTCSessionOffer` は Pydantic モデルで型検証
- 脅威と対策:
  - セッション上限で過負荷を緩和
  - 予期しないトラック/チャネルは即終了
- 監査ログ（必要な場合のみ）:
  - 監査専用ログは未実装

## 11. テスト方針

- テスト観点:
  - API疎通、Offer/Answer成立、セッション上限、終了処理
- 単体テスト:
  - `AudioBrokerTest.py` など限定的。RTC全体は統合中心
- 結合テスト:
  - frontend から接続し `text_ch`/`telop_ch` 受信まで確認
- E2Eテスト:
  - compose環境で音声入出力一連を手動確認
- 負荷テスト（必要な場合のみ）:
  - `max_sessions` 近傍の同時接続で応答と回復性を確認
- 受け入れ条件:
  - `/offer` がAnswerを返し、音声セッションが成立する

## 12. 既知課題・リスク

- 既知課題:
  - 音声以外トラック非対応
  - セッション単位プロセスでメモリ消費は増えやすい
- 技術的負債:
  - CORS設定はコメントアウト状態で環境依存
- リスク一覧:
  - ICE設定ミスで全セッション接続不能
  - 下流サービス不調時の品質低下
- 軽減策:
  - healthcheck + cleanup運用
  - fallback host/port の明示設定

## 13. 代替案と設計判断

- 検討した代替案:
  - 単一プロセスで複数PeerConnectionを管理
- 採用しなかった理由:
  - 障害局所化・終了制御が難しくなる
- 最終判断:
  - 現状は 1セッション=1プロセス + 管理スレッドで運用

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/networking_rtc.md`
  - `documents/design/backend_audio_broker.md`
- 参照実装:
  - `sincromisor-server/sincro-rtc/RTCSignalingServer.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionManager.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/RTCSessionProcess.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/VoiceTransformTrack.py`
- 外部リンク:
  - https://aiortc.readthedocs.io/
