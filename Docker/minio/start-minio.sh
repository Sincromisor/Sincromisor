#!/bin/sh

set -e

TEMPLATE_JSON="/minio-template.json"
MINIO_CONFIG="/usr/local/etc/redis/redis.conf"
MINIO_PORT=80

# Consulアドレス設定
export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
echo "CONSUL_HTTP_ADDR=${CONSUL_HTTP_ADDR}"

# フロントエンドID生成
SINCRO_MINIO_IPV4="$(busybox hostname -i)"
SINCRO_MINIO_ID="SincroMinio_$(busybox hostname)_${SINCRO_MINIO_IPV4}:${MINIO_PORT}"
echo "SINCRO_MINIO_IPV4=${SINCRO_MINIO_IPV4}"
echo "SINCRO_MINIO_ID=${SINCRO_MINIO_ID}"

# テンプレート置換
replace_template_vars() {
    busybox sed -i \
        -e "s/SERVICE_ID/${SINCRO_MINIO_ID}/g" \
        -e "s/MINIO_IPV4_ADDRESS/${SINCRO_MINIO_IPV4}/g" \
        "${TEMPLATE_JSON}"
}

# Consulサービス登録解除
unregister_service() {
    echo "Unregistering service ${SINCRO_MINIO_ID} from Consul"
    consul services deregister -id "${SINCRO_MINIO_ID}" || true
}

replace_template_vars

trap unregister_service TERM INT EXIT

consul services register "${TEMPLATE_JSON}"

minio server /data --console-address ":9001" &
MINIO_PID=$!
echo "Redis started with PID ${MINIO_PID}"

wait $MINIO_PID || MINIO_EXIT_CODE=$?

echo "Redis exited with code ${MINIO_EXIT_CODE}"
unregister_service

exit "${MINIO_EXIT_CODE}"
