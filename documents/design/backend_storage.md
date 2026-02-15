# Backend Storage 設計

Sincromisor のバックエンドで利用するストレージ基盤（Redis / SeaweedFS S3）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/backend_storage.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - 音声対話パイプラインで必要なキャッシュ/永続保存を整理し、運用時の整合性を担保する
- 対象範囲:
  - Redis (`SincroRedis`)
  - SeaweedFS S3 (`SincroS3`)
  - バケット初期化・資格情報設定（`s3-bootstrap`, `service-initializer`）
  - 利用サービス（Speech Recognizer, Voice Synthesizer）
- 非対象範囲:
  - 各マイクロサービスの推論ロジック詳細
  - ストレージ以外のService Discovery全般
- LLM向け要約（3-5行）:
  - Redis は Voice Synthesizer の短期キャッシュとして利用される（TTL 7日）。
  - SeaweedFS S3 は `speech-recognizer` と `voice-synthesizer` バケットを持ち、結果ログ/音声キャッシュを保存する。
  - 起動時に `s3-bootstrap` がバケットとアクセスキー設定を idempotent に適用する。
  - Speech Recognizer は確定発話ログを S3 へ保存し、Voice Synthesizer は Redis→S3→生成の順で音声を取得する。

## 3. 背景

- 解決したい課題:
  - 音声生成の再利用を高速化し、認識ログを長期保存できるようにする
- 現状の問題点:
  - 外部依存（S3/Redis）障害時に応答遅延やログ欠損のリスクがある
- 採用理由:
  - Redisで低遅延キャッシュ、S3互換ストレージで永続化という役割分担が明確
- 制約条件:
  - S3実体はSeaweedFSを採用（MinIOは廃止予定）
  - S3アクセスキー/シークレット設定が全体依存

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| SincroRedis | 音声合成結果の短期キャッシュ用Redisサービス |
| SincroS3 | SeaweedFS S3ゲートウェイをConsul登録したサービス名 |
| read-through cache | Redisミス時にS3/生成へフォールバックする方式 |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - Redisが音声キャッシュを読み書きできること
  - S3バケット `speech-recognizer`, `voice-synthesizer` が利用可能であること
  - S3認証情報が初期化時に反映されること
  - StorageサービスがConsul経由で解決できること
- 優先度（Must/Should/Could）:
  - Must: Redis/S3疎通、バケット作成、認証設定
  - Should: ヘルス連動のConsul登録更新
  - Could: メトリクス集約・ライフサイクル管理自動化

### 5.2 非機能要件

- 性能: 直近音声はRedisヒットで低遅延返却
- 可用性: S3/Redis片系障害時も可能な範囲で処理継続
- スケーラビリティ: SeaweedFS/Redisを個別に拡張可能
- セキュリティ: S3鍵は環境変数注入で管理
- 運用性/保守性: composeで独立運用可能（`backend` / `s3` / `external` profile）
- 監視性: Healthcheck + Consul登録状態で確認

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - Redis: `compose/redis.yml` (`sincro-redis`)
  - SeaweedFS: `compose/s3.yml` (`seaweed-master`, `seaweed-volume`, `seaweed-filer`, `sincro-s3`)
  - Bootstrap: `s3-bootstrap`, `service-initializer`
  - 利用側:
    - Speech Recognizer (`SpeechRecognizerS3Client`)
    - Voice Synthesizer (`VoiceCacheManager`)
- 責務分割:
  - Redis: 短期キャッシュ
  - S3: 永続保存と共有キャッシュ
  - Bootstrap: バケット/認証設定を起動時に保証
- 外部依存:
  - Consul（サービス登録）
  - boto3/redisクライアント（アプリ側）
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/backend_storage_overview.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `sincro-redis`:
    - Consulへ `SincroRedis` 登録（`Docker/redis/start-redis.sh`）
    - 音声キャッシュKVを保持
  - `sincro-s3`(SeaweedFS S3):
    - S3互換APIを提供
    - `consul-s3-registrar` がヘルス連動登録
  - `s3-bootstrap`:
    - バケット作成（idempotent）
    - access key / secret key / bucket policy の適用
  - `service-initializer`:
    - 初期化時にS3 alias設定、モデルキャッシュ準備
- 主要クラス/モジュールと対応ファイル:
  - `compose/s3.yml`
  - `compose/redis.yml`
  - `Docker/seaweedfs/s3-bootstrap.sh`
  - `Docker/redis/start-redis.sh`
  - `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py`
  - `sincromisor-server/speech-recognizer*/.../SpeechRecognizerS3Client.py`
- 変更時に同時確認が必要なファイル:
  - バケット名変更: `s3-bootstrap.sh` と各S3クライアント
  - S3認証情報変更: `examples/compose.env` と各サービス引数
  - Service名変更 (`SincroS3`, `SincroRedis`): Consul登録設定と `ServiceDiscoveryReferrer` 利用箇所

### 7.2 データ設計

- 主要データ構造:
  - Redis key:
    - `VoiceSynthesizerRequest.redis_key()`
    - 形式: `<audio_format>/<style_id>/<sha256(message)>`
  - S3 key:
    - 音声キャッシュ: `VoiceSynthesizerRequest.s3_key()`
    - 認識ログ: `<session_id>/<speech_id>_<timestamp>.json/.opus`
  - S3 bucket:
    - `voice-synthesizer`
    - `speech-recognizer`
- 永続化対象:
  - Speech Recognizer結果JSON/音声（S3）
  - Voice Synthesizer音声キャッシュ（Redis+S3）
- スキーマ/モデル:
  - `VoiceSynthesizerResult` msgpack
  - `SpeechRecognizerResult` JSON/msgpack
