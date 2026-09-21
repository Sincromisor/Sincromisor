#!/bin/sh
set -eu

# ホスト識別子と広告先だけを設定へ埋める。引用符・改行による設定注入を拒否する。
case "${SINCRO_LOG_HOST:-}" in
    ''|*[!a-zA-Z0-9_.-]*) echo 'SINCRO_LOG_HOST must be a host identifier' >&2; exit 1 ;;
esac
case "${SINCRO_LOG_PUBLIC_HOST:-}" in
    ''|*[!a-zA-Z0-9.-]*) echo 'SINCRO_LOG_PUBLIC_HOST must be an IPv4 address or DNS name' >&2; exit 1 ;;
esac
cat > /consul/config/logs.json <<CONFIG
{"service":{"id":"SincroLogs_${SINCRO_LOG_HOST}","name":"SincroLogs","address":"${SINCRO_LOG_PUBLIC_HOST}","port":9428,"check":{"http":"http://victoria-logs:9428/health","interval":"10s","timeout":"5s"}}}
CONFIG
# Docker DNSへ再帰解決し、サービス名の広告でも再作成後のIPをDNS応答へ反映する。
exec /usr/local/bin/docker-entrypoint.sh agent "$@" -recursor=127.0.0.11
