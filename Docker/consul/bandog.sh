#!/bin/sh

# Consulの死活確認で利用可能とされたサービスをDNSで監視する。
# 配置ホストのプロファイルによらず会話に必要な全サービスを必須とする。
# DNS接続先はcompose/consul-server.ymlから渡す。
consul_dns_check(){
    nslookup -type=A "${1}.service.consul." "${CONSUL_DNS_ADDR}" >/dev/null 2>&1
}

# 固定サービス名だけをJSONへ埋め、配置ホストは収集側が付ける。
# 前回値は一時ファイルに保持し、再起動後は全対象を初回として記録する。
state_dir=$(mktemp -d)
trap 'rm -rf "$state_dir"' EXIT
while true; do
    SERVICE_FAILURE=0
    for service in consul RTCSignalingServer SincroFrontend SincroRedis SincroS3 \
        SincroVoiceVox SpeechExtractor SpeechRecognizer TextProcessor VoiceSynthesizer \
        AgentServer LlamaServer SincroLogCollector SincroLogRouter SincroLogs SincroLogObserver; do
        status=passing
        if ! consul_dns_check "$service"; then
            status=critical
            SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
        fi
        previous=$(cat "$state_dir/$service" 2>/dev/null || true)
        if [ "$status" != "$previous" ]; then
            printf '{"timestamp":"%s","level":"info","event":"bandog_dns","message":"DNS service status","target_service":"%s","status":"%s"}\n' \
                "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$service" "$status"
            printf '%s' "$status" > "$state_dir/$service"
        fi
    done
    # 既存の失敗件数による死活判定を維持する。
    echo "${SERVICE_FAILURE}" > /services.status
    sleep 10
done
