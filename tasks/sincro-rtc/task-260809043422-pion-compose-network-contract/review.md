# レビュー: task-260809043422-pion-compose-network-contract

## 判定

APPROVED

## 理由・申し送り

- `compose.yml` の `sincromisor-net` は現時点で IPAM 未設定であり、本タスクの subnet 供給先は一意である。`compose/sincro-rtc.yml` は同じ network を参照するだけで、既存 aiortc service へ static address を追加しないという境界も現在の構成と一致する。
- Pion の `--media-udp` は指定 interface に割当済みの非 wildcard IPv4 を要求し、`--interface` はその interface 名、`--service-bind-host` は Consul 登録 address を単一 IPv4 へ解決する入力である。container 固定 IPv4 と public IPv4 を分離する設計・後続 compose task の責務分離は、これらの既存契約および migration 文書と一致する。
- 完了条件は対象ファイル、変更しない公開 HTTP / DataChannel 契約、検証 command、文書同期先を明記している。実 NAT / firewall 到達性、Pion service、port 公開、healthcheck は後続の排他的 compose / rehearsal task の責務であり、本タスクの完了に含めない。
- 必須確認が失敗した場合は、実行 command と `docker compose config` の出力、`npm run gate` / `npm run tasks:check` の失敗ログを採取して直接原因を特定し、設定または文書を修正後に同じ確認を再実行する。原因を移管する場合は、証拠・原因・移管理由・後続 task ID を記録して明示的に移管するまで完了にしない。

## 自律補完

- `AUTO_FIX`: 後続 Pion service の契約を一意にするため、`documents/design/infrastructure/compose.md` と `documents/migration/pion/rollout-and-operations.md` へ、`ipv4_address: ${SINCRO_PION_CONTAINER_IPV4}` と同じ値を `--service-bind-host ${SINCRO_PION_CONTAINER_IPV4}` に渡すことを追記する。これは `internal/config` が Consul 有効時に service bind host を単一 IPv4 として解決し、その値を登録 address に使う既存契約から一意に決まる。`--media-udp ${SINCRO_PION_CONTAINER_IPV4}:${SINCRO_PION_MEDIA_UDP_PORT}`、`--interface ${SINCRO_PION_INTERFACE}`、public IPv4 との差異も同じ箇所へ併記する。
- `AUTO_FIX`: 検証では既存 `.env` を上書きしないよう、`docker compose --env-file examples/compose.env config` を用い、`networks.sincromisor-net.ipam.config[0].subnet` が `172.28.0.0/16` へ展開されることを確認する。環境固有の subnet を使う場合は、`SINCRO_COMPOSE_NETWORK_SUBNET` と `SINCRO_PION_CONTAINER_IPV4` を同一 subnet の未使用値へ対で変更してから後続 compose task を実施する。
