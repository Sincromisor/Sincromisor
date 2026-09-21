#!/bin/bash
# 読取再開前のcursor消失を記録してからnative Vectorへ移譲する。
# 原本が欠けても残存分の回収は進め、欠落はobserverから別に公開する。
set -eu
timeout 4 bash /check-journal-cursor.sh >/dev/null 2>&1 || true
exec /usr/bin/vector "$@"
