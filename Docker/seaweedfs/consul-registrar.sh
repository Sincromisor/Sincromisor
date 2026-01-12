#!/bin/sh

echo "[registrar] starting consul-registrar.sh"

# set -euo pipefail

TAGS_JSON=$(printf '%s' "${SERVICE_TAGS}" |
	awk -F',' '{printf "[\"%s\"", $1; for(i=2;i<=NF;i++) printf ",\"%s\"", $i; printf "]"}')

cat >/tmp/register.json <<'JSON'
{
    "ID": "__ID__",
    "Name": "__NAME__",
    "Address": "__ADDRESS__",
    "Port": __PORT__,
    "Tags": __TAGS__,
    "Check": {
    "TCP": "__ADDRESS__:__PORT__",
    "Interval": "10s",
    "Timeout": "2s",
    "DeregisterCriticalServiceAfter": "1m"
    }
}
JSON

sed -i \
	-e "s/__ID__/${SERVICE_ID}/g" \
	-e "s/__NAME__/${SERVICE_NAME}/g" \
	-e "s/__ADDRESS__/${SERVICE_ADDRESS}/g" \
	-e "s/__PORT__/${SERVICE_PORT}/g" \
	-e "s/__TAGS__/${TAGS_JSON}/g" \
	/tmp/register.json

echo "[registrar] start loop: register ${SERVICE_NAME} (${SERVICE_ADDRESS}:${SERVICE_PORT})"
while true; do
	# sicro-s3が死んでる時は登録しない（または明示deregisterする）
	if curl -fsS "http://${SERVICE_ADDRESS}:${SERVICE_PORT}/status" >/dev/null 2>&1; then
		curl -fsS -X PUT "${CONSUL_HTTP_ADDR}/v1/agent/service/register" \
			--data-binary @/tmp/register.json >/dev/null
		echo "[registrar] registered/renewed"
	else
		# 状態を綺麗にしたいなら明示的にderegisterしてもOK
		curl -fsS -X PUT "${CONSUL_HTTP_ADDR}/v1/agent/service/deregister/${SERVICE_ID}" >/dev/null 2>&1 || true
		echo "[registrar] s3 not reachable -> deregistered"
	fi
	sleep "${PERIOD_SECONDS}"
done
