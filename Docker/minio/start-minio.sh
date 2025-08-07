#!/bin/sh

set -e

. /service-register.sh

SERVICE_NAME="SincroMinio"
TEMPLATE_JSON="/minio-template.json"
MINIO_PORT=80

export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
echo "CONSUL_HTTP_ADDR=${CONSUL_HTTP_ADDR}"

SERVICE_ID="$(generate_service_id "$SERVICE_NAME" "$MINIO_PORT")"
SERVICE_IPV4="$(busybox hostname -i)"

echo "Starting ${SERVICE_NAME} - ${SERVICE_ID} - ${SERVICE_IPV4}"

replace_template_vars "$TEMPLATE_JSON" "$SERVICE_ID" "$SERVICE_IPV4"

trap "unregister_service '$SERVICE_ID'" TERM INT EXIT

register_service "$TEMPLATE_JSON"

minio server /data --console-address ":9001" &
MINIO_PID=$!
echo "Minio started with PID ${MINIO_PID}"

monitor_ip_and_reregister "$SERVICE_NAME" "$MINIO_PORT" "$TEMPLATE_JSON" "$MINIO_PID"

wait $MINIO_PID || MINIO_EXIT_CODE=$?

echo "Minio exited with code ${MINIO_EXIT_CODE}"
unregister_service "$SERVICE_ID"

exit "${MINIO_EXIT_CODE}"
