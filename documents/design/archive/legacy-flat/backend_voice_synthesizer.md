# Backend Voice Synthesizer 設計

Sincromisor の Voice Synthesizer サービス（応答テキストから音声生成）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_voice_synthesizer.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
    - TextProcessor結果から音声データとモーラ情報を生成し返却する
    - Redis/S3キャッシュで同一文の再生成コストを削減する
- 対象範囲:
    - `VoiceSynthesizerProcess.py`
    - `VoiceSynthesizerWorker.py`
    - `VoiceCacheManager.py`, `VoiceSynthesizer.py`, `VoiceVox.py`
- 非対象範囲:
    - フロント側での音声フレーム再分割（AudioBroker側）
- LLM向け要約（3-5行）:
    - Voice Synthesizer は `TextProcessorResult.voice_text` を入力に `VoiceSynthesizerResult` を返す。
    - 生成順は Redis -> S3 -> VoiceVox API のキャッシュ優先。
    - VoiceVoxクエリから `mora_queue` を抽出し、口形同期用情報として返す。
    - 音声は既定で `audio/ogg;codecs=opus` にエンコードされる。

## 3. 背景

- 解決したい課題:
    - 応答テキストを低遅延に音声化し、同時に口パク同期情報も返す
- 現状の問題点:
    - VoiceVoxへの直接依存は遅延増加要因になる
- 採用理由:
    - キャッシュ（Redis/S3）で再利用率を高める設計
- 制約条件:
    - VoiceVox/Redis/S3 workerが必要
    - `fdkaac`/`opusenc` コマンド依存（形式による）

## 4. 用語・略語

| 用語       | 定義                                         |
| ---------- | -------------------------------------------- |
| mora_queue | 発話タイミング付きモーラ列（母音/長さ/文字） |
| voice_text | TextProcessorが渡す読み上げ対象テキスト      |
| cache miss | Redis/S3に無くVoiceVox生成に進む状態         |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
    - `TextProcessorResult` を受信し、`voice_text` がある場合に音声生成する
    - `VoiceSynthesizerResult` をmsgpackで返せること
    - Redis/S3キャッシュを利用できること
    - `mora_queue` を生成できること
- 優先度（Must/Should/Could）:
    - Must: 音声生成、結果返却、キャッシュ利用
    - Should: 複数エンコード対応（aac/opus/wav）
    - Could: 音声スタイル動的切替

### 5.2 非機能要件

- 性能: キャッシュヒットで生成時間を短縮
- 可用性: cache失敗時でも生成処理を継続
- スケーラビリティ: worker増設可能
- セキュリティ: S3キー管理が必要
- 運用性/保守性: VoiceVox APIラッパ分離
- 監視性: query_time / speaking_timeログ

## 6. アーキテクチャ概要

- コンポーネント一覧:
    - Process: `VoiceSynthesizerProcess`
    - Worker: `VoiceSynthesizerWorker`
    - Cache: `VoiceCacheManager`
    - Synthesis core: `VoiceSynthesizer` -> `VoiceVox`
- 責務分割:
    - Process: 接続管理、Service Discovery、worker初期化
    - Worker: request受信、voice_text判定、結果送信
    - CacheManager: Redis/S3 read-through/write-through
    - Synthesis: VoiceVox query+encode+mora抽出
- 外部依存:
    - `voicevox_engine`, `redis`, `S3`, `sincro-models`
