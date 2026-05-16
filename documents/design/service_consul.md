# Service Consul 設計

Sincromisor における Service Discovery 基盤（Consul server / agent / 登録・参照方式）の設計文書。

## 1. 文書情報

- ドキュメントパス: `documents/design/service_consul.md`
- 作成日: 2026-02-15
- 最終更新日: 2026-02-15
- ステータス: Active

## 2. 目的とスコープ

- 目的:
    - 各マイクロサービスの到達先解決をConsulで一元化し、疎結合な接続を実現する
- 対象範囲:
    - Consul server/agent構成
    - サービス登録方式（アプリ内登録 / スクリプト登録）
    - サービス参照方式（`ServiceDiscoveryReferrer`）
- 非対象範囲:
    - 個別サービスの業務ロジック詳細
    - Docker Compose全般（`service_compose.md`）
- LLM向け要約（3-5行）:
    - Consul serverは `compose/consul-server.yml` で起動し、各サービスは専用agent経由で登録される。
    - 登録方式は2種類あり、Pythonサービスは `ServiceDiscoveryReporter`、一部コンテナは `consul services register` スクリプトを使う。
    - 参照は `ServiceDiscoveryReferrer.get_random_worker()` で healthy service からランダム選択する。
    - 主要依存先（SpeechExtractor/Recognizer/TextProcessor/VoiceSynthesizer/S3/Redis/VoiceVox/Frontend/RTC）をDNS名で引ける前提で運用する。

## 3. 背景

- 解決したい課題:
    - サービス増減やIP変動に対して、固定アドレス依存を避ける
- 現状の問題点:
    - 登録方式が複数あり、運用時に追跡箇所が増える
- 採用理由:
    - Consulのヘルスチェック + DNS/API参照で動的解決が可能
- 制約条件:
    - 各サービスで `SINCRO_CONSUL_AGENT_HOST/PORT` 設定が必須
    - agent/server不通時は参照失敗となる

## 4. 用語・略語

| 用語                     | 定義                                                      |
| ------------------------ | --------------------------------------------------------- |
| Consul Server            | クラスタ情報とサービスカタログを保持する中心ノード        |
| Consul Agent             | 各サービス近傍で登録/ヘルスを中継するローカルエージェント |
| ServiceDiscoveryReporter | Pythonサービス側の自動登録スレッド                        |
| ServiceDiscoveryReferrer | Pythonサービス側の参照クライアント                        |

## 5. 要件

### 5.1 機能要件

- 要件一覧:
    - 各サービスがConsulへ登録されること
    - healthyなサービスのみ参照対象になること
    - サービス停止時にderegisterされること（明示または自動）
    - ランダム選択でワーカー分散できること
- 優先度（Must/Should/Could）:
    - Must: 登録/参照/ヘルス連動
    - Should: IP変更時の再登録
    - Could: タグベースのルーティング拡張

### 5.2 非機能要件

- 性能: 参照は軽量なConsul API呼び出しで実行
- 可用性: ヘルス失敗で自動除外（deregister）
- スケーラビリティ: 同一worker_type複数登録を想定
- セキュリティ: 内部ネットワーク運用前提
- 運用性/保守性: サービスごとにagent分離し影響局所化
- 監視性: healthcheck / bandog / Consul UI

## 6. アーキテクチャ概要

- コンポーネント一覧:
    - Consul server: `sincro-consul-server` (`compose/consul-server.yml`)
    - 監視補助: `bandog` (`Docker/consul/bandog.sh`)
    - 各サービスの `consul-agent-*`
    - 登録ライブラリ:
        - `sincro-config/ServiceDiscoveryReporter.py`
        - `Docker/common/service-register.sh`
    - 参照ライブラリ:
        - `sincro-config/ServiceDiscoveryReferrer.py`
- 責務分割:
    - Server: カタログ保持、DNS/API提供
    - Agent: 各サービス登録とヘルスチェック実行
    - Reporter/Script: サービス登録処理
    - Referrer: 下流サービス参照
