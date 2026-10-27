/** 既存Vectorイメージと人工journalctlで、カーソル判定と時間切れ後の回収を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { parse } from "yaml";

const vector = parse(readFileSync("compose/log-collector.yml", "utf8")).services
	.vector;
// イメージの取得・ビルドはしない。配置先で既に検証した同じ配布イメージも指定できる。
const image =
	process.env.VECTOR_TEST_IMAGE ?? "ghcr.io/sincromisor/vector:0.60.0";
const run = (script) =>
	execFileSync(
		"docker",
		[
			"run",
			"--rm",
			"--pull=never",
			...(vector.init ? ["--init"] : []),
			"--network=none",
			"--read-only",
			"--tmpfs=/tmp:exec",
			"--tmpfs=/var/lib/vector",
			"--tmpfs=/run",
			"--tmpfs=/var/log/journal",
			"--mount",
			`type=bind,src=${resolve("Docker/logging")},dst=/checks,readonly`,
			"--mount",
			`type=bind,src=${resolve("Docker/logging/check-journal-cursor.sh")},dst=/check-journal-cursor.sh,readonly`,
			"--entrypoint=bash",
			image,
			"-euc",
			script,
		],
		{ encoding: "utf8", timeout: 45000 },
	);

const fixture = `
mkdir -p /var/lib/vector/host_journal /tmp/bin
export PATH=/tmp/bin:$PATH
printf 's=fixture\\nstale-tail' > /var/lib/vector/host_journal/checkpoint.txt
`;

test("カーソル一致・消失・journalctl失敗を区別し、診断に本文を出さない", () => {
	const output = run(`${fixture}
cat > /tmp/bin/journalctl <<'SH'
#!/bin/bash
[[ "$*" == *'-n +1'* && "$*" == *'--cursor=s=fixture'* ]] || exit 99
printf '%s\\n' "$JOURNAL_ENTRY"
printf 'private-error\\n' >&2
exit "$JOURNAL_EXIT"
SH
chmod +x /tmp/bin/journalctl
export JOURNAL_ENTRY='{"__CURSOR":"s=fixture"}' JOURNAL_EXIT=0
bash /checks/check-journal-cursor.sh
test -s /var/lib/vector/journal-last-valid
test ! -e /var/lib/vector/journal-gap.json
previous=$(cat /var/lib/vector/journal-last-valid)
first_marker=

# カーソルの部分一致、空出力、正常な出力後の異常終了はいずれも失敗する。
for mode in mismatch empty failure; do
    case "$mode" in
        mismatch) JOURNAL_ENTRY='{"__CURSOR":"s=fixture-extra"}';;
        empty) JOURNAL_ENTRY='';;
        failure) JOURNAL_ENTRY='{"__CURSOR":"s=fixture"}'; JOURNAL_EXIT=1;;
    esac
    if result=$(bash /checks/check-journal-cursor.sh); then exit 1; fi
    test "$result" = journal_cursor_missing
    test "$(cat /var/lib/vector/journal-last-valid)" = "$previous"
    marker=$(cat /var/lib/vector/journal-gap.json)
    [[ "$marker" == *'"reason":"journal_cursor_missing"'* ]]
    [[ "$marker" == *"\\"from\\":\\"$previous\\""* ]]
    if [[ -n "$first_marker" ]]; then test "$marker" = "$first_marker"; fi
    first_marker=$marker
done

# 復旧しても既存の欠落記録を消さず、チェックポイントなしの初回は成功する。
JOURNAL_ENTRY='{"__CURSOR":"s=fixture"}'; JOURNAL_EXIT=0
bash /checks/check-journal-cursor.sh
test "$(cat /var/lib/vector/journal-gap.json)" = "$first_marker"
rm /var/lib/vector/host_journal/checkpoint.txt
bash /checks/check-journal-cursor.sh
echo cursor_checks_passed
`);
	assert.equal(output.trim(), "cursor_checks_passed");
});

test("TERMと強制終了のどちらでもinitが孤児を回収する", () => {
	assert.equal(vector.init, true);
	const command = vector.healthcheck.test.slice(1);
	assert.deepEqual(command.slice(-2), ["bash", "/check-vector.sh"]);
	assert.equal(vector.healthcheck.timeout, "12s");
	// 本番と同じtimeout引数を使い、journalctlが停止する経路を直接実行する。
	command[command.length - 1] = "/checks/check-journal-cursor.sh";
	const output = run(`${fixture}
cat > /tmp/bin/journalctl <<'SH'
#!/bin/bash
echo $$ > /tmp/journal.pid
if [[ "$IGNORE_TERM" == true ]]; then trap '' TERM; fi
sleep 60 &
echo $! > /tmp/sleep.pid
wait
SH
chmod +x /tmp/bin/journalctl
for mode in false true; do
    export IGNORE_TERM=$mode
    status=0
    { ${command.join(" ")}; } >/tmp/check.out 2>/tmp/check.err || status=$?
    if [[ "$mode" == false ]]; then test "$status" = 124; else test "$status" = 137; fi
    # initの非同期回収を待つ。プロセス不在はゾンビが残っていないことも意味する。
    for attempt in {1..50}; do
        remaining=false
        for pidfile in /tmp/journal.pid /tmp/sleep.pid; do
            if [[ -d /proc/$(cat "$pidfile") ]]; then remaining=true; fi
        done
        if [[ "$remaining" == false ]]; then break; fi
        sleep 0.1
    done
    if [[ "$remaining" != false ]]; then
        for stat in /proc/[0-9]*/stat; do
            read -r pid comm state ppid rest < "$stat" || continue
            printf 'pid=%s comm=%s state=%s ppid=%s\\n' "$pid" "$comm" "$state" "$ppid" >&2
        done
        exit 1
    fi
    for stat in /proc/[0-9]*/stat; do
        read -r pid comm state rest < "$stat" || continue
        test "$state" != Z
    done
