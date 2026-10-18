#!/bin/bash

# Engineと再登録ループを所有し、終了時に両方を回収してConsulから解除する。
set -eu
. /service-register.sh

SERVICE_NAME="SincroVoiceVox"
TEMPLATE_JSON="/home/voicevox/.local/voicevox-template.json"
VOICEVOX_PORT=50021
export CONSUL_HTTP_ADDR="http://${SINCRO_CONSUL_AGENT_HOST}:${SINCRO_CONSUL_AGENT_PORT}"
SERVICE_ID="$(generate_service_id "$SERVICE_NAME" "$VOICEVOX_PORT")"
SERVICE_IPV4="$(hostname -i)"
# 登録中の通信停止でもDockerの標準停止猶予10秒内に登録・解除を打ち切る。
# timeoutは3秒後にTERM、応答しなければさらに1秒後に子プロセス群を終了する。
consul() {
    timeout --kill-after=1s 3s /bin/consul "$@"
}

VOICEVOX_PID=""
REGISTRATION_PID=""

cleanup() {
    trap - TERM INT EXIT
    # 再登録を先に止め、解除後に同じIDを登録する競合を防ぐ。
    if [ -n "$REGISTRATION_PID" ]; then
        kill "$REGISTRATION_PID" 2>/dev/null || true
        wait "$REGISTRATION_PID" 2>/dev/null || true
    fi
    if [ -n "$VOICEVOX_PID" ]; then
        kill "$VOICEVOX_PID" 2>/dev/null || true
        wait "$VOICEVOX_PID" 2>/dev/null || true
    fi
    unregister_service "$SERVICE_ID"
}
trap cleanup EXIT
trap 'exit 0' TERM INT

registration_log initialize started 0
replace_template_vars "$TEMPLATE_JSON" "$SERVICE_ID" "$SERVICE_IPV4"
register_service "$TEMPLATE_JSON"

/opt/voicevox_engine/.venv/bin/python /opt/voicevox_engine/run.py \
    --host "${SINCRO_VOICEVOX_HOST}" --port "${SINCRO_VOICEVOX_PORT}" \
    --voicelib_dir /opt/voicevox --runtime_dir /opt/voicevox/onnxruntime/lib \
    --cpu_num_threads 4 --cors_policy_mode all &
VOICEVOX_PID=$!

# コンテナのIPは再作成まで固定。Consul再起動後も30秒間隔で登録を復元する。
# sleepを非同期で待ち、停止シグナルを受けたら待機中の子も直ちに回収する。
(
    trap - EXIT
    timer=""
    trap 'if [ -n "$timer" ]; then kill "$timer" 2>/dev/null || true; wait "$timer" 2>/dev/null || true; fi; exit 0' TERM INT
    while true; do
        sleep 30 &
        timer=$!
        wait "$timer"
        timer=""
        register_service "$TEMPLATE_JSON"
    done
) &
REGISTRATION_PID=$!

# Engine異常終了と登録失敗のいずれもコンテナへ伝え、Composeの再起動に委ねる。
VOICEVOX_EXIT_CODE=0
wait -n "$VOICEVOX_PID" "$REGISTRATION_PID" || VOICEVOX_EXIT_CODE=$?
printf '{"event":"service_child_exit","exit_code":%s}\n' "$VOICEVOX_EXIT_CODE"
exit "$VOICEVOX_EXIT_CODE"