- 外部依存:
    - `py-consul`, `consul` CLI, `nslookup`, `curl`
- 全体図（必要なら図リンク）:
    - TODO: `documents/design/assets/service_consul_overview.drawio`

## 7. 詳細設計

### 7.1 コンポーネント設計

- コンポーネントごとの責務:
    - `ServiceDiscoveryReporter`:
        - 30秒間隔で `agent.service.register`
        - `/api/v1/<worker_type>/statuses` をHTTP checkに設定
        - `deregister=10m`、終了時 `atexit` deregister
    - `ServiceDiscoveryReferrer`:
        - `health.service(..., passing=True)` でhealthy worker取得
        - ランダム1件返却 (`get_random_worker`)
    - `service-register.sh` 系:
        - テンプレートJSON置換
        - `consul services register/deregister`
        - IP変更監視で再登録
    - `consul-s3-registrar.sh`:
        - S3 `/status` 成功時のみ登録、失敗時deregister
    - `bandog.sh`:
        - Consul DNSで主要サービス解決可否を定期確認
- 主要クラス/モジュールと対応ファイル:
    - `sincromisor-server/sincro-config/src/sincro_config/ServiceDiscoveryReporter.py`
    - `sincromisor-server/sincro-config/src/sincro_config/ServiceDiscoveryReferrer.py`
    - `Docker/common/service-register.sh`
    - `Docker/consul/bandog.sh`
    - `Docker/seaweedfs/consul-registrar.sh`
- 変更時に同時確認が必要なファイル:
    - worker_type変更: Reporter呼出側とReferrer呼出側を同時更新
    - health endpoint変更: 登録テンプレート/Reporterのcheck URLを更新
    - service名変更: `bandog.sh` のDNSチェック対象を更新

### 7.2 データ設計

- 主要データ構造:
    - `ServiceDescription`:
        - `service_name`, `service_id`, `service_address`, `service_port`, `index`
    - Consul Service ID:
        - Reporter: `<worker_type>_<public_bind_host>_<ip>:<port>`
        - Script: `<service>_<hostname>_<ip>:<port>` など
- 永続化対象:
    - Consulカタログ（Consul server data volume）
- スキーマ/モデル:
    - `ServiceDescription`（`ServiceDiscoveryReferrer.py` 内）
- バージョニング方針:
    - サービス名/タグ変更時は参照先コードと運用監視を同時更新

### 7.3 インターフェース設計

- エンドポイント/チャネル:
    - Consul HTTP API: `http://<agent>:8500`
    - Consul DNS: `<service>.service.consul` (port 8600)
- リクエスト仕様:
    - 登録:
        - `agent.service.register`（Python/CLI）
    - 参照:
        - `health.service(worker_type, passing=True)`
- レスポンス仕様:
    - healthy worker一覧
    - DNS Aレコード応答（service名ベース）
- エラー仕様:
    - agent不通時は `ServiceDiscoveryReferrerError`
    - healthy workerなしの場合は `None` を返却
- タイムアウト/リトライ方針:
    - Reporterは30秒周期で再登録
    - 参照側再試行は各サービス実装に依存

### 7.4 状態遷移・シーケンス

- 正常系フロー:
    - サービス起動 -> Consul agentに登録
    - healthcheck passing -> Referrerで取得可能
    - AudioBroker等が `get_random_worker()` で接続先決定
- 異常系フロー:
    - healthcheck fail -> 一定時間後deregister
    - agent/server不通 -> 参照例外 or worker未取得
- 状態遷移図/シーケンス図（必要なら図リンク）:
    - TODO: 追加予定

## 8. 設定・デプロイ

- 環境変数:
    - `SINCRO_CONSUL_SERVER_HOST`
    - `SINCRO_CONSUL_SERVER_NODE_NAME`
    - `SINCRO_CONSUL_AGENT_HOST`
    - `SINCRO_CONSUL_AGENT_PORT`
    - 各サービスの `*_PUBLIC_BIND_HOST`, `*_PUBLIC_BIND_PORT`
