#!/bin/sh
# Composeの初回準備を担う。モデル検証失敗時は依存サービスを起動させない。
set -eu

# 秘密値は専用ボリュームで一度だけ生成する。配下を共有するサービスのUIDは異なる。
generate_secret() {
    if [ ! -e "$1" ]; then
        umask 077
        od -An -N32 -tx1 /dev/urandom | tr -d ' \n' > "$1.part"
        chmod 444 "$1.part"
        mv "$1.part" "$1"
    fi
    test "$(wc -c < "$1")" -ge 32
}

case "${1:?初期化対象が必要です}" in
    services)
        # Dockerが作る空の保存先を認識サービスのUIDへ渡す。既存内容は変更しない。
        if [ "$(stat -c %u /cache)" = 0 ]; then
            chown 1001:1001 /cache
        fi
        generate_secret /auth/token
        ;;
    s3)
        # AgentServerのトークンとは別のボリュームへ保存する。
        generate_secret /auth/secret
        ;;
    llama)
        cd /models
        model=${SINCRO_LLAMA_MODEL_FILE:-gemma-4-E2B-it-Q4_0.gguf}
        # 別モデルを指定した管理者のファイルは上書きしない。
        case "$model" in
            */*|''|.|..) echo 'モデルにはファイル名を指定してください。' >&2; exit 1 ;;
        esac
        if [ "$model" != gemma-4-E2B-it-Q4_0.gguf ]; then
            test -s "$model"
            exit
        fi
        checksum=8e30dff3ac4c8434c49a7036fa15564bdbb6044e42bf04550bf1a096ad7e6a52
        if [ ! -e "$model" ]; then
            echo '会話用モデルをダウンロードしています。'
            curl --fail --location --retry 2 --connect-timeout 30 \
                --silent --show-error --output "$model.part" \
                "https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/resolve/b4243c156154b6dca9324415f8c7ccc098b4aed1/$model"
            echo "$checksum  $model.part" | sha256sum -c
            chmod 644 "$model.part"
            mv "$model.part" "$model"
        else
            echo "$checksum  $model" | sha256sum -c
        fi
        ;;
    *) echo '初期化対象が不正です。' >&2; exit 1 ;;
esac
