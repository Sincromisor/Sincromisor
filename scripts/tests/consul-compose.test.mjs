/** 標準・分散配置・管理用の公開境界を、実際に結合したCompose出力で固定する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const managementHost = "192.0.2.10";

/** 実環境のCompose選択・広告先を混ぜず、配布用設定と指定した追加ファイルを検査する。 */
function config(profile, overlays = []) {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(
			([key]) => !/^(COMPOSE_|SINCRO_)/.test(key),
		),
	);
	return JSON.parse(
		execFileSync(
			"docker",
			[
				"compose",
				"--env-file",
				"examples/compose.env",
				"-f",
				"compose.yml",
				...overlays.flatMap((name) => ["-f", `compose/${name}.yml`]),
				"config",
				"--format",
				"json",
			],
			{
				encoding: "utf8",
				env: {
					...env,
					COMPOSE_PROFILES: profile,
					SINCRO_CONSUL_PUBLISH_HOST: managementHost,
				},
			},
		),
	).services;
}

function ports(services) {
	return Object.entries(services)
		.flatMap(([name, service]) =>
			(service.ports ?? []).map(
				(port) =>
					`${name} ${port.host_ip ?? "*"}:${port.published}:${port.target}/${port.protocol}`,
			),
		)
		.sort();
}

test("標準fullの公開はHTTPとメディアUDPだけで、登録先は内部サービス名になる", () => {
	const full = config("full");
	assert.deepEqual(ports(full), [
		"sincro-frontend *:8086:80/tcp",
		"sincro-rtc *:3479:3479/udp",
	]);
	for (const [name, prefix] of [
		["speech-extractor", "EXTRACTOR"],
		["speech-recognizer", "RECOGNIZER"],
		["text-processor", "PROCESSOR"],
		["voice-synthesizer", "SYNTHESIZER"],
	]) {
		assert.equal(
			full[name].environment[`SINCRO_${prefix}_PUBLIC_BIND_HOST`],
			name,
		);
	}
	assert(full["consul-agent-rtc"].command.includes("-advertise="));
});

test("分散fullはRTC・下流API・Consulのホスト間通信だけを管理IPへ追加する", () => {
	const full = config("full", ["distributed"]);
	const expected = ports(config("full"));
	for (const [name, port] of [
		["sincro-rtc", 8001],
		["speech-extractor", 8002],
		["speech-recognizer", 8003],
		["text-processor", 8004],
		["voice-synthesizer", 8005],
		["sincro-consul-server", 8300],
	])
		expected.push(`${name} ${managementHost}:${port}:${port}/tcp`);
	const agents = [
		"rtc",
		"frontend",
		"extractor",
		"recognizer",
		"processor",
		"synthesizer",
		"redis",
		"s3",
	];
	for (const [name, port] of [
		["sincro-consul-server", 8301],
		...agents.map((name, i) => [`consul-agent-${name}`, 8311 + i]),
	]) {
		for (const protocol of ["tcp", "udp"])
			expected.push(`${name} ${managementHost}:${port}:${port}/${protocol}`);
	}
	assert.deepEqual(ports(full), expected.sort());
});

test("管理用はループバックだけに追加し、rtcプロファイルにサーバーを混入させない", () => {
	const rtc = config("rtc", ["distributed", "management"]);
	assert.deepEqual(Object.keys(rtc).sort(), ["consul-agent-rtc", "sincro-rtc"]);
	assert.equal(
		rtc["sincro-rtc"].depends_on["consul-agent-rtc"].condition,
		"service_healthy",
	);
	assert.deepEqual(
		ports(rtc),
		[
			`consul-agent-rtc ${managementHost}:8311:8311/tcp`,
			`consul-agent-rtc ${managementHost}:8311:8311/udp`,
			"sincro-rtc *:3479:3479/udp",
			"sincro-rtc 127.0.0.1:8001:8001/tcp",
			`sincro-rtc ${managementHost}:8001:8001/tcp`,
		].sort(),
	);
	assert.deepEqual(ports(config("full", ["management"])), [
		"sincro-consul-server 127.0.0.1:8500:8500/tcp",
		"sincro-frontend *:8086:80/tcp",
		"sincro-rtc *:3479:3479/udp",
		"sincro-rtc 127.0.0.1:8001:8001/tcp",
	]);
});
