/** 実際のCompose定義を隔離し、日本語ログ、DNS再解決、停止・永続保存を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";

const docker = (...args) =>
	execFileSync("docker", args, { encoding: "utf8" }).trim();
const config = (...args) =>
	JSON.parse(
		docker(
			"compose",
			"--env-file",
			"examples/compose.env",
			...args,
			"config",
			"--format",
			"json",
		),
	);

test("中央の設定・検索・永続化とConsulの停止・復旧・DNS更新", {
	timeout: 300000,
}, async () => {
	const standard = config("-f", "compose.yml");
	const distributed = JSON.parse(
		execFileSync(
			"docker",
			[
				"compose",
				"--env-file",
				"examples/compose.env",
				"-f",
				"compose.yml",
				"-f",
				"compose/distributed.yml",
				"config",
				"--format",
				"json",
			],
			{
				encoding: "utf8",
				env: { ...process.env, SINCRO_CONSUL_PUBLISH_HOST: "192.0.2.10" },
			},
		),
	);
	assert.deepEqual(
		distributed.services["victoria-logs"].ports.map((p) => p.host_ip).sort(),
		["127.0.0.1", "192.0.2.10"],
	);
	assert.equal(
		distributed.services["consul-agent-logs"].environment
			.SINCRO_LOG_PUBLIC_HOST,
		"192.0.2.10",
	);
	const central = [
		"victoria-logs",
		"consul-agent-logs",
		"sincro-consul-server",
	];
	for (const [name, service] of Object.entries(standard.services)) {
		if (!central.includes(name)) {
			for (const dependency of Object.keys(service.depends_on ?? {}))
				assert.ok(!central.slice(0, 2).includes(dependency));
		}
	}
	assert.equal(
		standard.services["victoria-logs"].ports[0].host_ip,
		"127.0.0.1",
	);
	const dir = mkdtempSync(join(tmpdir(), "sincro-logs-"));
	const project = `logs-test-${process.pid}`;
	const file = join(dir, "compose.json");
	const services = Object.fromEntries(
		central.map((name) => [name, standard.services[name]]),
	);
	for (const service of Object.values(services)) {
		delete service.profiles;
		delete service.ports;
		delete service.build;
		service.pull_policy = "never";
	}
	services["victoria-logs"].networks = {
		"sincromisor-net": { ipv4_address: "172.30.249.10" },
	};
	const isolated = {
		services,
		networks: {
			"sincromisor-net": { ipam: { config: [{ subnet: "172.30.249.0/24" }] } },
		},
		volumes: {},
	};
	for (const service of Object.values(services))
		for (const volume of service.volumes ?? [])
			if (volume.type === "volume") isolated.volumes[volume.source] = {};
	const save = () => writeFileSync(file, JSON.stringify(isolated));
	const compose = (...args) =>
		docker("compose", "-p", project, "-f", file, ...args);
	const agent = (...args) =>
		compose("exec", "-T", "consul-agent-logs", ...args);
	const api = (path) =>
		JSON.parse(agent("wget", "-qO-", `http://127.0.0.1:8500/v1/${path}`));
	const wait = async (predicate) => {
		// Consulの失敗した状態同期は通常の再同期周期（約1分）で回復する。
		for (let i = 0; i < 90; i++) {
			try {
				if (predicate()) return;
			} catch {
				/* 起動中は再試行する。 */
			}
			await setTimeout(1000);
		}
		assert.fail("期待状態への遷移が時間切れ");
	};
	const check = (status) =>
		wait(() =>
			api("health/checks/SincroLogs").some((c) => c.Status === status),
		);
	const query = () =>
		agent(
			"wget",
			"-qO-",
			"--post-data=query=_time:1h host:fixture service:fixture",
			"http://victoria-logs:9428/select/logsql/query",
		);
	save();
	try {
		compose("up", "-d", "--wait", "--wait-timeout", "60");
		await check("passing");
		const registration = api("catalog/service/SincroLogs")[0];
		assert.equal(registration.ServiceID, "SincroLogs_local");
		assert.equal(registration.ServicePort, 9428);
		assert.match(
			agent("nslookup", "SincroLogs.service.consul", "127.0.0.1:8600"),
			/172\.30\.249\.10/,
		);
		const row = JSON.stringify({
			timestamp: new Date().toISOString(),
			host: "fixture",
			project: "fixture",
			service: "fixture",
			message: "日本語の保存確認",
			sequence_id: 7,
		});
		agent(
			"wget",
			"-qO-",
			"--header=Content-Type: application/stream+json",
			`--post-data=${row}\n`,
			`http://${registration.ServiceAddress}:9428/insert/jsonline?_time_field=timestamp&_msg_field=message&_stream_fields=host,project,service`,
		);
		await wait(() => query().includes("日本語の保存確認"));
		assert.equal(JSON.parse(query()).sequence_id, "7");
		assert.equal(
			execFileSync("jq", ["-r", "._msg"], {
				input: query(),
				encoding: "utf8",
			}).trim(),
			"日本語の保存確認",
		);
		compose("stop", "victoria-logs");
		await check("critical");
		services["victoria-logs"].networks["sincromisor-net"].ipv4_address =
			"172.30.249.11";
		save();
		compose(
			"up",
			"-d",
			"--no-deps",
			"--force-recreate",
			"--wait",
			"victoria-logs",
		);
		await check("passing");
		assert.match(
			agent("nslookup", "SincroLogs.service.consul", "127.0.0.1:8600"),
			/172\.30\.249\.11/,
		);
		assert.match(query(), /日本語の保存確認/);
		compose(
			"up",
			"-d",
			"--no-deps",
			"--force-recreate",
			"--wait",
			"consul-agent-logs",
		);
		await check("passing");
		assert.match(query(), /日本語の保存確認/);
	} catch (error) {
		console.error(compose("logs", "--tail", "40"));
		console.error(api("agent/checks"));
		console.error(agent("consul", "members"));
		throw error;
	} finally {
		// この実行専用の人工ログ領域だけを削除する。
		compose("down", "-v");
		rmSync(dir, { recursive: true, force: true });
	}
});
