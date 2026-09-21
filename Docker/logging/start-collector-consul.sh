#!/bin/sh
set -eu

# 設定ファイルへ埋めるホスト識別子はJSON制御文字を受け入れない。
case "${SINCRO_LOG_HOST:-}" in
    ''|*[!a-zA-Z0-9_.-]*) echo 'SINCRO_LOG_HOST must be a host identifier' >&2; exit 1 ;;
esac
cat > /consul/config/collector.json <<CONFIG
{"services":[
{"id":"SincroLogCollector_${SINCRO_LOG_HOST}","name":"SincroLogCollector","address":"vector","port":8686,"check":{"http":"http://vector:8686/health","interval":"10s","timeout":"5s"}},
{"id":"SincroLogRouter_${SINCRO_LOG_HOST}","name":"SincroLogRouter","address":"log-router","port":8080,"check":{"http":"http://log-router:8080/health","interval":"10s","timeout":"5s"}}
]}
CONFIG
# 既定のConsul初期化と権限設定を保ち、Dockerサービス名をDNS応答へ解決する。
exec /usr/local/bin/docker-entrypoint.sh agent "$@" -recursor=127.0.0.11
