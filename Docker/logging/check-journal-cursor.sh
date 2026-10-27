#!/bin/bash
# nativeの確定cursorが原本に残るか調べる。本文・cursor自体は診断へ出さない。
# 消失の件数は算出できないため、最後の確認からの不明区間を永続化する。
set -eu
# 前景のjournalctlが終わるまでTERM処理を遅らせ、timeoutが子孫へKILLを送る前に親を失わない。
trap 'exit 143' TERM
cursor_file=/var/lib/vector/host_journal/checkpoint.txt
last_valid=/var/lib/vector/journal-last-valid
marker=/var/lib/vector/journal-gap.json
now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [[ -s "$cursor_file" ]]; then
    # native Checkpointerと同じく先頭行だけを読む。短いcursorへの更新後は旧末尾が残り得る。
    cursor=
    IFS= read -r -n 1024 cursor < "$cursor_file" || true
    # 指定位置から1件だけ読む。パイプを使わずjournalctlの終了値も確認する。
    # 消失時は近傍へ移動し得るため、返されたカーソルとの一致も必要になる。
    if ! entry=$(journalctl --merge --no-pager --cursor="$cursor" -n +1 -o json --output-fields=__CURSOR 2>/dev/null) ||
        [[ "$entry" != *\""$cursor"\"* ]]; then
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
