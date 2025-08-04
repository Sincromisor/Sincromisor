#!/bin/sh

set -e

TEMPLATE_JSON="/opt/voicevox/.local/voicevox-template.json"
VOICEVOX_PORT=50021

# Consulアドレス設定
export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
echo "CONSUL_HTTP_ADDR=${CONSUL_HTTP_ADDR}"

# ConsulサービスID生成
SINCRO_VOICEVOX_IPV4="$(hostname -i)"
SINCRO_VOICEVOX_ID="SincroVoiceVox_$(hostname)_${SINCRO_VOICEVOX_IPV4}:${VOICEVOX_PORT}"
echo "SINCRO_VOICEVOX_IPV4=${SINCRO_VOICEVOX_IPV4}"
echo "SINCRO_VOICEVOX_ID=${SINCRO_VOICEVOX_ID}"

# テンプレート置換
replace_template_vars() {
    sed -i \
        -e "s/SERVICE_ID/${SINCRO_VOICEVOX_ID}/g" \
        -e "s/VOICEVOX_IPV4_ADDRESS/${SINCRO_VOICEVOX_IPV4}/g" \
        "${TEMPLATE_JSON}"
}

# Consulサービス登録解除
unregister_service() {
    echo "Unregistering service ${SINCRO_VOICEVOX_ID} from Consul"
    consul services deregister -id "${SINCRO_VOICEVOX_ID}" || true
}

replace_template_vars

trap unregister_service TERM INT EXIT

consul services register "${TEMPLATE_JSON}"

/opt/voicevox/run \
    --host ${SINCRO_VOICEVOX_HOST} \
    --port ${SINCRO_VOICEVOX_PORT} \
    --cors_policy_mode all &

VOICEVOX_PID=$!
echo "VOICEVOX started with PID ${VOICEVOX_PID}"

wait $VOICEVOX_PID || VOICEVOX_EXIT_CODE=$?

echo "VOICEVOX exited with code ${VOICEVOX_EXIT_CODE}"
unregister_service

exit "${VOICEVOX_EXIT_CODE}"
