#!/bin/bash
# VectorのHTTP生存、実ホストjournalの読取、native入力プロセスを別に確認する。
# journalの本文やパスをhealthcheck出力へ複製しない。外側のtimeoutで全体を制限する。
set -eu
fail() { printf '%s\n' "$1"; exit 1; }
if ! { exec 3<>/dev/tcp/127.0.0.1/8686; } 2>/dev/null; then fail vector_unavailable; fi
printf 'GET /health HTTP/1.0\r\nHost: localhost\r\n\r\n' >&3
IFS= read -r response <&3 || fail vector_unavailable
[[ "$response" == *' 200 '* ]] || fail vector_unavailable
exec 3<&- 3>&-
# 空journalは終了0なので、実在するカーソルも必要とする。出力は判定以外に使わない。
if ! journalctl --merge --no-pager -n 1 -o json --output-fields=__CURSOR 2>/dev/null | grep -q '"__CURSOR"'; then
    fail journal_unreadable_or_missing
fi
bash /check-journal-cursor.sh || exit 1
# HTTPだけ正常でも、journald子プロセスが起動・再開できなければ異常とする。
for process in /proc/[0-9]*/comm; do
    if [[ -r "$process" ]] && [[ "$(cat "$process" 2>/dev/null)" == journalctl ]]; then
        if tr '\0' '\n' < "${process%/comm}/cmdline" 2>/dev/null | grep -qx -- '--follow'; then
            printf 'journal_available\n'
            exit 0
        fi
    fi
done
fail journal_input_unavailable
