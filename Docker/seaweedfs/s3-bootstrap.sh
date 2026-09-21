#!/bin/sh
# バケットを準備し、起動時に選ばれたキーをS3へ反映してから利用サービスを起動する。
set -eu
stage=configuration
finish() {
    result=$?
    outcome=success
    [ "$result" -eq 0 ] || outcome=failed
    printf '{"event":"s3_bootstrap","stage":"%s","outcome":"%s","exit_code":%s}\n' "$stage" "$outcome" "$result"
}
trap finish EXIT
printf '{"event":"s3_bootstrap","stage":"configuration","outcome":"started"}\n'

# weed shellへ渡す値を単一の引数に保つ。生成キーとAWS形式の手動キーを受け付ける。
for value in "${S3_USER:?}" "${S3_ACCESS_KEY:?}" "${S3_SECRET_KEY:?}" "${S3_BUCKETS:?}" "${S3_ACTIONS:?}"; do
    case "$value" in
        *[!a-zA-Z0-9_.,/+=-]*) echo '[bootstrap] 設定値に使用できない文字が含まれています。' >&2; exit 1 ;;
    esac
done

# weed shellは設定JSONに秘密値を含め、内部コマンドの失敗でも終了値が0になる場合がある。
# 出力は公開せず、最後の署名付きS3要求を成功判定にする。
weed_shell() {
    weed shell -master=seaweed-master:9333 -filer=seaweed-filer:8888 > /dev/null 2>&1
}

stage=bucket_create
for bucket in $(printf '%s' "$S3_BUCKETS" | tr ',' ' '); do
    printf 's3.bucket.create -name %s\n' "$bucket" | weed_shell
done

# 認証キーの変更は管理者が選んだ設定の反映として扱い、同じアクセスキーを更新する。
# s3.configureは他の利用者と既存オブジェクトを維持する。
stage=credentials_apply
printf 's3.configure -user=%s -access_key=%s -secret_key=%s -buckets=%s -actions=%s -apply\n' \
    "$S3_USER" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" "$S3_BUCKETS" "$S3_ACTIONS" | weed_shell

stage=signature_check
# 設定通知がS3へ反映されるまで短く再試行する。失敗時は依存サービスの起動を止める。
for bucket in $(printf '%s' "$S3_BUCKETS" | tr ',' ' '); do
    curl --fail --silent --show-error --retry 5 --retry-all-errors --retry-delay 1 \
        --connect-timeout 5 --max-time 10 --output /dev/null \
        --aws-sigv4 aws:amz:us-east-1:s3 --user "$S3_ACCESS_KEY:$S3_SECRET_KEY" \
        "http://sincro-s3:8333/$bucket?max-keys=0"
done
# 初回の認証設定に失敗して無認証のまま応答している場合も成功にしない。
stage=invalid_key_check
status=$(curl --silent --show-error --connect-timeout 5 --max-time 10 --output /dev/null \
    --write-out '%{http_code}' --aws-sigv4 aws:amz:us-east-1:s3 \
    --user "$S3_ACCESS_KEY:$S3_SECRET_KEY-invalid" "http://sincro-s3:8333/$bucket?max-keys=0")
if [ "$status" != 403 ]; then
    echo '[bootstrap] 不正なキーが拒否されることを確認できませんでした。' >&2
    exit 1
fi
echo '[bootstrap] S3のバケットと認証を確認しました。'
