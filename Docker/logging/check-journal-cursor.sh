#!/bin/bash
# nativeの確定cursorが原本に残るか調べる。本文・cursor自体は診断へ出さない。
# 消失の件数は算出できないため、最後の確認からの不明区間を永続化する。
set -eu
cursor_file=/var/lib/vector/host_journal/checkpoint.txt
last_valid=/var/lib/vector/journal-last-valid
marker=/var/lib/vector/journal-gap.json
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [[ -s "$cursor_file" ]]; then
    # native Checkpointerと同じく先頭行だけを読む。短いcursorへの更新後は旧末尾が残り得る。
    cursor=$(head -c 1024 "$cursor_file" | head -n 1)
    if ! journalctl --merge --no-pager --cursor="$cursor" -n 1 -o json --output-fields=__CURSOR 2>/dev/null | grep -Fq -- "$cursor"; then
        if [[ ! -e "$marker" ]]; then
            since=unknown
            if [[ -s "$last_valid" ]]; then since=$(cat "$last_valid"); fi
            [[ "$since" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || since=unknown
            printf '{"event":"logging_loss_unknown","reason":"journal_cursor_missing","from":"%s","to":"%s","loss_count":null}\n' "$since" "$now" > "$marker.tmp"
            mv "$marker.tmp" "$marker"
        fi
        printf 'journal_cursor_missing\n'
        exit 1
    fi
fi
printf '%s\n' "$now" > "$last_valid.tmp"
mv "$last_valid.tmp" "$last_valid"