- バージョニング方針:
  - key設計変更時はキャッシュ破棄方針を同時に定義

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - Redis: TCP `6379`
  - S3: HTTP `:${SINCRO_S3_PUBLIC_BIND_PORT}`（デフォルト 8333）
  - SeaweedFS health:
    - `http://sincro-s3:<port>/status`
- リクエスト仕様:
  - S3 API（boto3, path-style）
  - Redis GET/SET (`SET ... EX 604800`)
- レスポンス仕様:
  - Redisヒット: `VoiceSynthesizerResult` msgpack bytes
  - S3ヒット: 同上を `get_object` で取得
- エラー仕様:
  - Redis/S3書込失敗はログ出力（処理継続）
  - Storage未発見時は利用サービス側でRuntimeError
- タイムアウト/リトライ方針:
  - クライアント側明示リトライは限定的（上位再接続に委譲）

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - 起動時 `s3-bootstrap` がバケット/鍵を整備
  - VoiceSynthesizer:
    - Redis GET -> missならS3 GET -> missならVoiceVox生成
    - 生成結果をRedis/S3へ保存
  - SpeechRecognizer:
    - confirmed時にS3へJSON/音声保存
- 異常系フロー:
  - S3到達不可 -> 保存失敗ログ（認識/会話は継続可能）
  - Redis到達不可 -> S3/生成へフォールバック
  - S3鍵不一致 -> bootstrapが失敗終了（`ALLOW_SECRET_ROTATION=0`）
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - `documents/design/networking_websocket.md` と合わせて参照

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_REDIS_HOST`, `SINCRO_REDIS_PORT`
  - `SINCRO_S3_PUBLIC_BIND_HOST`, `SINCRO_S3_PUBLIC_BIND_PORT`
  - `SINCRO_S3_ACCESS_KEY`, `SINCRO_S3_SECRET_KEY`
- 設定ファイル:
  - `compose/s3.yml`
  - `compose/redis.yml`
  - `examples/compose.env`
- 起動方法:
  - `docker compose --profile backend up -d sincro-redis sincro-s3`
- デプロイ/ローカル実行手順:
  - `docker compose --profile full up -d`（bootstrap含む）
- 互換性に影響する設定変更:
  - S3キー/バケット名変更
  - Service Discovery名変更

## 9. 監視・運用

- ログ設計:
  - Redis/S3登録・ヘルス・bootstrap結果をログ化
  - アプリ側はhit/missと保存失敗をログ化
- メトリクス:
  - Redis `PING` healthcheck
  - S3 `/status` healthcheck
  - SeaweedFS metrics port（9324-9327）
- 障害時の切り分け手順:
  - 1. `docker compose ps` で `sincro-redis` / `sincro-s3` 状態確認
  - 2. Consulで `SincroRedis` / `SincroS3` 登録確認
  - 3. S3バケット存在確認（`speech-recognizer`, `voice-synthesizer`）
  - 4. アプリログで Redis/S3 hit/miss と例外確認
- よくある失敗と対処:
  - S3鍵不一致 -> `ALLOW_SECRET_ROTATION` 方針確認
  - バケット未作成 -> `s3-bootstrap` 実行結果確認
  - Redis未登録 -> `start-redis.sh` と Consul agent確認

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - S3はアクセスキー/シークレットで保護
  - Redisは内部ネットワーク運用を前提
- 秘密情報の扱い:
  - `SINCRO_S3_SECRET_KEY` を環境変数で注入
- 入力検証:
  - ストレージ層はアプリ側モデル検証に依存
- 脅威と対策:
  - 誤った鍵での上書き事故を `ALLOW_SECRET_ROTATION=0` で防止
- 監査ログ（必要な場合のみ）:
  - 専用監査ログは未実装

## 11. テスト方針

- テスト観点:
  - バケット初期化、Redis/S3読み書き、cacheヒット/ミス
- 単体テスト:
  - `VoiceCacheManager` のkey生成と取得順序検証（必要時）
- 結合テスト:
  - VoiceSynthesizer / SpeechRecognizer からの実ストレージ書込み確認
- E2Eテスト:
  - 音声会話後にS3オブジェクト生成と再発話キャッシュヒットを確認
- 負荷テスト（必要な場合のみ）:
  - 同一文反復でキャッシュ効率と応答時間を計測
- 受け入れ条件:
  - 4サービス連携時にStorage未起因で会話が継続する

## 12. 既知課題・リスク

- 既知課題:
  - Redis冗長化やS3ライフサイクル管理は未整備
- 技術的負債:
  - ストレージメトリクス統合が不十分
- リスク一覧:
  - S3/Redis障害時に応答遅延・ログ欠損
  - key設計変更時のキャッシュ互換性喪失
- 軽減策:
  - bootstrapのidempotent運用
  - hit/missログ監視と障害時フォールバック運用

## 13. 代替案と設計判断

- 検討した代替案:
  - MinIO構成の継続
- 採用しなかった理由:
  - SeaweedFSベースへ移行方針
- 最終判断:
  - Redis（短期）+ SeaweedFS S3（永続）の2層構成を採用

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/backend_voice_synthesizer.md`
  - `documents/design/backend_speech_recognizer.md`
  - `documents/design/service_compose.md`
- 参照実装:
  - `compose/s3.yml`
  - `compose/redis.yml`
  - `Docker/seaweedfs/s3-bootstrap.sh`
  - `sincromisor-server/voice-synthesizer/src/voice_synthesizer/VoiceSynthesizer/VoiceCacheManager.py`
  - `sincromisor-server/speech-recognizer/src/speech_recognizer/SpeechRecognizer/SpeechRecognizerS3Client.py`
