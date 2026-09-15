/** chat専用の起動範囲と、初期化完了を待つ内部API構成を確認する。 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("llama-serverはchat専用で固定イメージと読み取り専用モデルを使う", () => {
	for (const profile of ["full", "backend", "rtc", "chat"]) {
		const { services } = JSON.parse(
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
		const llama = services["llama-server"];
		if (profile !== "chat") {
			assert.equal(llama, undefined);
			continue;
		}
		assert.match(llama.image, /@sha256:[a-f0-9]{64}$/);
		assert.equal(llama.ports, undefined);
		assert.equal(
			llama.command[llama.command.indexOf("--n-gpu-layers") + 1],
			"99",
		);
		assert.deepEqual(llama.deploy.resources.reservations.devices, [
			{ driver: "nvidia", count: 1, capabilities: ["gpu"] },
		]);
		assert.deepEqual(Object.keys(llama.networks), ["sincromisor-net"]);
		assert.equal(llama.volumes[0].target, "/models");
		assert.equal(llama.volumes[0].read_only, true);

		assert.equal(
			llama.depends_on["llama-model-initializer"].condition,
			"service_completed_successfully",
		);
		assert.equal(
			services["llama-model-initializer"].volumes[1].source,
			llama.volumes[0].source,
		);
		assert(llama.command.includes("/models/gemma-4-E2B-it-Q4_0.gguf"));
		assert(!llama.command.includes("-hf"));
		assert(llama.healthcheck.test.includes("--fail"));
	}
});