- 全体図（必要なら図リンク）:
    - TODO: `documents/design/assets/backend_voice_synthesizer_flow.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
    - `VoiceSynthesizerProcess`: `/synthesize` endpoint提供、依存worker解決
    - `VoiceSynthesizerWorker.communicate()`: TextProcessorResult受信、voice_textごとに生成
    - `VoiceCacheManager.get_voice()`: Redis->S3->生成の順で取得
    - `VoiceSynthesizer.generate()`: VoiceVox query生成、mora抽出、音声エンコード
- 主要クラス/モジュールと対応ファイル:
    - `sincromisor-server/voice-synthesizer/VoiceSynthesizerProcess.py`
    - `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizerWorker.py`
    - `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py`
    - `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceSynthesizer.py`
- 変更時に同時確認が必要なファイル:
    - result仕様変更: `VoiceSynthesizerResult.py` と `SynthesizerReceiverThread.py`
    - request仕様変更: `TextProcessorResult.py` と `SynthesizerSenderThread.py`
    - cache key変更: `VoiceSynthesizerRequest.py` と既存キャッシュ運用

### 7.2 データ設計

- 主要データ構造:
    - 入力: `TextProcessorResult` (`voice_text`)
    - 生成要求: `VoiceSynthesizerRequest`
    - 出力: `VoiceSynthesizerResult` (`voice`, `audio_format`, `mora_queue`)
- 永続化対象:
    - Redis（TTL 7日）
    - S3 bucket `voice-synthesizer`
- スキーマ/モデル:
    - `sincro-models` の VoiceSynthesizer系モデル
- バージョニング方針:
    - AudioBrokerの復号/分割互換を維持

### 7.3 インターフェース設計

- エンドポイント/チャネル:
    - `GET /api/v1/VoiceSynthesizer/statuses`
    - `WS /api/v1/VoiceSynthesizer/synthesize`
- リクエスト仕様:
    - `TextProcessorResult` (msgpack)
- レスポンス仕様:
    - `VoiceSynthesizerResult` (msgpack)
- エラー仕様:
    - 依存worker未検出でRuntimeError
    - Cache書込失敗はログのみ（生成継続）
- タイムアウト/リトライ方針:
    - サーバー側積極再試行なし

### 7.4 状態遷移・シーケンス

- 正常系フロー:
    - TextProcessorResult受信 -> voice_text判定 -> get_voice
    - Redis/S3ヒット時は即返却
    - Miss時はVoiceVox生成 -> キャッシュ保存 -> 返却
- 異常系フロー:
    - VoiceVox/依存サービス接続失敗 -> 例外ログ -> セッション終了
    - キャッシュI/O失敗 -> ログ出力し継続可能
- 状態遷移図/シーケンス図（必要なら図リンク）:
    - `documents/design/networking_websocket.md` 参照

## 8. 設定・デプロイ

- 環境変数:
    - `SINCRO_SYNTHESIZER_HOST`, `SINCRO_SYNTHESIZER_PORT`
    - `SINCRO_SYNTHESIZER_PUBLIC_BIND_HOST`, `SINCRO_SYNTHESIZER_PUBLIC_BIND_PORT`
    - `SINCRO_SYNTHESIZER_VOICEVOX_DEFAULT_STYLE_ID`
    - `SINCRO_S3_ACCESS_KEY`, `SINCRO_S3_SECRET_KEY`
- 設定ファイル:
    - `compose/voice-synthesizer.yml`
    - `examples/compose.env`
- 起動方法:
    - `uv run voice-synthesizer/VoiceSynthesizerProcess.py`
- デプロイ/ローカル実行手順:
    - `docker compose --profile backend up -d voice-synthesizer sincro-voicevox`
- 互換性に影響する設定変更:
    - `audio_format` 仕様
    - style_idやVoiceVox API互換

## 9. 監視・運用

- ログ設計:
    - request/response、query_time、speaking_time、cache hit/miss
- メトリクス:
    - `/statuses` sessions
- 障害時の切り分け手順:
    -   1. VoiceSynthesizer `/statuses` 疎通
    -   2. VoiceVox `/version` 疎通
    -   3. Redis/S3接続確認
    -   4. `voice_text` が届いているか確認
- よくある失敗と対処:
    - S3バケット未作成 -> initializer確認
    - encoderコマンド不足 -> コンテナ依存確認

## 10. セキュリティ/コンプライアンス

- 認証/認可:
    - 内部接続前提で未実装
- 秘密情報の扱い:
    - S3アクセスキーを環境変数で管理
- 入力検証:
    - msgpack復元時型チェック
- 脅威と対策:
    - 依存サービス障害時はfail-fast
- 監査ログ（必要な場合のみ）:
    - 未実装

## 11. テスト方針

- テスト観点:
    - cache hit/miss、音声形式、mora抽出、voice_text空時挙動
- 単体テスト:
    - キャッシュキー・生成ロジック（必要時）
- 結合テスト:
    - TextProcessor->VoiceSynthesizer->AudioBroker経路確認
- E2Eテスト:
    - フロントで音声再生とテロップ同期確認
- 負荷テスト（必要な場合のみ）:
    - 同一テキスト連続時のキャッシュ効果確認
- 受け入れ条件:
    - `VoiceSynthesizerResult` が返り音声再生できる

## 12. 既知課題・リスク

- 既知課題:
    - VoiceVox応答遅延が会話遅延に直結
- 技術的負債:
    - エンコード処理が外部コマンド依存
- リスク一覧:
    - キャッシュキー変更でヒット率低下
    - 外部依存停止で無音応答増加
- 軽減策:
    - キャッシュ監視、依存サービスヘルス監視

## 13. 代替案と設計判断

- 検討した代替案:
    - キャッシュなし都度生成
- 採用しなかった理由:
    - 同一フレーズ再利用時に遅延/負荷が大きい
- 最終判断:
    - Redis+S3の二段キャッシュを採用

## 14. 変更履歴

| 日付       | 変更内容 |
| ---------- | -------- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
    - `documents/design/networking_websocket.md`
    - `documents/design/backend_text_processor.md`
- 参照実装:
    - `sincromisor-server/voice-synthesizer/VoiceSynthesizerProcess.py`
    - `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py`
    - `sincromisor-server/sincro-models/src/sincro_models/VoiceSynthesizerResult.py`
