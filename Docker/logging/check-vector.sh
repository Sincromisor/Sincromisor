#!/bin/bash
# VectorのHTTP生存、実ホストjournalの読取、native入力プロセスを別に確認する。
# journalの本文やパスをhealthcheck出力へ複製しない。外側のtimeoutで全体を制限する。
set -eu
state=/var/lib/vector/collector-health.json
start_id=$(sed -n 's/.*"start_id":"\([0-9a-f-]*\)".*/\1/p' "$state" 2>/dev/null | head -n 1)
# 状態はobserverだけが読み、診断出力には本文・journalの位置を含めない。
write_state() {
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    printf '{"start_id":"%s","checked_at":"%s","healthy":%s,"reason":"%s"}\n' "$start_id" "$now" "$1" "$2" > "$state.tmp"
    mv "$state.tmp" "$state"
}
fail() { write_state false "$1"; printf '%s\n' "$1"; exit 1; }
[[ "$start_id" =~ ^[0-9a-f-]{36}$ ]] || fail state_invalid
if ! { exec 3<>/dev/tcp/127.0.0.1/8686; } 2>/dev/null; then fail vector_unavailable; fi
printf 'GET /health HTTP/1.0\r\nHost: localhost\r\n\r\n' >&3
IFS= read -r response <&3 || fail vector_unavailable
[[ "$response" == *' 200 '* ]] || fail vector_unavailable
exec 3<&- 3>&-
# 初回は空journalでもjournalctlが0で終わるため、1件読めることを確認する。
# cursorがある通常時はcheck-journal-cursorの--cursor読取が同じ確認を兼ねる。二重読取を避け、
# 遅い永続journalでも外側の10秒healthcheck内に追尾プロセス確認を残す。
if [[ ! -s /var/lib/vector/host_journal/checkpoint.txt ]]; then
    if ! journalctl --merge --no-pager -n 1 -o json --output-fields=__CURSOR 2>/dev/null | grep -q '"__CURSOR"'; then
        fail journal_unreadable_or_missing
    fi
fi
if ! bash /check-journal-cursor.sh >/dev/null; then fail journal_cursor_missing; fi
# HTTPだけ正常でも、journald子プロセスが起動・再開できなければ異常とする。
for process in /proc/[0-9]*/comm; do
    if [[ -r "$process" ]] && [[ "$(cat "$process" 2>/dev/null)" == journalctl ]]; then
        if tr '\0' '\n' < "${process%/comm}/cmdline" 2>/dev/null | grep -qx -- '--follow'; then
            write_state true available
            printf 'journal_available\n'
            exit 0
        fi
    fi
done
fail journal_input_unavailable
