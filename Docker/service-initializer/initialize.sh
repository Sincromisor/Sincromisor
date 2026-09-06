#!/bin/sh

set -e

# 未対応モデルは権限変更・S3接続・モデル取得より前に拒否する。
if [ "${SINCRO_RECOGNIZER_MODEL:-}" != "nemo" ]; then
    echo "未対応のSINCRO_RECOGNIZER_MODELです。nemoを指定してください。" >&2
    exit 1
fi

set -x

chmod 644 /opt/sincromisor/configs/config.yml

chown -R sincromisor:sincromisor /opt/sincromisor/.cache

stat /opt/sincromisor/configs/config.yml
stat /opt/sincromisor/.cache

mc alias set sincro-s3 \
    "http://${SINCRO_S3_PUBLIC_BIND_HOST}:${SINCRO_S3_PUBLIC_BIND_PORT}" \
    "${SINCRO_S3_ACCESS_KEY}" \
    "${SINCRO_S3_SECRET_KEY}"

su sincromisor -c '/opt/sincromisor/.local/bin/hf cache ls || true'
su sincromisor -c '/opt/sincromisor/.local/bin/hf download reazon-research/reazonspeech-nemo-v2'
