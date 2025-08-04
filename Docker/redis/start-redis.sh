#!/bin/sh

set -e

TEMPLATE_JSON="/redis-template.json"
REDIS_CONFIG="/usr/local/etc/redis/redis.conf"
REDIS_PORT=6379

# Consulアドレス設定
export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
echo "CONSUL_HTTP_ADDR=${CONSUL_HTTP_ADDR}"

# フロントエンドID生成
SINCRO_REDIS_IPV4="$(hostname -i)"
SINCRO_REDIS_ID="SincroRedis_$(hostname)_${SINCRO_REDIS_IPV4}:${REDIS_PORT}"
echo "SINCRO_REDIS_IPV4=${SINCRO_REDIS_IPV4}"
echo "SINCRO_REDIS_ID=${SINCRO_REDIS_ID}"

# テンプレート置換
replace_template_vars() {
    sed -i \
        -e "s/SERVICE_ID/${SINCRO_REDIS_ID}/g" \
        -e "s/REDIS_IPV4_ADDRESS/${SINCRO_REDIS_IPV4}/g" \
        "${TEMPLATE_JSON}"
}

# Consulサービス登録解除
unregister_service() {
    echo "Unregistering service ${SINCRO_REDIS_ID} from Consul"
    consul services deregister -id "${SINCRO_REDIS_ID}" || true
}

replace_template_vars

trap unregister_service TERM INT EXIT

consul services register "${TEMPLATE_JSON}"

redis-server "${REDIS_CONFIG}" &
REDIS_PID=$!
echo "Redis started with PID ${REDIS_PID}"

wait $REDIS_PID || REDIS_EXIT_CODE=$?

echo "Redis exited with code ${REDIS_EXIT_CODE}"
unregister_service

exit "${REDIS_EXIT_CODE}"
