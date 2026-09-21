#!/bin/sh

# フロントを起動し、同一ホストのConsulエージェントへ現在のコンテナIPを登録する。
set -e

TEMPLATE_JSON="/etc/caddy/frontend-template.json"
REGISTER_JSON="/etc/caddy/frontend-configured.json"
CADDY_CONFIG="/etc/caddy/Caddyfile"
CADDY_ADAPTER="caddyfile"
CADDY_PORT=80

# Consulアドレス設定
export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"


# フロントエンドID生成
SINCRO_FRONTEND_IPV4="$(hostname -i)"
SINCRO_FRONTEND_ID="SincroFrontend_$(hostname)_${SINCRO_FRONTEND_IPV4}:${CADDY_PORT}"



# 再起動でIPが変わっても再生成できるよう、原本の置換記号は残す。
replace_template_vars() {
    sed \
        -e "s/FRONTEND_ID/${SINCRO_FRONTEND_ID}/g" \
        -e "s/FRONTEND_IPV4_ADDRESS/${SINCRO_FRONTEND_IPV4}/g" \
        "${TEMPLATE_JSON}" > "${REGISTER_JSON}"
}

# Consulサービス登録解除
unregister_service() {
    result=0
    consul services deregister -id "${SINCRO_FRONTEND_ID}" >/dev/null 2>&1 || result=$?
    printf '{"event":"service_registration","stage":"deregister","exit_code":%s}\n' "$result"
}

replace_template_vars

trap unregister_service TERM INT EXIT

result=0
consul services register "${REGISTER_JSON}" >/dev/null 2>&1 || result=$?
printf '{"event":"service_registration","stage":"register","exit_code":%s}\n' "$result"
[ "$result" -eq 0 ] || exit "$result"

caddy run --config "${CADDY_CONFIG}" --adapter "${CADDY_ADAPTER}" &
CADDY_PID=$!
echo "Caddy started with PID ${CADDY_PID}"

# 正常終了でも終了コードを必ず設定し、Caddyの結果をコンテナへ返す。
CADDY_EXIT_CODE=0
wait $CADDY_PID || CADDY_EXIT_CODE=$?

printf '{"event":"service_child_exit","exit_code":%s}\n' "$CADDY_EXIT_CODE"
unregister_service

exit "${CADDY_EXIT_CODE}"
