# Backend Audio Broker 設計

Sincromisor の `sincro-rtc` 内部で動作する AudioBroker（音声中継・変換パイプライン）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_audio_broker.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - WebRTC入力音声を各マイクロサービスへ中継し、返却音声/テキストを生成する
  - 音声I/O・認識・応答・合成を疎結合に接続する
- 対象範囲:
  - `src/sincro_rtc/AudioBroker/*`
  - `VoiceTransformTrack` からの利用境界
- 非対象範囲:
  - 各下流サービス（Extractor/Recognizer/TextProcessor/Synthesizer）の内部アルゴリズム
  - WebRTCシグナリングAPI自体
- LLM向け要約（3-5行）:
  - AudioBroker は4つのWebSocket接続（Extractor, Recognizer, TextProcessor, Synthesizer）を張る。
  - 各接続は SenderThread / ReceiverThread の2スレッドで実行され、deque を介してデータを中継する。
  - `VoiceTransformTrack` は `add_frame()` で入力音声を供給し、`voice_frame_queue` と `text_channel_queue` から結果を取得する。
  - いずれかのスレッド異常時は共有 `running Event` をclearし、パイプライン全体を停止する。

## 3. 背景

- 解決したい課題:
  - 音声対話処理をサービス分割したまま、RTCセッション単位で一貫した処理を実現する
- 現状の問題点:
  - マルチスレッド + 複数キュー構成のため、遅延/詰まりの調査が複雑
- 採用理由:
  - WebSocket + msgpack のシンプルなストリーミング接続で各サービスを接続できる
- 制約条件:
  - 下流4サービスの生存性に依存
  - バッファサイズ超過時は古いフレームを破棄する設計

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| AudioBroker | RTC入力音声を各音声処理サービスへ配送し、結果を統合する中継器 |
| running Event | 各スレッド共通の稼働フラグ。clearで全停止 |
| mora | 音素単位の合成情報。テロップ/口形同期に利用 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - Extractor/Recognizer/TextProcessor/Synthesizer へ接続し、双方向に中継する
  - RTC入力音声フレームを Extractor へ送信する
  - 認識結果を TextProcessor へ送信し、リクエスト/レスポンスを text channel 向けに出力する
  - 合成音声をフレーム分割し、RTC返却用キューへ格納する
  - 障害時にパイプラインを安全停止し、必要に応じて再接続可能である
- 優先度（Must/Should/Could）:
  - Must: 中継、キュー連携、停止制御
  - Should: Consul経由のサービス解決
  - Could: 詳細メトリクス可視化

### 5.2 非機能要件

- 性能: deque による低オーバーヘッド中継
- 可用性: 個別スレッド異常時に全停止し不整合を回避
- スケーラビリティ: セッションごとにAudioBrokerが独立
- セキュリティ: サービス間は内部ネットワークWS通信を前提
- 運用性/保守性: 役割別Threadクラスで責務分割
- 監視性: セッションID付きロギング

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - コア: `AudioBroker`, `AudioBrokerCommunicator(s)`
  - Sender: `ExtractorSenderThread`, `RecognizerSenderThread`, `TextProcessorSenderThread`, `SynthesizerSenderThread`
  - Receiver: `ExtractorReceiverThread`, `RecognizerReceiverThread`, `TextProcessorReceiverThread`, `SynthesizerReceiverThread`
  - 例外: `AudioBrokerError`
- 責務分割:
  - `AudioBroker`: 接続確立、worker解決、キュー管理、停止制御
  - SenderThread群: 上流dequeから取り出してws送信
  - ReceiverThread群: ws受信して下流dequeへ格納
  - `SynthesizerReceiverThread`: 合成音声をRTCフレーム長へ再分割
- 外部依存:
  - `websockets.sync`, `sincro_models`, `sincro_config`, `av`
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/backend_audio_broker_pipeline.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `AudioBroker.connect()`: 4 worker接続を初期化、失敗時はチャット向けエラーを積む
  - `AudioBroker.add_frame()`: 入力フレームを `frame_buffer` に投入し、過剰時に古いフレームを破棄
  - `AudioBroker.__get_worker()`: Consulから解決し、失敗時は fallback host/port を使用
  - `SynthesizerReceiverThread.__voice_splitter()`: 音声を target sample rate/size に変換し `VoiceSynthesizerResultFrame` 化
