# Pion Composeの固定コンテナIPを廃止する

## 背景 / 目的

`sincro-rtc-pion` は `SINCRO_PION_CONTAINER_IPV4` を shared bridge network の
`ipv4_address` と `--media-udp` の bind address に使う。Docker はこの値を予約しないため、
動的に起動した `consul-agent-rtc` が同じ address を取得すると Pion container は network attach 前に
`Address already in use` で起動できない。

他の compose service と同様に Docker に container address を動的割当させる。Pion process は指定された
interface の実行時 IPv4 を標準ライブラリで決定し、shared UDP mux をその address と既存 port へ bind する。
SDP に広告する `SINCRO_PION_PUBLIC_IPV4`、host/container 1:1 UDP port mapping、Consul の service name
解決は変更しない。

## 完了条件

- [ ] root `compose.yml` と `compose/sincro-rtc.yml` に Pion 専用 `ipv4_address` がなく、
  `.env` と `examples/compose.env` に `SINCRO_PION_CONTAINER_IPV4` がない。`docker compose config` が
  `sincro-rtc-pion` の shared network に動的 endpoint だけを定義することを確認する。
- [ ] Pion の起動設定は `--media-udp-port` と `--interface` から、指定 interface に割り当てられた
  単一の非-unspecified IPv4 を選び、同 port の UDP4 socket を bind する。0 / 範囲外 port、存在しない・
  down interface、IPv4 が0個または複数の interface は listener を開く前に fail-fast する。従来の
  `--media-udp` は削除し、Compose、README、設計・運用文書を新しい引数へ同期する。
- [ ] `SINCRO_PION_PUBLIC_IPV4` は SDP の public candidate、`SINCRO_PION_MEDIA_UDP_PORT` は host/container
  UDP port mapping、`SINCRO_PION_INTERFACE` は container 内 bind address の選択にだけ使う。container IPv4を
  `.env` で公開・指定しない。
- [ ] `sincro-rtc-pion` は直接使う `sincro-consul-server` が healthy になってから起動する依存を持つ。
  新規 Docker network で `docker compose --profile pion up -d sincro-rtc-pion` を実行し、Consul の DNS
  lookup failure や address collision を出さず `/health/ready` が成功することを private evidence で確認する。
- [ ] コンテナを一度削除・再作成しても Pion が同じ compose command で ready になり、固定 container IP を
  前提としないことを確認する。失敗時は command、exit code、Pion / Consul log、network endpoint を private
  evidence に採取し、原因を修正してから再実行する。

## 設計判断

Docker Compose での container IP は deployment の実装詳細であり、設定値にしない。`net.InterfaceByName`
と `Interface.Addrs` は Go 標準ライブラリで既に使えるため、shell wrapper、`iproute2`、Docker API、追加依存を
導入しない。interface に複数 IPv4 がある場合は選択規則を推測せず起動を拒否する。

Pion が Consul server を HTTP endpoint として直接使う既存責務は維持する。その service 起動を Compose が
順序付けるだけで、Pion 専用 Consul agent は追加しない。

## 変更範囲

- `sincromisor-server/sincro-rtc-pion-poc/internal/config/` とそのテスト
- `compose.yml`、`compose/sincro-rtc.yml`、`.env`、`examples/compose.env`
- `Docker/sincro-rtc-pion-poc/` は shell wrapper を追加しない
- `sincromisor-server/sincro-rtc-pion-poc/README.md`
- `documents/design/infrastructure/compose.md`、`documents/migration/pion/rollout-and-operations.md`、
  `documents/migration/pion/phase-4-cutover-runbook.md`

Frontend、ICE candidate の public address、UDP port、pipeline protocol、Consul service schema は対象外とする。

## テスト

- Go config test で interface IPv4 の選択、0個・複数 IPv4、invalid port、down / missing interface を検証する。
  interface discovery は test seam を最小限にし、production で Docker API や shell を呼ばない。
- `go test ./...`、`go vet ./...`、`gofmt -l .`、`npm run gate` を実行する。
- `docker compose config`、新規 compose network での Pion 起動・ready、再作成後の起動を private evidence で
  確認する。Pion、Consul、network endpoint の実行 log は Git artifact に入れない。

## ドキュメント同期

Pion compose の bind address と起動依存という運用契約を変更するため、上記の Compose 設計、運用移行、
Phase 4 runbook、README を同一変更で更新する。