done
echo process_checks_passed
`);
	assert.equal(output.trim(), "process_checks_passed");
});

test("実journalのカーソルと追尾の有無をヘルスチェックへ反映する", () => {
	const output = run(`
mkdir -p /run/systemd/journal /var/lib/vector/host_journal
/usr/lib/systemd/systemd-journald >/tmp/journald.out 2>&1 &
journal_pid=$!
for attempt in {1..50}; do
    test -S /run/systemd/journal/stdout && break
    sleep 0.1
done
printf 'synthetic-first\\n' | systemd-cat -t cursor-test
printf 'synthetic-last\\n' | systemd-cat -t cursor-test
journalctl --sync
# exportのカーソル行だけを保存する。JSONの属性順序に依存せず本番の判定を確認する。
journalctl --merge --no-pager -n +1 -o export SYSLOG_IDENTIFIER=cursor-test |
    sed -n 's/^__CURSOR=//p' > /var/lib/vector/host_journal/checkpoint.txt
test -s /var/lib/vector/host_journal/checkpoint.txt
bash /checks/check-journal-cursor.sh
test -s /var/lib/vector/journal-last-valid
test ! -e /var/lib/vector/journal-gap.json

# Vectorの実HTTP生存確認と組み合わせ、journalctlの引数・終了を本番スクリプトで判定する。
cat > /tmp/vector.toml <<'TOML'
[api]
enabled = true
address = "127.0.0.1:8686"
[sources.metrics]
type = "internal_metrics"
[sinks.discard]
type = "blackhole"
inputs = ["metrics"]
TOML
/usr/bin/vector --config /tmp/vector.toml >/tmp/vector.out 2>&1 &
vector_pid=$!
for attempt in {1..50}; do
    if { exec 3<>/dev/tcp/127.0.0.1/8686; } 2>/dev/null; then exec 3<&- 3>&-; break; fi
    sleep 0.1
done
printf '{"start_id":"11111111-1111-1111-1111-111111111111"}\\n' > /var/lib/vector/collector-health.json
if result=$(bash /checks/check-vector.sh); then exit 1; fi
test "$result" = journal_input_unavailable

# 改行を含む別引数をtrで分割すると--followに見えるが、独立引数ではないため拒否する。
cat > /tmp/journalctl <<'SH'
#!/bin/bash
sleep 30 &
wait
SH
chmod +x /tmp/journalctl
/tmp/journalctl $'unrelated\\n--follow' &
fake_pid=$!
if result=$(bash /checks/check-vector.sh); then exit 1; fi
test "$result" = journal_input_unavailable
kill "$fake_pid"
wait "$fake_pid" || true

journalctl --merge --follow -n 0 >/tmp/follow.out 2>&1 &
follow_pid=$!
test "$(bash /checks/check-vector.sh)" = journal_available
grep -q '"healthy":true' /var/lib/vector/collector-health.json
kill "$follow_pid"
wait "$follow_pid" || true
if result=$(bash /checks/check-vector.sh); then exit 1; fi
test "$result" = journal_input_unavailable
grep -q '"healthy":false' /var/lib/vector/collector-health.json
kill "$vector_pid"
wait "$vector_pid"
kill "$journal_pid"
wait "$journal_pid"
echo real_journal_checks_passed
`);
	assert.equal(output.trim(), "real_journal_checks_passed");
});
