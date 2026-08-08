# Infrastructure: Docker Compose

## Summary

- Docker Compose は Sincromisor のローカル/単一ホスト実行の正本である。
- `.env`、compose service、Python / frontend 設定の 3 点を常に整合させる。
- `full` / `rtc` profile はaiortc版 `sincro-rtc` を起動する。Pion版は `pion` profileで明示的に選択する。

## 共有 bridge network

root `compose.yml` の `sincromisor-net` は
`${SINCRO_COMPOSE_NETWORK_SUBNET}` をIPAM subnetとして使う。既定値は
`examples/compose.env` の `172.28.0.0/16` である。

後続のPion serviceは `sincro-rtc-pion` とし、このnetworkへ
`ipv4_address: ${SINCRO_PION_CONTAINER_IPV4}` を割り当てる。
`SINCRO_PION_CONTAINER_IPV4` はsubnet内でPion専用に予約する固定IPv4であり、
`--media-udp ${SINCRO_PION_CONTAINER_IPV4}:${SINCRO_PION_MEDIA_UDP_PORT}`、
`--interface ${SINCRO_PION_INTERFACE}`、
`--service-bind-host sincro-rtc-pion` を配線する。service bind hostは同じ固定IPv4へ解決され、
Consul service addressとして登録する。browserへ広告するpublic IPv4は別値とする。

Pionはaiortc版と同じstable TCP 8001を公開し、
`${SINCRO_PION_MEDIA_UDP_PORT}` をhost/container同値のUDP portとして公開する。
`SINCRO_PION_PUBLIC_IPV4`、`SINCRO_PION_STUN`、`SINCRO_RTC_MAX_SESSIONS`、
`SINCRO_PION_FFMPEG_PATH`はPion commandへ直接渡す。`pion` と `full` / `rtc` を同じprojectで同時に起動すると、
TCP port競合により2つ目のRTC backendは起動しない。

Pionへ切り替えるときはaiortcを停止した状態で `--profile pion` を指定する。Pion serviceは
`consul-agent-rtc` のhealthcheck完了を待ち、自身は `/health/ready` を10秒間隔・5秒timeoutで監視する。

既存Docker networkとsubnetが重複する環境では、
`SINCRO_COMPOSE_NETWORK_SUBNET` と `SINCRO_PION_CONTAINER_IPV4` を同一subnet内の未使用値へ対で変更する。

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
- Pion serviceを追加する場合は、`sincro-rtc-pion` だけへ上記の固定IPv4を割り当て、既存serviceへstatic addressを追加しない。
- service 名や port を変える場合は Consul、fallback 設定、contracts を確認する。
- downstream service を追加/削除する場合は AudioBroker と WebSocket contract を確認する。
- frontend / backend の片側だけで完結する変更にしない。

## References

- `documents/design/infrastructure/consul.md`
- `documents/design/infrastructure/storage.md`
- `documents/design/archive/legacy-flat/service_compose.md`
