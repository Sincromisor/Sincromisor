/** 本番Go/Python出力を既存の隔離journal収集構成へ通し、中央で原因と影響を照合する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { scopeJournalFixture } from "./log-journal-fixture.mjs";

const run = (command, args, options = {}) =>
	execFileSync(command, args, {
		encoding: "utf8",
		timeout: 120000,
		...options,
	}).trim();
const docker = (...args) => run("docker", args);

/** 成功時も失敗時もコンテナだけを落とし、保存データは専用tmpfsとともに消す。 */
test("切断・再接続・合成配送・部分受信の本番ログを中央で照合", {
	timeout: 300000,
}, async () => {
	const project = `diagnostics-test-${process.pid}`;
	const dir = mkdtempSync(join(tmpdir(), "diagnostics-test-"));
	const file = join(dir, "compose.json");
	const compose = (...args) =>
		docker("compose", "-p", project, "-f", file, ...args);
	try {
		const env = {
			...process.env,
			SINCRO_DIAGNOSTIC_FIXTURE_DIR: dir,
			SINCRO_LOG_CONVERSATION_ENABLED: "false",
			SINCRO_LOG_SYNTHESIS_ENABLED: "false",
			GOCACHE: "/tmp/sincro-go-cache",
		};
		run(
			"go",
			[
				"test",
				"-count=1",
				"./internal/pipeline",
				"-run",
				"Test(CentralLogFixture|InterruptionCountsPartialResults)",
			],
			{ cwd: resolve("sincromisor-server/sincro-rtc"), env },
		);
		run(
			resolve(".venv/bin/python"),
			[
				"-m",
				"pytest",
				"-q",
				"sincromisor-server/voice-synthesizer/tests/test_central_log_fixture.py",
			],
			{ env },
		);
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
		];
		const services = Object.fromEntries(
			names.map((name) => [name, cfg.services[name]]),
		);
		for (const service of Object.values(services)) {
			delete service.profiles;
			delete service.ports;
			delete service.build;
			service.pull_policy = "never";
			service.restart = "no";
			service.volumes = (service.volumes ?? []).map((volume) =>
				volume.type === "volume"
					? { type: "tmpfs", target: volume.target }
					: volume,
			);
			// イメージ既定の匿名volumeも残さず、今回のコンテナ内の一時保存に限定する。
			const image = JSON.parse(docker("image", "inspect", service.image))[0];
			for (const target of Object.keys(image.Config.Volumes ?? {})) {
				if (!service.volumes.some((volume) => volume.target === target))
					service.volumes.push({ type: "tmpfs", target });
			}
		}
		services.vector.environment.SINCRO_LOG_SYNTHESIS_ENABLED = "false";
		scopeJournalFixture(services.vector, dir);
		const busybox = docker(
			"image",
			"inspect",
			"busybox:latest",
			"--format",
			"{{.Id}}",
		);
		for (const name of ["sincro-rtc", "voice-synthesizer"]) {
			services[name] = {
				image: busybox,
				pull_policy: "never",
				command: ["sleep", "300"],
				networks: ["sincromisor-net"],
				logging: services.vector.logging,
				volumes: [
					{ type: "bind", source: dir, target: "/fixture", read_only: true },
				],
			};
		}
		writeFileSync(
			file,
			JSON.stringify({ services, networks: { "sincromisor-net": {} } }),
		);
		compose("up", "-d");
		const query = (value) => {
			const output = compose(
				"exec",
				"-T",
				"consul-agent-logging",
				"wget",
				"-T",
				"5",
				"-qO-",
				`--post-data=query=${encodeURIComponent(value)}`,
				"http://victoria-logs:9428/select/logsql/query",
			);
			return output ? output.split("\n").map(JSON.parse) : [];
		};
		for (const [service, files] of [
			["sincro-rtc", ["go-websocket.jsonl", "go-partial.jsonl"]],
			["voice-synthesizer", ["python-delivery.jsonl"]],
		]) {
			for (const name of files) {
				assert.ok(readFileSync(join(dir, name), "utf8").length);
				compose(
					"exec",
					"-T",
					service,
					"sh",
					"-c",
					'cat "$1" > /proc/1/fd/1',
					"sh",
					`/fixture/${name}`,
				);
			}
		}
		let rows = [];
		for (let attempt = 0; attempt < 100; attempt++) {
			try {
				rows = query(
					`project:${project} (service:sincro-rtc OR service:voice-synthesizer)`,
				);
				if (
					rows.some((row) => row.event === "websocket_finished") &&
					rows.filter((row) => row._msg === "pipeline_interrupted").length === 3
				)
					break;
			} catch {
				/* 専用Consulの登録と収集開始を待つ。 */
			}
			await setTimeout(1000);
		}
		const find = (fields) => {
			const row = rows.find((row) =>
				Object.entries(fields).every(
					([key, value]) => row[key] === String(value),
				),
			);
			assert.ok(row, `中央に見つからない属性: ${JSON.stringify(fields)}`);
			return row;
		};
		find({
			service: "sincro-rtc",
			session_id: "fixture-session",
			generation: 1,
			peer: "VoiceSynthesizer",
			close_code: 1011,
			close_reason: "keepalive_ping_timeout",
			operation: "read",
		});
		find({
			service: "sincro-rtc",
			session_id: "fixture-session",
			generation: 2,
			stage: "pipeline_connect_failed",
			peer: "SpeechExtractor",
			connect_stage: "resolve",
			attempt: 1,
		});
		find({
			session_id: "fixture-session",
			generation: 2,
			stage: "pipeline_connect_result",
			outcome: "success",
			attempt: 2,
		});
		find({
			session_id: "interruption-session",
			generation: 1,
			synthesis_sent: 7,
			synthesis_received: 4,
			synthesis_unreceived: 3,
			discarded_text: 8,
			discarded_audio: 4,
		});
		find({
			session_id: "interruption-session",
			generation: 2,
			synthesis_sent: 0,
			synthesis_received: 0,
			synthesis_unreceived: 0,
		});
		find({
			service: "voice-synthesizer",
			session_id: "fixture",
			event: "synthesis_processing",
			outcome: "success",
		});
		const generated = find({
			session_id: "fixture",
			event: "synthesis_generated",
			request_number: 1,
			speech_id: 8,
			sequence_id: 2,
		});
		find({
			event: "synthesis_delivery",
			connection_id: generated.connection_id,
			request_number: 1,
			operation: "send",
			outcome: "failed",
			reason: "connection_failed",
		});
		find({
			event: "websocket_finished",
			connection_id: generated.connection_id,
			operation: "send",
			outcome: "failed",
		});
		for (const marker of [
			"private-",
			"secret-",
			"人工音声",
			"固定された応答文",
			"secret-body",
			"encoded-voice",
		]) {
			assert.ok(
				!JSON.stringify(rows).includes(marker),
				`秘密印が中央へ出た: ${marker}`,
			);
		}
		assert.ok(
			rows.every(
				(row) =>
					row.host === "local" && row.project === project && row.container_id,
			),
		);
		console.log(
			JSON.stringify({
				rows: rows.length,
				close_code: 1011,
				reconnect_attempts: 2,
				synthesis_unreceived: 3,
				discarded_text: 8,
				discarded_audio: 4,
				delivery: "failed",
				secret_markers: 0,
			}),
		);
	} finally {
		try {
			if (existsSync(file)) compose("down");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	}
});