- 設定ファイル:
    - `compose/consul-server.yml`
    - 各 `compose/*.yml` の `consul-agent-*`
    - `Docker/*/*-template.json`
- 起動方法:
    - `docker compose --profile backend up -d sincro-consul-server`
    - `docker compose --profile full up -d`（全agent含む）
- デプロイ/ローカル実行手順:
    - server -> agents -> services の順で立ち上がる構成（depends_on/healthcheck）
- 互換性に影響する設定変更:
    - public bind host/port 変更
    - service名（worker_type）変更

## 9. 監視・運用

- ログ設計:
    - Reporter: 登録成功/失敗ログ
    - スクリプト: register/deregisterログ
    - bandog: DNS解決失敗数を `services.status` に出力
- メトリクス:
    - Consul health checks
    - `bandog` healthcheck（`services.status == 0`）
- 障害時の切り分け手順:
    -   1. `consul members` でserver/agent参加状況確認
    -   2. Consul UI/APIで対象サービスが登録済みか確認
    -   3. `nslookup <service>.service.consul <server>:8600` でDNS確認
    -   4. アプリ側で `ServiceDiscoveryReferrerError` 発生有無確認
- よくある失敗と対処:
    - public_bind_host解決不可 -> host/network設定修正
    - health endpoint不一致 -> register check URLを修正
    - worker_type不一致 -> Referrer呼出名を修正

## 10. セキュリティ/コンプライアンス

- 認証/認可:
    - 現状は内部ネットワーク前提でACL未導入
- 秘密情報の扱い:
    - Consul自体に機密値は最小限
- 入力検証:
    - 登録情報はコード/テンプレートで固定生成
- 脅威と対策:
    - ヘルス不良ノードを自動除外する設計
- 監査ログ（必要な場合のみ）:
    - 専用監査ログ未実装

## 11. テスト方針

- テスト観点:
    - 登録/参照、ヘルス連動除外、DNS解決
- 単体テスト:
    - `ServiceDiscoveryReferrer` の参照ロジック（必要時）
- 結合テスト:
    - 主要サービス起動後にReferrerで全worker取得
- E2Eテスト:
    - AudioBrokerがConsul経由で4サービスに接続できること
- 負荷テスト（必要な場合のみ）:
    - 複数同種worker登録時の分散挙動確認
- 受け入れ条件:
    - 主要workerがConsulでhealthy登録され、下流接続が成立する

## 12. 既知課題・リスク

- 既知課題:
    - ACL/TLS未導入で内部ネットワーク前提が強い
    - 登録方式が複数あり、設定分散している
- 技術的負債:
    - service名/タグの一元管理がない
- リスク一覧:
    - Consul停止時にサービス解決不能
    - 誤ったworker_type指定で接続失敗
- 軽減策:
    - bandog監視、fallback設定（sincro-rtc->AudioBroker）

## 13. 代替案と設計判断

- 検討した代替案:
    - 固定ホスト設定のみで運用
- 採用しなかった理由:
    - スケール/入れ替え時に運用コストが高い
- 最終判断:
    - Consul中心の動的解決を継続

## 14. 変更履歴

| 日付       | 変更内容 |
| ---------- | -------- |
| 2026-02-15 | 初版作成 |

## 15. 参照資料

- 関連ドキュメント:
    - `documents/design/service_compose.md`
    - `documents/design/networking_websocket.md`
    - `documents/design/backend_storage.md`
- 参照実装:
    - `compose/consul-server.yml`
    - `sincromisor-server/sincro-config/src/sincro_config/ServiceDiscoveryReporter.py`
    - `sincromisor-server/sincro-config/src/sincro_config/ServiceDiscoveryReferrer.py`
    - `Docker/common/service-register.sh`
    - `Docker/consul/bandog.sh`
