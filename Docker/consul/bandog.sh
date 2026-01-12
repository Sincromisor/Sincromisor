#!/bin/sh

# compose/consul-server.ymlで設定
# export CONSUL_DNS_ADDR=sincro-consul-server:8600
# CONSUL_HTTP_ADDR=127.0.0.1:8500

consul_dns_check(){
    nslookup -type=A "${1}.service.consul." "${CONSUL_DNS_ADDR}" >/dev/null 2>&1
    return $?
}

consul_dns_check && echo ok

export SERVICE_FAILURE

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

    echo "${SERVICE_FAILURE}" > /services.status
    sleep 10
done
