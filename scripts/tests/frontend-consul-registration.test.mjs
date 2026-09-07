/** 同じコンテナを別IPで再起動しても、登録テンプレート原本を再利用できることを確認する。 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("再起動で登録先を更新し、Caddyの終了コードを返す", () => {
	const dir = mkdtempSync(join(tmpdir(), "sincro-frontend-registration-"));
	const template = readFileSync(
		"Docker/sincro-frontend/frontend-template.json",
		"utf8",
	);
	const templatePath = join(dir, "frontend-template.json");
	try {
		writeFileSync(templatePath, template);
		// 本番スクリプトの配置先だけを一時領域へ向け、起動・登録・終了の流れを実行する。
		const script = readFileSync(
			"Docker/sincro-frontend/start-caddy.sh",
			"utf8",
		).replaceAll("/etc/caddy/", `${dir}/`);
		writeFileSync(join(dir, "start.sh"), script);
		writeFileSync(
			join(dir, "hostname"),
			'#!/bin/sh\nif [ "$1" = "-i" ]; then echo "$TEST_IP"; else echo frontend; fi\n',
			{ mode: 0o755 },
		);
		writeFileSync(
			join(dir, "consul"),
			'#!/bin/sh\nif [ "$2" = register ]; then cat "$3" > "$TEST_REGISTRATION"; fi\n',
			{ mode: 0o755 },
		);
		writeFileSync(join(dir, "caddy"), '#!/bin/sh\nexit "$TEST_CADDY_EXIT"\n', {
			mode: 0o755,
		});
		for (const [address, exitCode] of [
			["192.0.2.10", 0],
			["192.0.2.20", 0],
			["192.0.2.30", 7],
		]) {
			const registration = join(dir, "registered.json");
			const result = spawnSync("sh", [join(dir, "start.sh")], {
				encoding: "utf8",
				env: {
					...process.env,
					PATH: `${dir}:${process.env.PATH}`,
					SINCRO_CONSUL_AGENT_HOST: "consul-agent-frontend",
					SINCRO_CONSUL_AGENT_PORT: "8500",
					TEST_IP: address,
					TEST_REGISTRATION: registration,
					TEST_CADDY_EXIT: String(exitCode),
				},
			});
			assert.equal(result.status, exitCode, result.stderr);
			const { service } = JSON.parse(readFileSync(registration, "utf8"));
			assert.equal(service.address, address);
			assert.equal(service.id, `SincroFrontend_frontend_${address}:80`);
			assert.equal(
				service.check.http,
				`http://${address}:80/api/v1/Frontend/statuses`,
			);
			assert.equal(readFileSync(templatePath, "utf8"), template);
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
