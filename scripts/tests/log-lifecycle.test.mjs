/** 人工コンテナの状態とConsul診断が、標準収集経路で中央まで届くことを確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";

const docker = (...args) =>
	execFileSync("docker", args, { encoding: "utf8", timeout: 120000 }).trim();
test("Dockerの状態・理由変更とConsulの実チェックを中央へ保存する", {
	timeout: 360000,
}, async () => {
	const project = `lifecycle-test-${process.pid}`;
	const dir = mkdtempSync(join(tmpdir(), "lifecycle-test-"));
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
	const names = [
		"victoria-logs",
		"consul-agent-logs",
		"sincro-consul-server",
		"vector",
		"log-router",
		"consul-agent-logging",
		"log-observer",
	];
	const services = Object.fromEntries(
		names.map((name) => [name, cfg.services[name]]),
	);
	const isolated = {
		services,
		volumes: {},
		networks: { "sincromisor-net": {} },
	};
	for (const service of Object.values(services)) {
		delete service.profiles;
		delete service.ports;
		delete service.build;
		service.pull_policy = "never";
		for (const volume of service.volumes ?? [])
			if (volume.type === "volume") isolated.volumes[volume.source] = {};
	}
	services.fixture = {
		image: "busybox:latest",
		command: ["sleep", "600"],
		networks: ["sincromisor-net"],
		logging: cfg.services.vector.logging,
		healthcheck: {
			test: [
				"CMD-SHELL",
				"if test -f /tmp/problem; then cat /tmp/problem; exit 1; fi; echo HTTP 200",
			],
			interval: "1s",
			timeout: "1s",
			retries: 1,
		},
	};
	writeFileSync(file, JSON.stringify(isolated));
	const compose = (...args) =>
		docker("compose", "-p", project, "-f", file, ...args);
	const agent = (...args) =>
		compose("exec", "-T", "consul-agent-logging", ...args);
	const wait = async (predicate) => {
		for (let n = 0; n < 120; n++) {
			try {
				if (predicate()) return;
			} catch {}
			await setTimeout(1000);
		}
		assert.fail("中央への状態反映が時間切れ");
	};
	const rows = () => {
		const output = agent(
			"wget",
			"-qO-",
			"--post-data=query=event:docker_* OR event:consul_check",
			"http://victoria-logs:9428/select/logsql/query",
		);
		return output ? output.split("\n").map(JSON.parse) : [];
	};
	const problem = (value) =>
		compose(
			"exec",
			"-T",
			"fixture",
			"sh",
			"-c",
			'printf "%s" "$1" > /tmp/problem',
			"sh",
			value,
		);
	try {
		compose("up", "-d");
		await wait(() =>
			rows().some(
				(row) =>
					row.event === "docker_health" &&
					row.service === "fixture" &&
					row.status === "healthy",
			),
		);
		problem(
			"HTTP 503 Authorization: Bearer artificial-token https://host/?text=人工本文",
		);
		await wait(() =>
			rows().some(
				(row) =>
					row.service === "fixture" && row.diagnostic === "http_status=503",
			),
		);
		problem("HTTP 403 人工本文");
		await wait(() =>
			rows().some(
				(row) =>
					row.service === "fixture" && row.diagnostic === "http_status=403",
			),
		);
		problem("connection_failed");
		await wait(() =>
			rows().some(
				(row) =>
					row.service === "fixture" && row.diagnostic === "connection_failed",
			),
		);
		compose("exec", "-T", "fixture", "rm", "/tmp/problem");
		compose("stop", "-t", "1", "fixture");
		compose("start", "fixture");
		await wait(() =>
			rows().some((row) => row.service === "fixture" && row.action === "die"),
		);
		await wait(() =>
			rows().some((row) => row.service === "fixture" && row.action === "start"),
		);
		agent(
			"sh",
			"-c",
			'printf "%s" "$1" > /tmp/check.json',
			"sh",
			JSON.stringify({
				service: {
					id: "fixture-instance",
					name: "FixtureCheck",
					address: "127.0.0.1",
					port: 1,
					check: { ttl: "10m" },
				},
			}),
		);
		agent("consul", "services", "register", "/tmp/check.json");
		agent(
			"curl",
			"-fsS",
			"-X",
			"PUT",
			"http://127.0.0.1:8500/v1/agent/check/fail/service:fixture-instance?note=HTTP%20503%20artificial-token",
		);
		await wait(() =>
			rows().some(
				(row) =>
					row.event === "consul_check" &&
					row.service_id === "fixture-instance" &&
					row.diagnostic === "http_status=503",
			),
		);
		const all = rows();
		const health = all.find(
			(row) =>
				row.service === "fixture" && row.diagnostic === "http_status=503",
		);
		assert.equal(health.host, "local");
		assert.ok(health.container_id);
		assert.notEqual(health.container_id, health.collector_container_id);
		assert.ok(health.check_start);
		assert.ok(health.check_end);
		assert.equal(health.exit_code, "1");
		const check = all.find(
			(row) =>
				row.service_id === "fixture-instance" &&
				row.diagnostic === "http_status=503",
		);
		assert.ok(check.target_node);
		assert.equal(check.check_id, "service:fixture-instance");
		assert.ok(!JSON.stringify(all).includes("artificial-token"));
		assert.ok(!JSON.stringify(all).includes("人工本文"));
	} catch (error) {
		// 人工検証の安全な診断だけを残し、失敗後も隔離領域は片付ける。
		console.error(compose("logs", "--tail", "20", "log-observer"));
		console.error(
			rows().filter(
				(row) =>
					row.event === "consul_check" && row.service_id === "fixture-instance",
			),
		);
		throw error;
	} finally {
		compose("down", "-v", "--remove-orphans");
		rmSync(dir, { recursive: true, force: true });
	}
});
