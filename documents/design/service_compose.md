# Service Docker Compose 設計

Sincromisor のローカル/サーバー起動に利用する Docker Compose 構成の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/service_compose.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
  - Compose構成の責務、起動順、profile運用を明文化し、環境差分による起動失敗を減らす
- 対象範囲:
  - ルート `compose.yml`
  - `compose/*.yml` の各サービス定義
  - `.env`（`examples/compose.env`）で注入される主要パラメータ
- 非対象範囲:
  - 各サービス実装の内部ロジック
  - Kubernetes等の別オーケストレーション
- LLM向け要約（3-5行）:
  - ルート `compose.yml` は複数の compose ファイルを `include` で束ねる構成。
  - 基本運用は `--profile full` で全サービス起動、用途別に `frontend` / `backend` / `rtc` / `external` / `s3` を使い分ける。
  - `service-initializer` がモデルキャッシュ準備や設定前提を整え、主要サービスが依存する。
  - 各サービスは healthcheck と `depends_on.condition` を使って段階起動する。

## 3. 背景

- 解決したい課題:
  - 多数のマイクロサービスを再現可能な手順で一括起動する
- 現状の問題点:
  - 依存が多く、手動順序起動だと失敗しやすい
- 採用理由:
  - Compose include + profile で単一ホストの運用と部分起動を両立できる
- 制約条件:
  - GPUを使う Speech Recognizer のため NVIDIA Container Toolkit 前提
  - `.env` 未設定時は起動・接続失敗が発生しやすい

## 4. 用語・略語

| 用語 | 定義 |
| --- | --- |
| profile | Composeで起動対象を絞るためのラベル |
| include | Composeファイル分割を束ねる機能 |
| service-initializer | 起動前準備（モデル/設定）を行う初期化コンテナ |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
  - `--profile full` で対話システム一式を起動できること
  - profile指定でfrontend/backend/rtc等の部分起動ができること
  - サービス間依存に従って自動的に起動順制御できること
  - healthcheck不通時に依存サービスの起動を抑制できること
- 優先度（Must/Should/Could）:
  - Must: 全体起動、依存制御、環境変数注入
  - Should: 部分起動（profile）
  - Could: 開発向け追加profileの拡張

### 5.2 非機能要件

- 性能: 単一ホストでも起動できる構成
- 可用性: restart_policy + healthcheckで自己回復を補助
- スケーラビリティ: サービスを別ホストへ分離可能（Consul前提）
- セキュリティ: 機密値は `.env` で注入
- 運用性/保守性: composeファイルを機能単位で分割
- 監視性: 各サービスhealthcheckを標準化

## 6. アーキテクチャ概要

- コンポーネント一覧:
  - ルート:
    - `compose.yml`（include集約）
  - 主要composeファイル:
    - `compose/initializer.yml`
    - `compose/frontend.yml`
    - `compose/sincro-rtc.yml`
    - `compose/speech-extractor.yml`
    - `compose/speech-recognizer.yml`
    - `compose/text-processor.yml`
    - `compose/voice-synthesizer.yml`
    - `compose/consul-server.yml`
    - `compose/s3.yml`
    - `compose/redis.yml`
- 責務分割:
  - frontend: Caddy配信とUI公開
  - rtc: WebRTCシグナリング
  - backend: 音声処理パイプライン
  - storage/external: Redis・SeaweedFS・Consul server
- 外部依存:
  - Docker Engine / Compose
  - NVIDIA runtime（Recognizer）
