# Pion compose network contractを確定する

## 背景 / 目的

Pionの`--media-udp`にはcontainerの実interfaceへ割り当て済みの非wildcard IPv4が必要だが、現行compose networkは動的addressだけである。後続の排他的compose taskが推測なしにPionを起動できるよう、bridge subnetとPion固定IPv4の設定契約を先に追加する。

## 完了条件（受け入れ条件）

- [ ] root `compose.yml`の`sincromisor-net`にIPAM subnet `${SINCRO_COMPOSE_NETWORK_SUBNET}`を設定し、`examples/compose.env`の既定値`172.28.0.0/16`から供給する。
- [ ] `examples/compose.env`に`SINCRO_PION_CONTAINER_IPV4=172.28.0.10`、`SINCRO_PION_MEDIA_UDP_PORT=3478`、`SINCRO_PION_INTERFACE=eth0`を追加し、`SINCRO_PION_CONTAINER_IPV4`はsubnet内のPion専用固定addressであることを明記する。
- [ ] 後続Pion serviceを`sincro-rtc-pion`とし、`--media-udp ${SINCRO_PION_CONTAINER_IPV4}:${SINCRO_PION_MEDIA_UDP_PORT}`、`--interface ${SINCRO_PION_INTERFACE}`、`--service-bind-host sincro-rtc-pion`、および同じ`ipv4_address`を使う契約をcompose設計とmigration運用文書へ記録する。`public IPv4`とConsul service addressは別値として扱う。
- [ ] `docker compose --env-file <一時env> config`でIPAM subnetが`${SINCRO_COMPOSE_NETWORK_SUBNET}`へ展開されることを確認し、repositoryの`.env`を上書きしない。`npm run gate`と`npm run tasks:check`を通す。

## 設計判断

- shared bridge networkに明示IPAM subnetを持たせ、Pionだけへ固定IPv4を割り当てる。起動時に動的addressを検出するscriptやhost networkは導入しない。
- subnetは環境変数で上書き可能にする。host networkや既存Docker networkと重複する環境は、`SINCRO_COMPOSE_NETWORK_SUBNET`とPion IPv4を同じsubnet内の未使用値へ変更する。
- `SINCRO_PION_CONTAINER_IPV4`はUDP mux bindとConsul registrationに到達するcontainer addressの供給元であり、browserへ広告する`SINCRO_PION_PUBLIC_IPV4`ではない。

## スコープ境界

- 本タスク: shared compose networkのIPAM contract、Pion固定IPv4とmedia UDP/interface env sample、設計文書。
- 依存: Pionのproduction network、container image、Consul runtime設定。
- スコープ外: Pion service/profile追加、UDP/TCP port公開、public IPv4/STUN/session上限の配線、healthcheck、実地cutover。

## 実装方針

`compose.yml`をnetwork subnetの供給先、`examples/compose.env`を値の正本、`documents/design/infrastructure/compose.md`と`documents/migration/pion/rollout-and-operations.md`を設定意味の正本として更新する。後続taskが`sincro-rtc-pion` serviceへ固定IPv4を接続するまで、既存serviceへstatic addressは追加しない。

## テスト

- `cp examples/compose.env .env`後に`docker compose config`を実行し、`networks.sincromisor-net.ipam.config[0].subnet`を確認する。
- `npm run gate`と`npm run tasks:check`

## ドキュメント同期の要否

要。`examples/compose.env`、`documents/design/infrastructure/compose.md`、`documents/migration/pion/rollout-and-operations.md`へ、subnet、Pion固定IPv4、media bind address、public IPv4との分離を同期する。Frontend RTC契約は変更しない。
