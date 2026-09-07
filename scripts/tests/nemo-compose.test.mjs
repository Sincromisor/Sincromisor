/** 共通初期化を外した構成と、モデル・S3準備の独立した境界を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("モデル初期化は認識だけが担い、S3利用側は認証準備を待つ", () => {
	for (const profile of ["full", "frontend", "backend"]) {
		const config = JSON.parse(
			execFileSync(
				"docker",
				[
					"compose",
					"--env-file",
					"examples/compose.env",
					"config",
					"--format",
					"json",
				],
				{
					encoding: "utf8",
					env: { ...process.env, COMPOSE_PROFILES: profile },
				},
			),
		);
		const services = config.services;
		assert(!services["service-initializer"]);
		if (profile === "frontend") {
			assert.deepEqual(Object.keys(services).sort(), [
				"consul-agent-frontend",
				"sincro-frontend",
			]);
			continue;
		}
		for (const name of ["speech-recognizer", "voice-synthesizer"]) {
			assert.equal(
				services[name].depends_on["s3-bootstrap"].condition,
				"service_completed_successfully",
			);
		}
		assert.deepEqual(Object.keys(services["text-processor"].depends_on), [
			"consul-agent-processor",
		]);
		const cache = services["speech-recognizer"].volumes.find(
			(v) => v.target === "/opt/sincromisor/.cache",
		);
		assert.equal(cache.type, "bind");
		assert(!cache.bind?.create_host_path);
		assert(
			services["speech-recognizer"].build.dockerfile.endsWith(
				"speech-recognizer-nemo/Dockerfile",
			),
		);
	}
});
