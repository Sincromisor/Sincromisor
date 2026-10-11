#!/bin/bash
# 読取再開前のcursor消失を記録してからnative Vectorへ移譲する。
# 原本が欠けても残存分の回収は進め、欠落はobserverから別に公開する。
set -eu
# observerはDocker inspectを使わない。起動ごとに前回の成功状態を無効にして、
# healthcheckが実journalを確認するまで収集可能と判定しない。
state=/var/lib/vector/collector-health.json
start_id=$(cat /proc/sys/kernel/random/uuid)
printf '{"start_id":"%s","checked_at":"","healthy":false,"reason":"starting"}\n' "$start_id" > "$state.tmp"
mv "$state.tmp" "$state"
timeout 10 bash /check-journal-cursor.sh >/dev/null 2>&1 || true
exec /usr/bin/vector "$@"
