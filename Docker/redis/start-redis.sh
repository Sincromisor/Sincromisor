#!/bin/sh

set -e

. /service-register.sh

SERVICE_NAME="SincroRedis"
TEMPLATE_JSON="/redis-template.json"
REDIS_PORT=6379

export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"


SERVICE_ID="$(generate_service_id "$SERVICE_NAME" "$REDIS_PORT")"
SERVICE_IPV4="$(hostname -i)"

registration_log initialize started 0

replace_template_vars "$TEMPLATE_JSON" "$SERVICE_ID" "$SERVICE_IPV4"

trap "unregister_service '$SERVICE_ID'" TERM INT EXIT

register_service "$TEMPLATE_JSON"

redis-server "/usr/local/etc/redis/redis.conf" &
REDIS_PID=$!
echo "Redis started with PID ${REDIS_PID}"

monitor_ip_and_reregister "$SERVICE_NAME" "$REDIS_PORT" "$TEMPLATE_JSON" "$REDIS_PID"

REDIS_EXIT_CODE=0
wait $REDIS_PID || REDIS_EXIT_CODE=$?

printf '{"event":"service_child_exit","exit_code":%s}\n' "${REDIS_EXIT_CODE}"
unregister_service "$SERVICE_ID"

exit "${REDIS_EXIT_CODE}"
