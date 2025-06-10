#!/bin/sh

set -x
set -e

chmod 644 /opt/sincromisor/configs/config.yml

mkdir -p /volumes/sincro-cache
mkdir -p /volumes/sincro-triton
mkdir -p /volumes/sincro-voice
mkdir -p /volumes/consul-data

chown -R sincromisor:sincromisor /volumes/sincro-cache
chown -R sincromisor:sincromisor /volumes/sincro-triton
chown -R sincromisor:sincromisor /volumes/sincro-voice

stat /opt/sincromisor/configs/config.yml
stat /volumes/sincro-cache
stat /volumes/sincro-triton
stat /volumes/sincro-voice
stat /volumes/consul-data

mc alias set sincro-minio \
    "http://${SINCRO_MINIO_PUBLIC_BIND_HOST}:${SINCRO_MINIO_PUBLIC_BIND_PORT}" \
    "${MINIO_ROOT_USER}" \
    "${MINIO_ROOT_PASSWORD}"
