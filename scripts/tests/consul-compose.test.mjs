/** RTC用の分離プロファイルと、Consulの公開境界をCompose出力で固定する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentPorts = new Set([8311, 8312, 8313, 8314, 8315, 8316, 8317, 8318]);

function config(profile) {
	return JSON.parse(
		execFileSync(
			"docker",
			["compose", "--env-file", "examples/compose.env", "config", "--format", "json"],
			{ encoding: "utf8", env: { ...process.env, COMPOSE_PROFILES: profile } },
		),
	);
}

test("rtcは同一ホストのエージェントだけを追加し、gossipだけを公開する", () => {
	const rtc = config("rtc").services;
	assert.deepEqual(Object.keys(rtc).sort(), ["consul-agent-rtc", "sincro-rtc"]);
	assert.equal(rtc["sincro-rtc"].depends_on["consul-agent-rtc"].condition, "service_healthy");
	assert.deepEqual(
		rtc["consul-agent-rtc"].ports.map((port) => Number(port.published)).sort(),
		[8311, 8311],
	);
	assert(!rtc["consul-agent-rtc"].ports.some((port) => Number(port.published) === 8500));

	const full = config("full").services;
	assert("sincro-consul-server" in full);
	const published = Object.values(full)
		.filter((service) => service.command?.includes("-client=0.0.0.0"))
		.flatMap((service) => service.ports ?? [])
		.filter((port) => agentPorts.has(Number(port.published)));
	assert.equal(published.length, agentPorts.size * 2);
	assert.deepEqual(new Set(published.map((port) => Number(port.published))), agentPorts);

	for (const file of [
		"compose/consul-server.yml",
		"compose/sincro-rtc.yml",
		"compose/frontend.yml",
		"compose/speech-extractor.yml",
		"compose/speech-recognizer.yml",
		"compose/text-processor.yml",
		"compose/voice-synthesizer.yml",
		"compose/redis.yml",
		"compose/s3.yml",
	]) {
		assert.match(
			readFileSync(file, "utf8"),
			/\$\{SINCRO_CONSUL_PUBLISH_HOST:-127\.0\.0\.1}/,
		);
	}
});
