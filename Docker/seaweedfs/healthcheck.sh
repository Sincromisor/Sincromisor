#!/bin/sh
# URLは固定のローカル待受だけを受け、応答本文とwgetの生診断を出さない。
output=$(wget -S -O /dev/null "$1" 2>&1)
result=$?
status=$(printf '%s\n' "$output" | sed -n 's/.*HTTP\/[0-9.]* \([0-9][0-9][0-9]\).*/HTTP \1/p' | tail -n 1)
if [ -n "$status" ]; then printf '%s\n' "$status"; else printf 'connection_failed\n'; fi
exit "$result"
