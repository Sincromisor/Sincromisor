/** chat専用の起動範囲と、モデルを外部取得しない内部API構成を確認する。 */
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
		assert.deepEqual(Object.keys(llama.networks), ["sincromisor-net"]);
		assert.equal(llama.volumes[0].target, "/models");
		assert.equal(llama.volumes[0].read_only, true);
		assert(!llama.volumes[0].bind?.create_host_path);
		assert(llama.command.includes("/models/gemma-4-E2B-it-Q4_0.gguf"));
		assert(!llama.command.includes("-hf"));
		assert(llama.healthcheck.test.includes("--fail"));
	}
});
