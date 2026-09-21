# インフラ: Consul

## 要約

- Consul はバックエンドマイクロサービスのサービス発見に使う。
- Goパイプライン調停器と Pion RTC は処理担当サービスを Consul から解決し、未解決時は代替処理設定を使う。
- サービス名や公開用の待受設定を変える場合は Docker Compose と設定クラスを同時確認する。

## 対象範囲

- 対象:
    - Consul エージェント
    - サービス登録
    - 処理担当発見
    - 代替処理ホスト / ポート
- 非対象:
    - Consul クラスタ運用の詳細
    - 下流サービスの内部処理

## 責務

- 各サービスは起動時に Consul へ登録する。
- Pion RTC は `RTCSignalingServer` として同一ホストの `consul-agent-rtc` へ、
  `SINCRO_PION_SERVICE_BIND_HOST`で解決したアドレスと`/health/ready` 確認（10秒間隔、5秒時間切れ、重大後10分登録解除）を登録する。`draining`開始直後に解除する。
- Goパイプライン調停器は SpeechExtractor / SpeechRecognizer / TextProcessor / VoiceSynthesizer の到達先を解決する。
- Consul が使えない場合でも代替処理ホスト / ポートで開発継続できるようにする。

## フロントの再起動時の登録

フロントの起動スクリプトは `frontend-template.json` を原本として保持し、
現在のコンテナIPを埋め込んだ `frontend-configured.json` を生成して同一ホストのエージェントへ登録する。
原本を直接書き換えると、コンテナ再起動時に古いIPが残り、死活確認に失敗して登録が消える。
`bandog` が異常を示す場合は、監視対象ごとのConsul DNS応答と登録先IP、実際のコンテナIPを照合する。
フロント自身のHTTP死活確認成功だけではConsul登録の正常性は保証されない。

## 複数ホストのエージェント

AgentServerは `chat` 専用の `consul-agent-chat` が設定ファイル
`Docker/agent-server/consul-service.json` から `AgentServer`（ID: `agent-server`）として登録する。
登録先は同じComposeネットワーク内の `agent-server:4111` で、コンテナIP変更時も名前で解決する。
他ホストから生成APIへ接続するための広告ではなく、`compose-internal` タグを持つ内部サービスの稼働監視である。
TCP確認を10秒間隔・5秒時間切れで行い、管理者トークンをConsulへ渡さない。
認証付きAPIの準備確認はDocker側の死活確認が担い、LLMの準備完了までは保証しない。
停止中はcriticalとして登録を維持し、再起動でpassingへ戻す。専用エージェントの再作成時も設定から再登録する。
TextProcessorの接続先は従来どおり設定URLを使う。

同じエージェントが `Docker/agent-server/consul-llama-service.json` から
`LlamaServer`（ID: `llama-server`、内部アドレス `llama-server:8080`、タグ `compose-internal`）も登録する。
`http://llama-server:8080/health` を10秒間隔・5秒時間切れで確認し、モデルロード中の503や停止をcriticalとする。
AgentServerと同様に登録を維持し、復旧後はpassingへ戻す。AgentServerのLLM接続URLは変更しない。

## bandogによる全体監視

`Docker/consul/bandog.sh` は既存の音声処理・保存・RTC・フロントと、`AgentServer` / `LlamaServer` の
Consul DNS応答を10秒ごとに確認する。未登録・critical・DNS到達不能を失敗として数え、
`/services.status` が0の場合だけDockerの死活確認が成功する。
これは各サービスのConsul死活確認に基づく判定であり、会話生成そのものの成功を保証しない。
配置ホストのプロファイルによる監視の省略はしない。`full` / `backend` / `external` 単独でbandogを起動した場合も、
別配置を含めてchatサービスがConsulへ登録されていなければunhealthyとなる。

登録設定の追加・変更を既存環境へ反映するときは、リポジトリのルートで次を実行する。

```sh
docker compose --profile chat up -d --no-deps consul-agent-chat
docker compose restart bandog
```

