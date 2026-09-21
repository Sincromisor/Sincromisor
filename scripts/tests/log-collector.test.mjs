/** 人工ログだけのComposeで、Docker収集・Consul転送・停止中の保持を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";

const docker = (...args) =>
	execFileSync("docker", args, { encoding: "utf8", timeout: 120000 }).trim();

test("収集対象の分離、本文解析、Consul経由の送信と障害復旧", {
	timeout: 600000,
}, async () => {
	const project = `collector-test-${process.pid}`;
	const dir = mkdtempSync(join(tmpdir(), "collector-test-"));
	const file = join(dir, "compose.json");
	const cfg = JSON.parse(
		docker(
			"compose",
			"-p",
			project,
			"--env-file",
			"examples/compose.env",
			"-f",
			"compose.yml",
			"config",
			"--format",
			"json",
		),
	);
	for (const service of Object.values(cfg.services))
		assert.equal(service.logging.driver, "journald");
	const names = [
		"victoria-logs",
		"consul-agent-logs",
		"sincro-consul-server",
		"vector",
		"log-observer",
		"log-router",
		"consul-agent-logging",
	];
	const services = Object.fromEntries(
		names.map((name) => [name, cfg.services[name]]),
	);
	const isolated = {
		services,
		volumes: {},
		networks: {
			"sincromisor-net": { ipam: { config: [{ subnet: "172.30.248.0/24" }] } },
		},
	};
	for (const service of Object.values(services)) {
		delete service.profiles;
		delete service.ports;
		delete service.build;
		service.pull_policy = "never";
		for (const volume of service.volumes ?? [])
			if (volume.type === "volume") isolated.volumes[volume.source] = {};
	}
	services["victoria-logs"].networks = {
		"sincromisor-net": { ipv4_address: "172.30.248.10" },
	};
	services.fixture = {
		image: "busybox:latest",
		command: ["sh", "-c", "sleep 600"],
		networks: ["sincromisor-net"],
		logging: services.vector.logging,
	};
	services.initializer = {
		...services.fixture,
		command: ["echo", "短時間コンテナ"],
	};
	const save = () => writeFileSync(file, JSON.stringify(isolated));
	const compose = (...args) =>
		docker("compose", "-p", project, "-f", file, ...args);
	const agent = (...args) =>
		compose("exec", "-T", "consul-agent-logging", ...args);
	const http = (url) => agent("wget", "-T", "5", "-qO-", url);
	const api = (path) => JSON.parse(http(`http://127.0.0.1:8500/v1/${path}`));
	const wait = async (predicate) => {
		for (let n = 0; n < 100; n++) {
			try {
				if (predicate()) return;
			} catch {
				/* Consul再同期とVectorの再試行を待つ。 */
			}
			await setTimeout(1000);
		}
		assert.fail("収集または復旧が時間切れ");
	};
	const rows = () => {
		const output = agent(
			"wget",
			"-T",
			"5",
			"-qO-",
			"--post-data=query=host:local service:fixture",
			"http://victoria-logs:9428/select/logsql/query",
		);
		return output ? output.split("\n").map(JSON.parse) : [];
	};
	const emit = (value) =>
		compose(
			"exec",
			"-T",
			"fixture",
			"sh",
			"-c",
			'printf "%s\\n" "$1" > /proc/1/fd/1',
			"sh",
			value,
		);
	save();
	try {
		compose("up", "-d");
		await wait(() =>
			names
				.slice(0, 1)
				.every(
					() => api("health/service/SincroLogs?passing=true").length === 1,
				),
		);
		await wait(
			() => api("health/service/SincroLogCollector?passing=true").length === 1,
		);
		await wait(
			() => api("health/service/SincroLogRouter?passing=true").length === 1,
		);
		await wait(() =>
			http(
				"http://victoria-logs:9428/select/logsql/query?query=service%3Ainitializer",
			).includes("短時間コンテナ"),
		);
		emit(
			JSON.stringify({
				message: "日本語の人工ログ",
				level: "INFO",
				event: "fixture",
				host: "forged",
				service: "forged",
				session_id: "fixture-session",
			}),
		);
		emit("解析できない人工ログ");
		emit('time=2026-09-22T00:00:00Z level=ERROR msg="構造付きテキスト"');
		emit("Traceback (人工例外):\n  人工スタック\nRuntimeError: 人工失敗");
		await wait(() => rows().some((r) => r._msg === "日本語の人工ログ"));
		const row = rows().find((r) => r._msg === "日本語の人工ログ");
		assert.equal(row.host, "local");
		assert.equal(row.service, "fixture");
		assert.equal(row.project, project);
		assert.equal(row.level, "info");
		assert.equal(row.session_id, "fixture-session");
		assert.ok(row.observed_at);
		assert.ok(row.container_id);
		await wait(() => rows().some((r) => r._msg === "解析できない人工ログ"));
		await wait(() => rows().some((r) => r._msg.includes("人工失敗")));
		// 未登録とDNS停止は中央のIPを直接渡さず、Caddyの失敗と再送で確認する。
		const routerPost = () =>
			compose(
				"exec",
				"-T",
				"log-router",
				"wget",
				"-T",
				"3",
				"-S",
				"-O",
				"/dev/null",
				"--post-data=",
				"http://127.0.0.1:8080/insert/jsonline",
			);
		const unavailable = () => {
			try {
				routerPost();
				return false;
			} catch (error) {
				return /HTTP\/1\.1 50[0234]/.test(String(error.stderr));
			}
		};
		assert.throws(
			() => http("http://log-router:8080/select/logsql/query"),
			/404/,
		);
		compose(
			"exec",
			"-T",
			"consul-agent-logs",
			"consul",
			"services",
			"deregister",
			"-id=SincroLogs_local",
		);
		await wait(unavailable);
		emit("未登録中の保持");
		compose("exec", "-T", "consul-agent-logs", "consul", "reload");
		await wait(() => rows().some((r) => r._msg === "未登録中の保持"));
		compose("stop", "consul-agent-logging");
		await wait(unavailable);
		emit("Consul停止中の保持");
		compose("start", "consul-agent-logging");
		await wait(() => rows().some((r) => r._msg === "Consul停止中の保持"));
		docker(
			"run",
			"--rm",
			"--label",
			"com.docker.compose.project=other-fixture",
			"--label",
			"com.docker.compose.service=fixture",
			"busybox:latest",
			"echo",
			"対象外プロジェクト",
		);
		emit("対象分離の確認");
		await wait(() => rows().some((r) => r._msg === "対象分離の確認"));
		assert.ok(!rows().some((r) => r._msg === "対象外プロジェクト"));
		// 中央不在でもCaddyは生存し、投入失敗を成功に置き換えない。
		compose("stop", "victoria-logs");
		emit("中央停止中の保持");
		await wait(() => {
			const lines = http("http://vector:9598/metrics").split("\n");
			const total = (name) =>
				Number(
					lines
						.find(
							(line) =>
								line.startsWith(`vector_buffer_${name}_events_total{`) &&
								line.includes('component_id="central"'),
						)
						?.match(/} ([0-9.]+)/)?.[1] ?? 0,
				);
			return total("received") > total("sent");
		});
		assert.equal(http("http://log-router:8080/health"), "");
		assert.throws(
			() => http("http://log-router:8080/insert/jsonline"),
			/50[0234]/,
		);
		services["victoria-logs"].networks["sincromisor-net"].ipv4_address =
			"172.30.248.11";
		save();
		compose("up", "-d", "--no-deps", "--force-recreate", "victoria-logs");
		await wait(() => rows().some((r) => r._msg === "中央停止中の保持"));
		// 収集停止中にも業務側は書け、Docker原本から読める。
		compose("stop", "vector");
		emit("収集停止中の原本");
		assert.match(
			compose("logs", "--no-log-prefix", "fixture"),
			/収集停止中の原本/,
		);
		compose("start", "vector");
		await wait(() => rows().some((r) => r._msg === "収集停止中の原本"));
		await wait(
			() => api("health/service/SincroLogCollector?passing=true").length === 1,
		);
		compose("up", "-d", "--force-recreate", "fixture");
		emit("再作成後のログ");
		await wait(() => rows().some((r) => r._msg === "再作成後のログ"));
	} catch (error) {
		console.error(
			compose(
				"logs",
				"--tail",
				"35",
				"vector",
				"log-router",
				"consul-agent-logging",
			),
		);
		throw error;
	} finally {
		compose("down", "-v");
		rmSync(dir, { recursive: true, force: true });
	}
});
