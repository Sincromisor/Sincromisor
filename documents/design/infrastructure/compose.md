# インフラ: Docker Compose

## 要約

- Docker Compose は Sincromisor のローカル/単一ホスト実行の正本である。
- `.env`、Docker Compose サービス、Pion / フロントエンド設定の 3 点を常に整合させる。
- `full` / `rtc` プロファイルはPion版 `sincro-rtc` を起動する。

## 共有橋渡しネットワーク

ルート `compose.yml` の `sincromisor-net` は
`${SINCRO_COMPOSE_NETWORK_SUBNET}` をIPAM サブネットとして使う。既定値は
`examples/compose.env` の `172.28.0.0/16` である。

通常のPion サービスは `sincro-rtc` とし、コンテナ IPv4はDockerが動的に割り当てる。
`--media-udp-port ${SINCRO_PION_MEDIA_UDP_PORT}` と `--interface ${SINCRO_PION_INTERFACE}` はコンテナ内の
共有UDP多重化処理待受先を選び、`--service-bind-host ${SINCRO_PION_SERVICE_BIND_HOST}` はConsul登録アドレスを決める。
ローカル Docker Composeの既定サービスの待受ホストは`sincro-rtc`である。別ホスト Consulを使う場合はConsulから死活確認可能な
Pion ホストのVPN アドレスを指定する。ブラウザへ広告する公開IPv4は別値とする。

Pionは固定TCP 8001を公開し、
`${SINCRO_PION_MEDIA_UDP_PORT}` をホスト・コンテナ同値のUDP ポートとして公開する。
`SINCRO_PION_PUBLIC_IPV4`、`SINCRO_PION_STUN`、`SINCRO_RTC_MAX_SESSIONS`、
`SINCRO_PION_FFMPEG_PATH`はPion コマンドへ直接渡す。

通常運用は `--profile full` または `--profile rtc` でPionを起動する。Pion サービスは
`SINCRO_PION_CONSUL_HTTP_HOST` / `SINCRO_PION_CONSUL_HTTP_PORT` のHTTP エンドポイントを直接使い、
`SINCRO_PION_SERVICE_BIND_HOST`をConsul サービスアドレスとして登録する。Pion専用のローカルのゴシップ用エージェントは起動しない。
ローカル Docker Composeでは既存の`sincro-consul-server`を指定し、別ホスト ConsulではVPS コンテナから到達可能なHTTP アドレスと、
Consul サーバーがPionへ死活確認できるVPN アドレスをそれぞれ指定する。Pionは`depends_on`で`sincro-consul-server`の
死活確認成功後に起動し、`/health/ready` を10秒間隔・5秒時間切れで監視する。

既存Docker ネットワークとサブネットが重複する環境では、`SINCRO_COMPOSE_NETWORK_SUBNET`だけを未使用サブネットへ変更する。

## 対象範囲

- 対象:
    - `compose.yml`
    - `compose/*.yml`
    - `examples/compose.env`
    - サービスプロファイル / 環境変数受け渡し
- 非対象:
    - 個別サービス内部実装
    - 本番処理の組み立ての詳細

## 責務

- サービスコンテナのビルド / 画像 / コマンド / 死活確認を定義する。
- 環境変数をサービスへ注入する。
- Consul、Redis、SeaweedFS などの周辺サービスを接続する。
- プロファイルごとの起動単位を定義する。

## 変更時の確認

- 新しい環境変数を追加したら `examples/compose.env`、Docker Composeの環境変数設定、設定クラスを同時更新する。
- Pion サービスはコンテナ IPv4を設定せず、Dockerの動的割当とインターフェース選択を使う。
- サービス名やポートを変える場合は Consul、代替処理設定、契約を確認する。
- 下流サービスを追加/削除する場合は WebSocket 契約を確認する。
- フロントエンド / バックエンドの片側だけで完結する変更にしない。

## 参照

- `documents/design/infrastructure/consul.md`
- `documents/design/infrastructure/storage.md`
- `documents/design/archive/legacy-flat/service_compose.md`
