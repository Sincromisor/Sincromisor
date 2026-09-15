#!/bin/sh
# 明示された認証情報を優先し、未設定なら初期化済みボリュームから読み込む。
# execでサービスへ制御を渡し、停止シグナルをそのまま届ける。
set -eu
SINCRO_AGENT_ADMIN_TOKEN="${SINCRO_AGENT_ADMIN_TOKEN:-$(cat /run/sincromisor-auth/token)}"
SINCRO_PROCESSOR_MASTRA_TOKEN="${SINCRO_PROCESSOR_MASTRA_TOKEN:-$SINCRO_AGENT_ADMIN_TOKEN}"
export SINCRO_AGENT_ADMIN_TOKEN SINCRO_PROCESSOR_MASTRA_TOKEN
exec "$@"
