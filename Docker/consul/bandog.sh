#!/bin/sh

# Consulの死活確認で利用可能とされたサービスをDNSで監視する。
# 配置ホストのプロファイルによらず会話に必要な全サービスを必須とする。
# DNS接続先はcompose/consul-server.ymlから渡す。
consul_dns_check(){
    nslookup -type=A "${1}.service.consul." "${CONSUL_DNS_ADDR}" >/dev/null 2>&1
}

while true; do
    SERVICE_FAILURE=0

    consul_dns_check consul || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check RTCSignalingServer || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check SincroFrontend || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check SincroRedis || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check SincroS3 || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check SincroVoiceVox || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check SpeechExtractor || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check SpeechRecognizer || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check TextProcessor || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check VoiceSynthesizer || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))

    consul_dns_check AgentServer || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))
    consul_dns_check LlamaServer || SERVICE_FAILURE=$((SERVICE_FAILURE + 1))

    # Dockerの死活確認は失敗件数0をhealthyとする。10秒ごとに復旧も反映する。
    echo "${SERVICE_FAILURE}" > /services.status
    sleep 10
done
