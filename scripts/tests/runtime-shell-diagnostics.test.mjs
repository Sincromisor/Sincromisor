/** 起動処理の代役で、失敗段階と終了値だけが出ることを確認する。 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("登録とS3署名確認の失敗を成功にせず秘密を出さない", () => {
	const dir = mkdtempSync(join(tmpdir(), "runtime-shell-"));
	const env = {
		...process.env,
		PATH: `${dir}:${process.env.PATH}`,
		S3_USER: "test",
		S3_ACCESS_KEY: "test",
		S3_SECRET_KEY: "private-secret-token",
		S3_BUCKETS: "test",
		S3_ACTIONS: "Read",
	};
	const command = (name, body) =>
		writeFileSync(join(dir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
	const rows = (result) =>
		result.stdout
			.split("\n")
			.filter((line) => line.startsWith("{"))
			.map((line) => JSON.parse(line));
	try {
		command("consul", "echo private-response-token; exit 7");
		const registered = spawnSync(
			"sh",
			[
				"-c",
				'. "$1"; register_service fake',
				"test",
				resolve("Docker/common/service-register.sh"),
			],
			{ env, encoding: "utf8" },
		);
		assert.equal(registered.status, 7);
		assert.deepEqual(
			rows(registered).map((row) => row.outcome),
			["started", "failed"],
		);
		assert(!registered.stdout.includes("private-"));
		command("weed", "cat; echo private-response-token; exit 0");
		command("curl", "exit 22");
		const bootstrap = spawnSync("sh", ["Docker/seaweedfs/s3-bootstrap.sh"], {
			env,
			encoding: "utf8",
		});
		assert.equal(bootstrap.status, 22);
		assert.equal(rows(bootstrap).at(-1).stage, "signature_check");
		assert.equal(rows(bootstrap).at(-1).outcome, "failed");
		assert(!bootstrap.stdout.includes("private-"));
		for (const [file, variable] of [
			["with-token.sh", "SINCRO_AGENT_ADMIN_TOKEN"],
			["with-s3-secret.sh", "SINCRO_S3_SECRET_KEY"],
		]) {
			const wrapper = spawnSync(
				"sh",
				[`Docker/service-initializer/${file}`, "sh", "-c", "exit 0"],
				{
					env: { ...env, [variable]: "private-secret-token" },
					encoding: "utf8",
				},
			);
			assert.equal(wrapper.status, 0);
			assert.deepEqual(rows(wrapper), [
				{ event: "service_entrypoint", stage: "exec", outcome: "ready" },
			]);
			assert(!wrapper.stdout.includes("private-"));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
