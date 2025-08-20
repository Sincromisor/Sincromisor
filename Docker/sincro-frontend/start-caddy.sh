#!/bin/sh

set -e

TEMPLATE_JSON="/etc/caddy/frontend-template.json"
CADDY_CONFIG="/etc/caddy/Caddyfile"
CADDY_ADAPTER="caddyfile"
CADDY_PORT=80

# Consulアドレス設定
export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
echo "CONSUL_HTTP_ADDR=${CONSUL_HTTP_ADDR}"

# フロントエンドID生成
SINCRO_FRONTEND_IPV4="$(hostname -i)"
SINCRO_FRONTEND_ID="SincroFrontend_$(hostname)_${SINCRO_FRONTEND_IPV4}:${CADDY_PORT}"
echo "SINCRO_FRONTEND_IPV4=${SINCRO_FRONTEND_IPV4}"
echo "SINCRO_FRONTEND_ID=${SINCRO_FRONTEND_ID}"

# テンプレート置換
replace_template_vars() {
    sed -i \
        -e "s/FRONTEND_ID/${SINCRO_FRONTEND_ID}/g" \
        -e "s/FRONTEND_IPV4_ADDRESS/${SINCRO_FRONTEND_IPV4}/g" \
        "${TEMPLATE_JSON}"
}

# Consulサービス登録解除
unregister_service() {
    echo "Unregistering service ${SINCRO_FRONTEND_ID} from Consul"
    consul services deregister -id "${SINCRO_FRONTEND_ID}" || true
}

replace_template_vars

trap unregister_service TERM INT EXIT

consul services register "${TEMPLATE_JSON}"

caddy run --config "${CADDY_CONFIG}" --adapter "${CADDY_ADAPTER}" &
CADDY_PID=$!
echo "Caddy started with PID ${CADDY_PID}"

wait $CADDY_PID || CADDY_EXIT_CODE=$?

echo "Caddy exited with code ${CADDY_EXIT_CODE}"
unregister_service

exit "${CADDY_EXIT_CODE}"