- 全体図（必要なら図リンク）:
  - TODO: `documents/design/assets/service_compose_topology.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
  - `service-initializer`:
    - S3 alias設定、認識モデルキャッシュ準備
    - 他サービスの起動前提整備
  - `sincro-frontend`:
    - 80/443公開、Frontend health endpoint提供
  - `sincro-rtc`:
    - 8001公開、Offer/Answer入口
  - `speech-extractor`:
    - 8002公開、VAD抽出
  - `speech-recognizer`:
    - 8003公開、ASR（GPU）
  - `text-processor`:
    - 8004公開、応答生成
  - `voice-synthesizer` + `sincro-voicevox`:
    - 8005/50021公開、TTS生成
  - `sincro-s3`（SeaweedFS）:
    - S3 API提供、bootstrapでバケット初期化
  - `sincro-redis`:
    - 音声キャッシュ
  - `sincro-consul-server`:
    - Service Discovery基盤
- 主要クラス/モジュールと対応ファイル:
  - `compose.yml`
  - `compose/*.yml`
  - `examples/compose.env`
  - `Docker/service-initializer/initialize.sh`
- 変更時に同時確認が必要なファイル:
  - 環境変数追加: `examples/compose.env` と該当 `compose/*.yml` と実装側Argument
  - ポート変更: compose定義と参照側URL/healthcheck
  - profile変更: README手順と運用手順

### 7.2 データ設計

- 主要データ構造:
  - `.env` パラメータ群（host/port, secret, model選択）
  - volume:
    - `../volumes/sincro-cache`（モデル/キャッシュ）
    - Consul agent/server data volumes
    - SeaweedFS data volume
- 永続化対象:
  - Redisデータ（コンテナ管理）
  - SeaweedFSデータ（`sincro-s3-data`）
  - Consul state（各data volume）
- スキーマ/モデル:
  - Compose YAML schema準拠
- バージョニング方針:
  - Composeファイルと `examples/compose.env` を同時更新

### 7.3 インターフェース設計

- エンドポイント/チャネル:
  - frontend: `8086->80`, `8443->443`
  - rtc: `8001`
  - extractor/recognizer/processor/synthesizer: `8002-8005`
  - voicevox: `50021`
  - redis: `6379`
  - s3: `${SINCRO_S3_PUBLIC_BIND_PORT}`（既定8333）
  - consul: `8500`, DNS `8600`
- リクエスト仕様:
  - 各serviceのhealthcheck endpointへHTTP/TCPアクセス
- レスポンス仕様:
  - healthcheck成功時に `depends_on` 条件を満たす
- エラー仕様:
  - healthcheck失敗で依存サービス起動が待機/失敗
- タイムアウト/リトライ方針:
  - サービスごとに `interval`, `timeout`, `retries` を設定

### 7.4 状態遷移・シーケンス

- 正常系フロー:
  - 1. Consul/S3/Redisなど基盤起動
  - 2. `service-initializer` 完了
  - 3. backend/frontend/rtc が順次起動
  - 4. healthcheck passing 後に全体利用可能
- 異常系フロー:
  - 初期化失敗（initializer） -> 依存サービス起動不可
  - 認識モデル未取得/GPU未設定 -> recognizer不健康
  - S3/Redis不通 -> 合成/ログ機能の一部不全
- 状態遷移図/シーケンス図（必要なら図リンク）:
  - TODO: 起動依存図を追加

## 8. 設定・デプロイ

- 環境変数:
  - `SINCRO_*` 一式（`examples/compose.env`）
- 設定ファイル:
  - `compose.yml`
  - `compose/*.yml`
  - `.env`（コピー元: `examples/compose.env`）
- 起動方法:
  - `cp examples/compose.env .env`
  - `chmod 600 .env`
  - `docker compose --profile full up -d`
- デプロイ/ローカル実行手順:
  - backendのみ: `docker compose --profile backend up -d`
  - frontendのみ: `docker compose --profile frontend up -d`
  - rtcのみ: `docker compose --profile rtc up -d`
- 互換性に影響する設定変更:
  - `SINCRO_RECOGNIZER_MODEL`（nemo/nue）
  - `*_PUBLIC_BIND_HOST/PORT`
  - S3/Redis/Consul接続情報

## 9. 監視・運用

- ログ設計:
  - `docker compose logs -f <service>` でサービス別確認
- メトリクス:
  - healthcheck状態
  - Consul登録状態
- 障害時の切り分け手順:
  - 1. `docker compose ps` でunhealthy/exit確認
  - 2. 依存先（Consul/S3/Redis/VoiceVox）から順に疎通確認
  - 3. `service-initializer` 成否確認
  - 4. 該当サービスの環境変数注入値確認
- よくある失敗と対処:
  - `.env` 未作成/不整合 -> `examples/compose.env` から再生成
  - GPUランタイム未設定 -> recognizer起動失敗
  - profile誤指定 -> 必要サービスが起動していない

## 10. セキュリティ/コンプライアンス

- 認証/認可:
  - 内部通信中心、公開ポートは最小化推奨
- 秘密情報の扱い:
  - `SINCRO_S3_SECRET_KEY` などは `.env` 管理
- 入力検証:
  - Composeレイヤでは限定的
- 脅威と対策:
  - 不要ポート公開を避ける
  - profileで不要サービスを起動しない
- 監査ログ（必要な場合のみ）:
  - 未実装

## 11. テスト方針

- テスト観点:
  - full起動成功、profile別起動、healthcheck連鎖、依存順序
- 単体テスト:
  - compose定義単体テストは未整備
- 結合テスト:
  - full構成で会話成立を確認
- E2Eテスト:
  - ブラウザ接続から音声往復確認
- 負荷テスト（必要な場合のみ）:
  - 同時セッションでコンテナ資源/再起動挙動確認
- 受け入れ条件:
  - `--profile full` で主要機能が利用可能

## 12. 既知課題・リスク

- 既知課題:
  - composeファイル数が多く、設定変更の波及が広い
- 技術的負債:
  - profile依存関係の可視化が不足
- リスク一覧:
  - 環境変数不整合で接続失敗
  - healthcheck閾値不適切で起動遅延/誤判定
- 軽減策:
  - `examples/compose.env` を唯一の雛形として維持
  - 変更時に設計文書とREADMEを同時更新

## 13. 代替案と設計判断

- 検討した代替案:
  - 単一巨大composeへの統合
  - 別オーケストレーション（Kubernetes）
- 採用しなかった理由:
  - 現在はローカル再現性と開発速度を優先
- 最終判断:
  - include + profile で分割管理を継続

## 14. 変更履歴

| 日付 | 変更内容 |
| --- | --- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
  - `documents/design/service_consul.md`
  - `documents/design/backend_storage.md`
- 参照実装:
  - `compose.yml`
  - `compose/initializer.yml`
  - `compose/frontend.yml`
  - `compose/sincro-rtc.yml`
  - `compose/s3.yml`
  - `examples/compose.env`
