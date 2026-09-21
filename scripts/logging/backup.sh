#!/bin/sh
# 中央だけを停止して整合したtarをボリューム外へ保存し、元の稼働状態へ戻す。
# 使用法: backup.sh 保存先.tar [docker composeの共通オプション...]
set -eu
archive=${1:?保存先tarファイルが必要です}
shift
test ! -e "$archive" || { echo '保存先が既に存在します。' >&2; exit 1; }
container=$(docker compose "$@" ps -aq victoria-logs)
test -n "$container" || { echo '中央コンテナがありません。' >&2; exit 1; }
running=$(docker inspect --format '{{.State.Running}}' "$container")
image=$(docker inspect --format '{{.Config.Image}}' "$container")
partial=$(mktemp "$archive.part.XXXXXX")
# 途中失敗でも一時ファイルを消し、実行前に稼働していた中央は復帰させる。
finish() {
    result=$?
    trap - EXIT HUP INT TERM
    rm -f -- "$partial"
    if [ "$running" = true ]; then docker start "$container" >/dev/null || result=1; fi
    exit "$result"
}
trap finish EXIT
trap 'exit 130' HUP INT TERM
if [ "$running" = true ]; then docker stop "$container" >/dev/null; fi
docker run --rm --network none --volumes-from "$container:ro" --entrypoint /busybox "$image" \
    tar -C /victoria-logs-data -cf - . > "$partial"
ln -- "$partial" "$archive"
printf '中央ログのバックアップを保存しました。\n'
