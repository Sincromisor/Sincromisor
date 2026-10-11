/** 独立したネットワークと保存状態を持つ2収集元から、中央1台への配送を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { scopeJournalFixture } from "./log-journal-fixture.mjs";

const docker = (...args) =>
	execFileSync("docker", args, { encoding: "utf8", timeout: 120000 }).trim();

// Composeのホスト識別とプロジェクト選別をそれぞれ展開し、状態ボリュームは共有しない。
function collector(dir, suffix) {
	const project = `multihost-${process.pid}-${suffix}`;
	const host = `fixture-${suffix}`;
	const cfg = JSON.parse(
		execFileSync(
			"docker",
			[
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
			],
			{
				encoding: "utf8",
				env: { ...process.env, SINCRO_LOG_HOST: host },
			},
		),
	);
	const names = [
		"sincro-consul-server",
		"consul-agent-logs",
		"vector",
		"log-observer",
		"log-router",
		"consul-agent-logging",
	];
	if (suffix === "a") names.push("victoria-logs");
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
		for (const volume of service.volumes ?? []) {
			assert.ok(!String(volume.source).includes("docker.sock"));
			if (volume.type === "volume") isolated.volumes[volume.source] = {};
		}
	}
	services.fixture = {
		image: "busybox:latest",
		command: ["sh", "-c", "sleep 600"],
		networks: ["sincromisor-net"],
		logging: services.vector.logging,
	};
	const file = join(dir, `${suffix}.json`);
	scopeJournalFixture(services.vector, dir);
	writeFileSync(file, JSON.stringify(isolated));
	const compose = (...args) =>
		docker("compose", "-p", project, "-f", file, ...args);
	return { project, host, compose };
}

test("独立した2収集元の識別と中央保存先の共有", {
	timeout: 300000,
}, async () => {
	const dir = mkdtempSync(join(tmpdir(), "multihost-test-"));
	const first = collector(dir, "a");
	const second = collector(dir, "b");
	const query = () => {
		const output = first.compose(
			"exec",
			"-T",
			"consul-agent-logs",
			"wget",
			"-T",
			"5",
			"-qO-",
			"--post-data=query=service:fixture",
			"http://victoria-logs:9428/select/logsql/query",
		);
		return output ? output.split("\n").map(JSON.parse) : [];
	};
	try {
		first.compose("up", "-d");
		second.compose("up", "-d");
		// 中央だけを両ネットワークへ接続し、収集元同士に通信やボリューム共有を作らない。
		docker(
			"network",
			"connect",
			"--alias",
			"victoria-logs",
			`${second.project}_sincromisor-net`,
			first.compose("ps", "-q", "victoria-logs"),
		);
		for (const source of [first, second]) {
			source.compose(
				"exec",
				"-T",
				"fixture",
				"sh",
				"-c",
				'printf "%s\\n" "$1" > /proc/1/fd/1',
				"sh",
				`独立収集-${source.host}`,
			);
		}
		let rows = [];
		for (let n = 0; n < 120; n++) {
			try {
				rows = query();
				if (
					[first, second].every((source) =>
						rows.some((row) => row._msg === `独立収集-${source.host}`),
					)
				)
					break;
			} catch {
				/* 中央の起動とConsul登録を待つ。 */
			}
			await setTimeout(1000);
		}
		for (const source of [first, second]) {
			const matched = rows.filter(
				(row) => row._msg === `独立収集-${source.host}`,
			);
			assert.ok(matched.length > 0, `${source.host}の配送が時間切れ`);
			for (const row of matched) {
				assert.equal(row.host, source.host);
				assert.equal(row.project, source.project);
				assert.equal(row.service, "fixture");
				assert.ok(row.container_id);
			}
		}
	} catch (error) {
		// 人工構成の診断を後始末前に保存し、実ホストのjournal本文は取り出さない。
		for (const source of [first, second]) {
			console.error(
				source.compose(
					"logs",
					"--tail",
					"30",
					"vector",
					"log-observer",
					"log-router",
				),
			);
		}
		throw error;
	} finally {
		// 中央を先に削除し、追加接続した第2ネットワークもComposeで解放できるようにする。
		first.compose("down", "-v");
		second.compose("down", "-v");
		rmSync(dir, { recursive: true, force: true });
	}
});
