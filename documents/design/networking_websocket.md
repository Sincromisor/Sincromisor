# Networking WebSocket / AudioBroker - Downstream Services

Sincromisor の AudioBroker と各音声処理サービス（SpeechExtractor / SpeechRecognizer / TextProcessor / VoiceSynthesizer）間の WebSocket 通信仕様を定義する文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/networking_websocket.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - AudioBroker内部の4系統WS通信契約を明文化し、サービス間変更の影響範囲を明確にする
- 対象範囲:
  - `AudioBroker` の接続先URL、送受信payload、キュー中継
  - 各 `*SenderThread` / `*ReceiverThread` の連携
- 非対象範囲:
  - WebRTCシグナリング契約（`networking_rtc.md`）
  - 各下流サービス内部の推論/生成ロジック
- LLM向け要約（3-5行）:
  - AudioBrokerは4つのWS接続を張り、すべて msgpack バイナリで通信する。
  - 流れは `AudioFrame -> Extractor -> Recognizer -> TextProcessor -> Synthesizer`。
  - TextProcessor 由来のChatMessageは `text_channel_queue`、Synthesizer音声は `voice_frame_queue` に集約される。
  - どこか1系統で例外が出ると `running Event` をclearし全体停止する。

## 3. 背景

- 解決したい課題:
  - 音声処理を分散サービス化しつつ、RTCセッション単位で一貫して接続する
- 現状の問題点:
  - スレッド/キュー構成のため、契約不一致時の不具合把握が難しい
- 採用理由:
  - 同期WebSocket + msgpack で実装が単純
- 制約条件:
  - 下流4サービスすべての到達性に依存
  - キューあふれ時にデータ破棄が発生する

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| Extractor | 音声区間抽出サービス |
| Recognizer | 音声認識サービス |
| TextProcessor | 対話応答生成サービス |
| Synthesizer | 音声合成サービス |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - AudioBrokerが4サービスへ接続・送受信できること
  - msgpackモデルのシリアライズ/デシリアライズが成立すること
  - speech_id/sequence_idの流れが維持されること
  - TextProcessorのrequest/responseをtext channel向けに反映できること
  - Synthesizer音声をRTC返却形式へ分割できること
- 優先度（Must/Should/Could）:
  - Must: 4系統接続、順方向パイプライン、結果キュー集約
  - Should: Consulベースworker解決
  - Could: QoS/再送制御の強化

### 5.2 非機能要件

- 性能: 低遅延を優先し、過負荷時は古いフレームを破棄
- 可用性: 失敗時は停止して上位で再接続
- スケーラビリティ: セッション単位で独立インスタンス
- セキュリティ: 内部ネットワークWS想定
- 運用性/保守性: サービス別Thread分割
- 監視性: session_id付きログで追跡可能

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - `AudioBroker`
  - `ExtractorSender/ReceiverThread`
  - `RecognizerSender/ReceiverThread`
  - `TextProcessorSender/ReceiverThread`
  - `SynthesizerSender/ReceiverThread`
- 責務分割:
  - SenderThread: deque -> ws送信
  - ReceiverThread: ws受信 -> deque格納
  - AudioBroker: worker探索、接続、停止制御、エラー注入
- 外部依存:
  - `websockets.sync.client`, `sincro_models`, `sincro_config`
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/networking_websocket_pipeline.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `AudioBroker.__extractor()`: Extractor接続と初期化要求送信
  - `AudioBroker.__recognizer()`: Extractor結果を認識へ中継
  - `AudioBroker.__text_processor()`: 認識結果を会話処理へ中継
  - `AudioBroker.__synthesizer()`: 応答テキストを音声化
  - `SynthesizerReceiverThread`: 合成音声を `VoiceSynthesizerResultFrame` に分割
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/AudioBroker.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/ExtractorSenderThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/RecognizerSenderThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/TextProcessorSenderThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/SynthesizerReceiverThread.py`
- 変更時に同時確認が必要なファイル:
  - endpointパス変更: `AudioBroker.py` と各サービスAPI実装
  - msgpack型変更: `sincro-models` と各Sender/ReceiverThread
  - text/telop契約変更: `VoiceTransformTrack.py` と frontend `RTCMessage.ts`

### 7.2 データ設計

- 主要データ構造:
  - 入力: raw PCM bytes (`frame_buffer`)
  - 中間:
    - `SpeechExtractorResult`
    - `SpeechRecognizerResult`
    - `TextProcessorResult`
  - 出力:
    - `ChatMessage`（`text_channel_queue`）
    - `VoiceSynthesizerResultFrame`（`voice_frame_queue`）
- 永続化対象:
  - なし
- スキーマ/モデル:
  - `sincro_models`（msgpack model群）
- バージョニング方針:
  - model互換が壊れる変更は同時リリース必須

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - Extractor:
    - `ws://{host}:{port}/api/v1/SpeechExtractor/extract?max_silence_ms={1000|600}`
  - Recognizer:
    - `ws://{host}:{port}/api/v1/SpeechRecognizer/recognize`
  - TextProcessor:
    - `ws://{host}:{port}/api/v1/TextProcessor/{talk_mode}`
  - VoiceSynthesizer:
    - `ws://{host}:{port}/api/v1/VoiceSynthesizer/synthesize`
