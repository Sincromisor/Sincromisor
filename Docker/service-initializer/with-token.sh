#!/bin/sh
# 秘密の読取・検証とexecの失敗段階だけを記録し、子へ停止シグナルを直接渡す。
set -eu
stage=secret_read
finish() {
    result=$?
    printf '{"event":"service_entrypoint","stage":"%s","outcome":"failed","exit_code":%s}\n' "$stage" "$result"
}
trap finish EXIT
SINCRO_AGENT_ADMIN_TOKEN="${SINCRO_AGENT_ADMIN_TOKEN:-$(cat /run/sincromisor-auth/token 2>/dev/null)}"
stage=secret_validate
test -n "$SINCRO_AGENT_ADMIN_TOKEN"
SINCRO_PROCESSOR_MASTRA_TOKEN="${SINCRO_PROCESSOR_MASTRA_TOKEN:-$SINCRO_AGENT_ADMIN_TOKEN}"
export SINCRO_AGENT_ADMIN_TOKEN SINCRO_PROCESSOR_MASTRA_TOKEN
stage=exec
printf '{"event":"service_entrypoint","stage":"exec","outcome":"ready"}\n'
exec "$@"
