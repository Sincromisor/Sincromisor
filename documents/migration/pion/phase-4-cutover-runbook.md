# Phase 4 停止切替リハーサルrunbook

## 目的

production相当環境でaiortcからPionへ停止切替し、Pion crash後の復旧とaiortcへのrollbackを一度だけ確認する。
実測値と未観測事項は[Gate 4結果](../../../tasks/sincro-rtc/task-260809020145-pion-phase-4-cutover-rehearsal/artifacts/gate-4-result.md)へ記録する。

この手順は[運用移行とロールバック](rollout-and-operations.md)のprofile、network、shutdown契約に従う。
Frontendと下流Python serviceはすでに起動済みのimageを使い、切替とrollbackでrebuildしない。
停止切替のため、接続中sessionは失われ、利用者は再接続が必要である。

## 切替前確認

メンテナンス開始を告知し、実環境のcompose用環境変数を読み込んだリポジトリrootで実行する。
`examples/compose.env`の予約IPは例示値のため、本番環境へ読み込まない。
aiortc操作は`service-initializer`も選択する`full` profileを使う。

```sh
: "${SINCRO_PION_CONTAINER_IPV4:?}" "${SINCRO_PION_MEDIA_UDP_PORT:?}" \
  "${SINCRO_PION_INTERFACE:?}" "${SINCRO_PION_PUBLIC_IPV4:?}" \
  "${SINCRO_PION_STUN:?}" "${SINCRO_PION_FFMPEG_PATH:?}"
docker compose --profile pion config
HOST_INTERFACE=<Pion hostの外向きinterface>
ip -4 addr show dev "${HOST_INTERFACE}"
ss -lun "sport = :${SINCRO_PION_MEDIA_UDP_PORT}"
```

`docker compose --profile pion config`で`pion` profileの`sincro-rtc-pion`、TCP `8001`、
`${SINCRO_PION_MEDIA_UDP_PORT}/udp`のhost/container同値mapping、`--media-udp`
`${SINCRO_PION_CONTAINER_IPV4}:${SINCRO_PION_MEDIA_UDP_PORT}`、`--public-ipv4`、
`--interface`、`--stun`、`--max-sessions`、`consul-agent-rtc`を確認する。host側の`ip`で外向きinterfaceと
public IPv4を確認し、NAT配下ではpublic IPv4とforward先をcontrol-plane設定で照合する。container固定IPv4と
`SINCRO_PION_INTERFACE`はPion起動後にcontainer内で確認する。`ss`に同UDP portの競合listenerがないことを確認する。

NAT装置では`SINCRO_PION_PUBLIC_IPV4:${SINCRO_PION_MEDIA_UDP_PORT}/udp`をPion hostへ静的forwardし、
firewallでは同UDP portのinboundとreturn trafficを許可する。これらのcontrol-plane設定と対象interfaceを
確認できない場合は切替しない。

## aiortc停止とPion起動

aiortcへの新規受付を止め、既存sessionを終了する。sessionの移送はしない。

```sh
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
docker compose --profile full stop sincro-rtc
docker compose --profile full ps sincro-rtc
docker compose --profile pion up -d --no-build sincro-rtc-pion
docker compose --profile pion exec sincro-rtc-pion ip -4 addr show dev "${SINCRO_PION_INTERFACE}"
curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

成功判定はaiortcが`stopped`でTCP 8001を解放し、Pion container内の
`SINCRO_PION_INTERFACE`に`SINCRO_PION_CONTAINER_IPV4`があり、`/health/ready`と`/statuses`がHTTP 200を返すこととする。
PionはConsul登録とstartup dependency検証後、非draining時だけreadyになる。readiness失敗、port競合、または
Consul登録失敗ではsmoke testへ進まず、rollbackへ進む。

## Pion smoke testとcrash復旧

stable endpointを使い、ChromeとFirefoxで各1回、Pionへの接続、1 turnの会話、利用者/応答text、telop、
非無音の合成音声を確認する。session終了後に`/statuses`と`/metrics`でactive sessionと下流接続が収束し、
継続増加がないことを確認する。

```sh
curl --fail --silent --show-error http://127.0.0.1:8001/metrics
docker compose --profile pion kill -s SIGKILL sincro-rtc-pion
docker compose --profile pion ps sincro-rtc-pion
curl --fail --silent --show-error http://127.0.0.1:8001/health/ready
```

crash後はrestart policyによってPion containerが再起動し、`/health/ready`が再びHTTP 200となってから、
新規sessionを1回接続できれば成功とする。再起動しない、またはreadiness復旧後に新規sessionを受理できない場合は
rollbackする。

metricsとcompose logは原因調査に必要な最小範囲だけを、Git管理外の
`work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal/`へ保存する。session ID、SDP、
candidate、会話、音声payloadをresult artifactへ転載しない。

```sh
EVIDENCE_DIR=work/private-artifacts/task-260809020145-pion-phase-4-cutover-rehearsal
mkdir -p "${EVIDENCE_DIR}"
curl --fail --silent --show-error http://127.0.0.1:8001/metrics >"${EVIDENCE_DIR}/pion-metrics.prom"
docker compose --profile pion logs --no-color sincro-rtc-pion >"${EVIDENCE_DIR}/pion.log"
```

## rollback

signalingまたはICE接続成功率の重大な低下、critical media failure、resourceが収束しない、pipeline reconnect loop、
MessagePack互換error、継続するqueue overflow、または対象browserで会話不能を観測したらrollbackする。

```sh
time docker compose --profile pion stop -t 6 sincro-rtc-pion
docker compose --profile pion logs --no-color sincro-rtc-pion
docker compose --profile full up -d --no-build sincro-rtc
curl --fail --silent --show-error http://127.0.0.1:8001/api/v1/RTCSignalingServer/statuses
```

Pion停止はSIGTERMから最大6秒で完了し、logに`shutdown signal received`と`pion poc stopped`があることを確認する。
6秒を超えた、または正常shutdown logがない場合は失敗として記録する。aiortcの`/statuses`がHTTP 200となった後、
ChromeとFirefoxで各1回、接続、1 turnの会話、text、telop、非無音の合成音声を確認する。
Frontendと下流Python serviceはrebuildしない。切替中の接続とsession stateは回復しない。
