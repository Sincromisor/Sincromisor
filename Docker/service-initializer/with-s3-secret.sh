#!/bin/sh
# 秘密の読取・検証とexecの失敗段階だけを記録し、子へ停止シグナルを直接渡す。
set -eu
stage=secret_read
finish() {
    result=$?
    printf '{"event":"service_entrypoint","stage":"%s","outcome":"failed","exit_code":%s}\n' "$stage" "$result"
}
trap finish EXIT
SINCRO_S3_SECRET_KEY="${SINCRO_S3_SECRET_KEY:-${S3_SECRET_KEY:-$(cat /run/sincromisor-s3-auth/secret 2>/dev/null)}}"
stage=secret_validate
test -n "$SINCRO_S3_SECRET_KEY"
S3_SECRET_KEY="$SINCRO_S3_SECRET_KEY"
export SINCRO_S3_SECRET_KEY S3_SECRET_KEY
stage=exec
printf '{"event":"service_entrypoint","stage":"exec","outcome":"ready"}\n'
exec "$@"
