#!/bin/sh

set -e

# 登録の応答や任意IDを公開せず、実行段階と終了値だけを共通ログへ出す。
registration_log() {
    printf '{"event":"service_registration","stage":"%s","outcome":"%s","exit_code":%s}\n' "$1" "$2" "$3"
}

# サービスID生成
generate_service_id() {
    local name="$1"
    local port="$2"
    local ipv4
    ipv4="$(hostname -i)"
    echo "${name}_$(hostname)_${ipv4}:${port}"
}

# テンプレート置換
replace_template_vars() {
    local template="$1"
    local id="$2"
    local ipv4="$3"
    sed -e "s/SERVICE_ID/${id}/g" \
        -e "s/SERVICE_IPV4_ADDRESS/${ipv4}/g" \
        "${template}" > "${template}.configured.json"
}

# Consulサービス登録
register_service() {
    local template="$1"
    registration_log register started 0
    local result=0
    consul services register "${template}.configured.json" >/dev/null 2>&1 || result=$?
    if [ "$result" -ne 0 ]; then
        registration_log register failed "$result"
        return "$result"
    fi
    registration_log register success 0
}

# Consulサービス登録解除
unregister_service() {
    local id="$1"
    local result=0
    consul services deregister -id "${id}" >/dev/null 2>&1 || result=$?
    if [ "$result" -ne 0 ]; then
        registration_log deregister failed "$result"
    else
        registration_log deregister success 0
    fi
}

# IPアドレス監視ループ
monitor_ip_and_reregister() {
    local name="$1"
    local port="$2"
    local template="$3"
    local pid="$4"
    local prev_ipv4 cur_ipv4 id

    prev_ipv4="$(hostname -i)"
    id="$(generate_service_id "$name" "$port")"

    while kill -0 "$pid" 2>/dev/null; do
        sleep 30
        cur_ipv4="$(hostname -i)"
        if [ "$cur_ipv4" != "$prev_ipv4" ]; then
            registration_log address_changed started 0
            unregister_service "$id"
        fi
        id="$(generate_service_id "$name" "$port")"
        replace_template_vars "$template" "$id" "$cur_ipv4"
        register_service "$template"
        prev_ipv4="$cur_ipv4"
    done
}