## 複数ホストの接続設定

全メンバーは `SINCRO_CONSUL_ADVERTISE_ADDR` に相互到達可能な管理IPv4を指定する。空欄では従来どおりConsulが広告先を自動選択する。
標準構成はConsulをホストへ公開しない。分散配置では `compose/distributed.yml` を重ね、
`SINCRO_CONSUL_PUBLISH_HOST` に管理IPv4を指定してサーバーRPCとLAN gossipだけを公開する。
この変数は同じ追加ファイル内のRTC・下流APIの公開先にも使う。
管理UI/APIが必要なら `compose/management.yml` でサーバーHTTP 8500をループバックへ追加する。
選択方法と既存環境の移行は[Compose設計](compose.md#公開ポートの選択)を参照する。

サーバーのRPC TCP 8300とLAN gossip TCP/UDP 8301は管理経路で到達可能にする。エージェントは固定のLAN gossipポートを使う。

| エージェント | ポート       |
| ------------ | ------------ |
| RTC          | TCP/UDP 8311 |
| フロント     | TCP/UDP 8312 |
| 音声区間抽出 | TCP/UDP 8313 |
| 音声認識     | TCP/UDP 8314 |
| テキスト処理 | TCP/UDP 8315 |
| 音声合成     | TCP/UDP 8316 |
| Redis        | TCP/UDP 8317 |
| S3           | TCP/UDP 8318 |
| チャット     | TCP/UDP 8319 |
| 中央ログ     | TCP/UDP 8321 |

各エージェントは `SINCRO_CONSUL_SERVER_HOST:8301` へ参加する。DNSの8600と参加先8301は同じサーバーを指す。
RTCのHTTP 8500はComposeネットワーク内の `sincro-rtc` だけが使い、ホストへ公開しない。

## 長期停止後の起動

Consulは保存データの最終稼働時刻が `server_rejoin_age_max` を超えると起動を拒否する。
標準値は `168h`（7日）で、古いサーバーがクラスタへ再参加することを防ぐ仕組みである。
仕様は[Consul公式設定資料](https://developer.hashicorp.com/consul/docs/reference/agent/configuration-file/general)を2026-09-06に確認した。

このComposeは `-bootstrap-expect=1` の単一サーバー構成であるため、開発休止後も保存データを使って再開できるよう、
`compose/consul-server.yml` で停止許容期間の既定値を `87600h`（365日換算で10年）へ延長する。
`.env` の `SINCRO_CONSUL_SERVER_REJOIN_AGE_MAX` をConsulの `-hcl` 引数へ渡す。未設定・空欄でも同じ既定値を使う。
Pythonの設定クラスは経由しない。データボリューム、サービス登録、KVは削除しない。
複数サーバー構成へ変更する場合は、この値を標準の `168h` へ戻してクラスタの復旧手順を設計する。

既存環境への反映はリポジトリのルートで行う。

```sh
docker compose --profile full up -d --no-deps sincro-consul-server
docker compose --profile full exec sincro-consul-server consul operator raft list-peers
```

`restart` だけでは変更後の起動引数が反映されないため、`up -d` で再作成する。
起動できない場合は `docker compose --profile full logs --tail=100 sincro-consul-server` で原因を確認する。
設定した期間を超える停止には引き続き起動保護が働く。認証や証明書など別原因の期限切れはこの設定では解消しない。
他の保存領域まで失う `docker compose down -v` を復旧手段にしない。

## 変更時の確認

- サービス名を変える場合は登録側、探索側、Docker Compose、環境変数を同時更新する。
- 公開用の待受ホスト / ポートを変える場合は RTC 設定とリバースプロキシの影響を確認する。
- 代替処理設定を変える場合は Consul 未起動時の挙動を確認する。

## ログ基盤

中央の保存・公開先・Consul登録は[ログの保存と検索](logging.md)を参照する。

## 参照

- `documents/design/infrastructure/compose.md`
- `documents/design/archive/legacy-flat/service_consul.md`
