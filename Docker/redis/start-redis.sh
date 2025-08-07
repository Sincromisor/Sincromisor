#!/bin/sh

set -e

. /service-register.sh

SERVICE_NAME="SincroRedis"
TEMPLATE_JSON="/redis-template.json"
REDIS_PORT=6379

export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
echo "CONSUL_HTTP_ADDR=${CONSUL_HTTP_ADDR}"

SERVICE_ID="$(generate_service_id "$SERVICE_NAME" "$REDIS_PORT")"
SERVICE_IPV4="$(hostname -i)"

echo "Starting ${SERVICE_NAME} - ${SERVICE_ID} - ${SERVICE_IPV4}"

replace_template_vars "$TEMPLATE_JSON" "$SERVICE_ID" "$SERVICE_IPV4"

trap "unregister_service '$SERVICE_ID'" TERM INT EXIT

register_service "$TEMPLATE_JSON"

redis-server "/usr/local/etc/redis/redis.conf" &
REDIS_PID=$!
echo "Redis started with PID ${REDIS_PID}"

monitor_ip_and_reregister "$SERVICE_NAME" "$REDIS_PORT" "$TEMPLATE_JSON" "$REDIS_PID"

wait $REDIS_PID || REDIS_EXIT_CODE=$?

echo "Redis exited with code ${REDIS_EXIT_CODE}"
unregister_service "$SERVICE_ID"

exit "${REDIS_EXIT_CODE}"