- 主要クラス/モジュールと対応ファイル:
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/AudioBroker.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/*SenderThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/*ReceiverThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/VoiceTransformTrack.py`
- 変更時に同時確認が必要なファイル:
  - キュー型/payload変更: AudioBroker各Thread と `sincro-models` の型定義
  - text/telop送信変更: `VoiceTransformTrack.py` と frontend `RTCTalkClient.ts`
  - talk_mode仕様変更: `RTCSessionOffer.py` / `AudioBroker.py` / TextProcessor endpoint

### 7.2 データ設計

- 主要データ構造:
  - 内部deque:
    - `__frame_buffer` (bytes, maxlen=50)
    - `__extractor_results` (SpeechExtractorResult, maxlen=10)
    - `__recognizer_results` (SpeechRecognizerResult, maxlen=10)
    - `__text_processor_results` (TextProcessorResult, maxlen=10)
    - `text_channel_queue` (ChatMessage系)
    - `voice_frame_queue` (VoiceSynthesizerResultFrame)
  - `return_frame_format`: `{"sample_rate": ..., "sample_size": ...}`
- 永続化対象:
  - なし（全てセッションメモリ）
- スキーマ/モデル:
  - `sincro_models` の msgpack model群（SpeechExtractor/Recognizer/TextProcessor/VoiceSynthesizer）
- バージョニング方針:
  - model変更時は send/recv 両Threadと VoiceTransformTrack を同時更新

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - SpeechExtractor:
    - `ws://{host}:{port}/api/v1/SpeechExtractor/extract?max_silence_ms={...}`
  - SpeechRecognizer:
    - `ws://{host}:{port}/api/v1/SpeechRecognizer/recognize`
  - TextProcessor:
    - `ws://{host}:{port}/api/v1/TextProcessor/{talk_mode}`
  - VoiceSynthesizer:
    - `ws://{host}:{port}/api/v1/VoiceSynthesizer/synthesize`
- リクエスト仕様:
  - Extractor初期化時 `SpeechExtractorInitializeRequest`
  - 以後 msgpackバイナリを継続送受信
- レスポンス仕様:
  - 各サービスから msgpack model を受信し、対応dequeへ格納
- エラー仕様:
  - 接続失敗/例外時は `AudioBrokerError` として扱い、`running.clear()` で停止
  - `__err_to_chat()` で `message_type="error"` を `text_channel_queue` に投入
- タイムアウト/リトライ方針:
  - recv は timeout=5秒でポーリング継続
  - `connect()` は10秒未満の連続再接続を抑止

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - `VoiceTransformTrack` 生成時に `AudioBroker.connect()`
  - `add_frame()` -> Extractor -> Recognizer -> TextProcessor -> Synthesizer
  - Textは `text_channel_queue`、音声は `voice_frame_queue` に集約
  - `VoiceTransformTrack.recv()` がキューを読み出してRTCへ返送
- 異常系フロー:
  - いずれかのThread例外/切断 -> `running.clear()` -> 全体停止
  - `VoiceTransformTrack.recv()` で非稼働検知 -> `connect()` 再試行 + ダミーフレーム返却
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: `documents/design/networking_websocket.md` と統合

## 8. 設定・デプロイ

- 環境変数:
  - 直接は `sincro-rtc` 側設定を利用（Consul/Fallback関連）
  - `SINCRO_RTC_FALLBACK_HOST`, `SINCRO_RTC_FALLBACK_PORT`
  - `SINCRO_CONSUL_AGENT_HOST`, `SINCRO_CONSUL_AGENT_PORT`
- 設定ファイル:
  - `examples/compose.env`, `compose/*.yml`
- 起動方法:
  - AudioBroker単体起動なし（RTCセッション起動時にインスタンス化）
- デプロイ/ローカル実行手順:
  - `sincro-rtc` と下流4サービスを同一ネットワークで起動
- 互換性に影響する設定変更:
  - 下流サービスのエンドポイントパス変更は接続不可の原因になる

## 9. 監視・運用

- ログ設計:
  - 各Threadは `session_id` 付きloggerで開始/終了/例外を出力
- メトリクス:
  - 専用メトリクス未実装（必要時はキュー長/遅延の計測追加）
- 障害時の切り分け手順:
  - 1. Consul解決失敗かfallback設定不備かを確認
  - 2. どのThreadが `running.clear()` を引いたかログ確認
  - 3. `text_channel_queue` と `voice_frame_queue` の枯渇/滞留を確認
  - 4. `VoiceTransformTrack.recv()` がダミーフレーム返却に落ちていないか確認
- よくある失敗と対処:
  - 下流WSの接続拒否 -> composeネットワーク/サービス起動順を確認
  - Extractor遅延で `frame_buffer` overflow -> モデル性能またはバッファ戦略見直し

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 内部ネットワーク通信前提で追加認証は未実装
- 秘密情報の扱い:
  - AudioBroker自体は秘密情報を保持しない
- 入力検証:
  - msgpackデコード時に型不整合は例外で停止
- 脅威と対策:
  - 破損データ/接続断に対して fail-fast で全停止し、上位で再接続
- 監査ログ（必要な場合のみ）:
  - 監査専用ログなし

## 11. テスト方針

- テスト観点:
  - 各段の送受信、キュー連結、停止/再接続、音声分割
- 単体テスト:
  - `AudioBrokerTest.py`（必要に応じて拡張）
- 結合テスト:
  - 4サービス接続下で text/telop/audio の連続性を確認
- E2Eテスト:
  - frontend接続で発話から応答音声再生まで確認
- 負荷テスト（必要な場合のみ）:
  - 長時間接続でキュー滞留・メモリ増加の観測
- 受け入れ条件:
  - 音声入力から text/telop/audio 出力まで一連で継続動作する

## 12. 既知課題・リスク

- 既知課題:
  - 複数dequeのバックプレッシャ制御は限定的
  - sender thread のping条件などチューニング余地あり
- 技術的負債:
  - スレッドベース設計のデバッグ難易度が高い
- リスク一覧:
  - 下流のいずれか1つ不調で全パイプライン停止
  - 高遅延時に古い音声の破棄が増える
- 軽減策:
  - 再接続ロジック維持、ログ強化、必要に応じてバッファ戦略再設計

## 13. 代替案と設計判断

- 検討した代替案:
  - asyncioベースの単一イベントループ構成
  - メッセージブローカ（Redis/NATS）を介した非同期連携
- 採用しなかった理由:
  - 現行実装との移行コストが高く、まずはスレッド構成で運用可能
- 最終判断:
  - セッション局所化を重視し、現在はスレッド + deque パイプラインを採用

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/backend_sincro_rtc.md`
  - `documents/design/networking_websocket.md`
- 参照実装:
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/AudioBroker.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/ExtractorSenderThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/TextProcessorReceiverThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/AudioBroker/SynthesizerReceiverThread.py`
  - `sincromisor-server/sincro-rtc/src/sincro_rtc/RTCSession/VoiceTransformTrack.py`
- 外部リンク:
  - https://websockets.readthedocs.io/
