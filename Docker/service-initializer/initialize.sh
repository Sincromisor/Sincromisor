#!/bin/sh

set -x
set -e

chmod 644 /opt/sincromisor/configs/config.yml

chown -R sincromisor:sincromisor /opt/sincromisor/.cache

stat /opt/sincromisor/configs/config.yml
stat /opt/sincromisor/.cache

mc alias set sincro-minio \
    "http://${SINCRO_MINIO_PUBLIC_BIND_HOST}:${SINCRO_MINIO_PUBLIC_BIND_PORT}" \
    "${SINCRO_MINIO_ACCESS_KEY}" \
    "${SINCRO_MINIO_SECRET_KEY}"

su sincromisor -c '/opt/sincromisor/.local/bin/uv run huggingface-cli scan-cache -vvv'
if [ "${SINCRO_RECOGNIZER_MODEL}" = "nemo" ]; then
    su sincromisor -c '/opt/sincromisor/.local/bin/uv run huggingface-cli download reazon-research/reazonspeech-nemo-v2'
elif [ "${SINCRO_RECOGNIZER_MODEL}" = "nue" ]; then
    su sincromisor -c '/opt/sincromisor/.local/bin/uv run huggingface-cli download rinna/nue-asr'
fi
