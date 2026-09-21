/** 実Composeのチェックコマンドが秘密を出さず終了値を維持することを確認する。 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import test from "node:test";

test("S3とAgentServerのチェック診断はHTTP状態か接続失敗だけ", () => {
	const cfg = JSON.parse(
		execFileSync(
			"docker",
			[
				"compose",
				"--env-file",
				"examples/compose.env",
				"-f",
				"compose.yml",
				"config",
				"--format",
				"json",
			],
			{ encoding: "utf8" },
		),
	);
	const script = cfg.services["agent-server"].healthcheck.test.at(-1);
	for (const [fake, expected] of [
		[`()=>Promise.resolve({ok:false,status:503})`, "HTTP 503"],
		[`()=>Promise.reject(new Error('private-token'))`, "connection_failed"],
		[`()=>Promise.resolve({ok:true,status:200})`, "HTTP 200"],
	]) {
		const result = spawnSync("node", ["-e", `global.fetch=${fake};${script}`], {
			encoding: "utf8",
		});
		assert.equal(result.stdout.trim(), expected);
		assert.equal(result.status, expected === "HTTP 200" ? 0 : 1);
		assert.ok(!result.stderr.includes("private-token"));
	}
	const dir = mkdtempSync("/tmp/healthcheck-fixture-");
	try {
		for (const [output, code, expected] of [
			["HTTP/1.1 403 Forbidden\nAuthorization: private-token", 1, "HTTP 403"],
			["connection refused private-token", 1, "connection_failed"],
			["HTTP/1.1 200 OK", 0, "HTTP 200"],
		]) {
			writeFileSync(
				`${dir}/wget`,
				`#!/bin/sh\nprintf '%s\\n' '${output}' >&2\nexit ${code}\n`,
				{ mode: 0o755 },
			);
			const result = spawnSync(
				"sh",
				["Docker/seaweedfs/healthcheck.sh", "http://127.0.0.1/"],
				{
					encoding: "utf8",
					env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
				},
			);
			assert.equal(result.stdout.trim(), expected);
			assert.equal(result.status, code);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
