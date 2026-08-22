# Infrastructure: Docker Compose

## Summary

- Docker Compose は Sincromisor のローカル/単一ホスト実行の正本である。
- `.env`、compose service、Pion / frontend 設定の 3 点を常に整合させる。
- `full` / `rtc` profile はPion版 `sincro-rtc` を起動する。

## 共有 bridge network

root `compose.yml` の `sincromisor-net` は
`${SINCRO_COMPOSE_NETWORK_SUBNET}` をIPAM subnetとして使う。既定値は
`examples/compose.env` の `172.28.0.0/16` である。

通常のPion serviceは `sincro-rtc` とし、container IPv4はDockerが動的に割り当てる。
`--media-udp-port ${SINCRO_PION_MEDIA_UDP_PORT}` と `--interface ${SINCRO_PION_INTERFACE}` はcontainer内の
shared UDP mux bind先を選び、`--service-bind-host ${SINCRO_PION_SERVICE_BIND_HOST}` はConsul登録addressを決める。
local composeの既定service bind hostは`sincro-rtc`である。別host Consulを使う場合はConsulからhealth check可能な
Pion hostのVPN addressを指定する。browserへ広告するpublic IPv4は別値とする。

Pionはstable TCP 8001を公開し、
`${SINCRO_PION_MEDIA_UDP_PORT}` をhost/container同値のUDP portとして公開する。
`SINCRO_PION_PUBLIC_IPV4`、`SINCRO_PION_STUN`、`SINCRO_RTC_MAX_SESSIONS`、
`SINCRO_PION_FFMPEG_PATH`はPion commandへ直接渡す。

通常運用は `--profile full` または `--profile rtc` でPionを起動する。Pion serviceは
`SINCRO_PION_CONSUL_HTTP_HOST` / `SINCRO_PION_CONSUL_HTTP_PORT` のHTTP endpointを直接使い、
`SINCRO_PION_SERVICE_BIND_HOST`をConsul service addressとして登録する。Pion専用のlocal gossip agentは起動しない。
local composeでは既存の`sincro-consul-server`を指定し、別host ConsulではVPS containerから到達可能なHTTP addressと、
Consul serverがPionへhealth checkできるVPN addressをそれぞれ指定する。Pionは`depends_on`で`sincro-consul-server`の
healthcheck成功後に起動し、`/health/ready` を10秒間隔・5秒timeoutで監視する。

既存Docker networkとsubnetが重複する環境では、`SINCRO_COMPOSE_NETWORK_SUBNET`だけを未使用subnetへ変更する。

## Scope

- 対象:
    - `compose.yml`
    - `compose/*.yml`
    - `examples/compose.env`
    - service profile / env wiring
- 非対象:
    - 個別サービス内部実装
    - 本番 orchestration の詳細

## Responsibilities

- service container の build / image / command / healthcheck を定義する。
- env をサービスへ注入する。
- Consul、Redis、SeaweedFS などの周辺サービスを接続する。
- profile ごとの起動単位を定義する。

## Change Checklist

- 新しい env を追加したら `examples/compose.env`、compose environment、設定クラスを同時更新する。
- Pion serviceはcontainer IPv4を設定せず、Dockerの動的割当とinterface選択を使う。
- service 名や port を変える場合は Consul、fallback 設定、contracts を確認する。
- downstream service を追加/削除する場合は WebSocket contract を確認する。
- frontend / backend の片側だけで完結する変更にしない。

## References

- `documents/design/infrastructure/consul.md`
- `documents/design/infrastructure/storage.md`
- `documents/design/archive/legacy-flat/service_compose.md`
