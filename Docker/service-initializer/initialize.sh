#!/bin/sh

set -x
set -e

chmod 644 /opt/sincromisor/configs/config.yml

chown -R sincromisor:sincromisor /opt/sincromisor/.cache

stat /opt/sincromisor/configs/config.yml
stat /opt/sincromisor/.cache

mc alias set sincro-s3 \
    "http://${SINCRO_S3_PUBLIC_BIND_HOST}:${SINCRO_S3_PUBLIC_BIND_PORT}" \
    "${SINCRO_S3_ACCESS_KEY}" \
    "${SINCRO_S3_SECRET_KEY}"

su sincromisor -c '/opt/sincromisor/.local/bin/hf cache ls || true'
if [ "${SINCRO_RECOGNIZER_MODEL}" = "nemo" ]; then
    su sincromisor -c '/opt/sincromisor/.local/bin/hf download reazon-research/reazonspeech-nemo-v2'
elif [ "${SINCRO_RECOGNIZER_MODEL}" = "nue" ]; then
    su sincromisor -c '/opt/sincromisor/.local/bin/hf download rinna/nue-asr'
fi
