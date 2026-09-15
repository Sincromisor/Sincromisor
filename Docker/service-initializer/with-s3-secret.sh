#!/bin/sh
# 管理者が指定したキーを優先し、未指定時だけS3専用ボリュームの生成値を使う。
# bootstrapとPythonサービスの既存環境変数へ同じ値を渡す。
set -eu
SINCRO_S3_SECRET_KEY="${SINCRO_S3_SECRET_KEY:-${S3_SECRET_KEY:-$(cat /run/sincromisor-s3-auth/secret)}}"
S3_SECRET_KEY="$SINCRO_S3_SECRET_KEY"
export SINCRO_S3_SECRET_KEY S3_SECRET_KEY
exec "$@"
