#!/bin/sh

set -e

. /service-register.sh

SERVICE_NAME="SincroVoiceVox"
TEMPLATE_JSON="/opt/voicevox/.local/voicevox-template.json"
VOICEVOX_PORT=50021

export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
echo "CONSUL_HTTP_ADDR=${CONSUL_HTTP_ADDR}"

SERVICE_ID="$(generate_service_id "$SERVICE_NAME" "$VOICEVOX_PORT")"
SERVICE_IPV4="$(hostname -i)"

echo "Starting ${SERVICE_NAME} - ${SERVICE_ID} - ${SERVICE_IPV4}"

replace_template_vars "$TEMPLATE_JSON" "$SERVICE_ID" "$SERVICE_IPV4"

trap "unregister_service '$SERVICE_ID'" TERM INT EXIT

register_service "$TEMPLATE_JSON"

/opt/voicevox/run \
    --host "${SINCRO_VOICEVOX_HOST}" \
    --port "${SINCRO_VOICEVOX_PORT}" \
    --cors_policy_mode all &

VOICEVOX_PID=$!
echo "VOICEVOX started with PID ${VOICEVOX_PID}"

monitor_ip_and_reregister "$SERVICE_NAME" "$VOICEVOX_PORT" "$TEMPLATE_JSON" "$VOICEVOX_PID"

wait $VOICEVOX_PID || VOICEVOX_EXIT_CODE=$?

echo "VOICEVOX exited with code ${VOICEVOX_EXIT_CODE}"
unregister_service "$SERVICE_ID"

exit "${VOICEVOX_EXIT_CODE}"
