#!/bin/sh

set -e

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
    sed -i \
        -e "s/SERVICE_ID/${id}/g" \
        -e "s/SERVICE_IPV4_ADDRESS/${ipv4}/g" \
        "${template}"
}

# Consulサービス登録
register_service() {
    local template="$1"
    consul services register "${template}"
}

# Consulサービス登録解除
unregister_service() {
    local id="$1"
    echo "Unregistering service ${id} from Consul"
    consul services deregister -id "${id}" || true
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
        sleep 10
        cur_ipv4="$(hostname -i)"
        echo "${prev_ipv4} -> ${cur_ipv4}"
        if [ "$cur_ipv4" != "$prev_ipv4" ]; then
            echo "Detected IP address change: $prev_ipv4 -> $cur_ipv4"
            unregister_service "$id"
            id="$(generate_service_id "$name" "$port")"
            replace_template_vars "$template" "$id" "$cur_ipv4"
            register_service "$template"
            prev_ipv4="$cur_ipv4"
        fi
    done
}
