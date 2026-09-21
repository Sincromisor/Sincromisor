#!/bin/sh
# 本文を止める場合は下流の推論エラーにも本文を残さず、稼働状況はhealthcheckで監視する。
# ponytail: 無効時は推論詳細も失う。本文を含まない公式出力が提供されたら限定して有効化する。
set -eu
case "${SINCRO_LOG_CONVERSATION_ENABLED-true}" in
    true) exec /app/llama-server "$@" --log-jsonl --log-verbosity 3 ;;
    false) exec /app/llama-server "$@" --log-disable ;;
    *) printf '%s\n' '{"level":"error","event":"configuration_invalid","message":"SINCRO_LOG_CONVERSATION_ENABLED: expected true or false"}' >&2; exit 1 ;;
esac