- リクエスト仕様:
  - Extractor開始時のみ `SpeechExtractorInitializeRequest`
  - 以降はmsgpackバイナリ連続送信
- レスポンス仕様:
  - 各段でmsgpack結果を返し、次段へ中継
- エラー仕様:
  - 接続断/例外時は当該Thread終了し `running.clear()`
  - `AudioBroker.__err_to_chat()` でエラーをユーザー向け出力可能
- タイムアウト/リトライ方針:
  - `recv(timeout=5)` でポーリング継続
  - `AudioBroker.connect()` は最低10秒間隔で再試行

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - 1. AudioBrokerが4 worker接続を開始
  - 2. `add_frame()` 入力を Extractor に送信
  - 3. Extractor結果を Recognizer へ送信
  - 4. Recognizer結果を TextProcessor へ送信
  - 5. TextProcessor結果を Synthesizer へ送信
  - 6. Textは `text_channel_queue`、音声は `voice_frame_queue` へ
- 異常系フロー:
  - 接続拒否/切断/デコード失敗 -> Event clear -> 全体停止
  - 上位 `VoiceTransformTrack` が停止検知して再接続
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: 追加予定

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_CONSUL_AGENT_HOST`, `SINCRO_CONSUL_AGENT_PORT`
  - `SINCRO_RTC_FALLBACK_HOST`, `SINCRO_RTC_FALLBACK_PORT`
  - `talk_mode`（`chat`/`sincro`）によりExtractor/TextProcessor経路が変化
- 設定ファイル:
  - `examples/compose.env`
  - `compose/*.yml`
- 起動方法:
  - AudioBroker単体ではなく、RTCセッション開始時に生成
- デプロイ/ローカル実行手順:
  - `docker compose --profile full up -d`
- 互換性に影響する設定変更:
  - worker名（SpeechExtractor等）やAPI pathの変更

## 9. 監視・運用

- ログ設計:
  - 各Threadは開始/終了/例外をログ出力
- メトリクス:
  - 現状はログ中心
- 障害時の切り分け手順:
  - 1. どのworkerへの接続で失敗しているか確認
  - 2. どのThreadが先に終了したか確認
  - 3. キュー（frame/text/voice）滞留の有無を確認
  - 4. fallback利用有無を確認
- よくある失敗と対処:
  - Consul未解決 -> fallback設定またはConsul復旧
  - 下流サービス未起動 -> composeプロファイル/依存関係確認

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 内部通信として運用、追加認証は未実装
- 秘密情報の扱い:
  - この経路自体に秘密情報はほぼ含まれない
- 入力検証:
  - msgpack復元時に型不整合を例外として扱う
- 脅威と対策:
  - 異常入力・切断時にfail-fastで停止
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - 4段パイプラインの連続性、切断時停止、再接続時復帰
- 単体テスト:
  - Thread単位の検証を必要に応じて追加
- 結合テスト:
  - composeで4サービス接続し、音声->応答まで確認
- E2Eテスト:
  - frontend経由で会話と音声再生成立を確認
- 負荷テスト（必要な場合のみ）:
  - 連続発話時のキューあふれ挙動を確認
- 受け入れ条件:
  - text/telop/audio が継続して戻ること

## 12. 既知課題・リスク

- 既知課題:
  - キュー容量は固定で、動的制御なし
  - thread異常時の詳細メトリクス不足
- 技術的負債:
  - スレッド間同期の可観測性が低い
- リスク一覧:
  - 下流サービスの一部障害で全停止
  - 遅延増大時のフレーム破棄増加
- 軽減策:
  - fallback運用、ログ拡充、将来的なメトリクス追加

## 13. 代替案と設計判断

- 検討した代替案:
  - 非同期イベントループ1本化
  - メッセージブローカ導入
- 採用しなかった理由:
  - 実装移行コストが高く、現行構成で運用可能
- 最終判断:
  - セッション局所化しやすいスレッド + deque構成を継続

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/backend_audio_broker.md`
  - `documents/design/networking_rtc.md`
- 参照実装:
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/AudioBroker.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/TextProcessorSenderThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/SynthesizerReceiverThread.py`
- 外部リンク:
  - https://websockets.readthedocs.io/
