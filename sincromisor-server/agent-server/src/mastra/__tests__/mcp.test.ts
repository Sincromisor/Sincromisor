/** 採用MCPClientで秘密分離、実ツール、異常と取消、設定境界を確認する。 */
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import { noopObserve } from "@mastra/core/tools";
import { connectMcp, parseMcpConfig, readMcpConfig } from "../mcp.js";
import { startMcpFixture } from "./mcp-fixture.js";

test("MCP未設定と無応答の発見失敗でも通常会話用の空集合を返す", {
	timeout: 2000,
}, async () => {
	const empty = await connectMcp(parseMcpConfig({ servers: {} }));
	assert.deepEqual(empty.tools, {});
	await empty.disconnect();
	const server = createServer();
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert(address && typeof address !== "string");
	try {
		const registry = await connectMcp(
			parseMcpConfig({
				servers: {
					missing: {
						url: `http://127.0.0.1:${address.port}/mcp`,
						timeoutMs: 100,
					},
				},
			}),
		);
		assert.deepEqual(registry.tools, {});
		await registry.disconnect();
	} finally {
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
});

test("MCP設定は不在なら空、秘密は管理者専用ファイルに限定する", async () => {
	const dir = await mkdtemp(join(tmpdir(), "sincro-mcp-"));
	const path = join(dir, "mcp.json");
	try {
		assert.deepEqual(await readMcpConfig(path), { servers: {} });
		assert.throws(
			() => parseMcpConfig({ servers: { example: { url: "file:///secret" } } }),
			/Invalid MCP configuration/,
		);
		assert.throws(() =>
			parseMcpConfig({
				servers: { example: { url: "http://localhost", timeoutMs: 30_000 } },
			}),
		);
		await writeFile(path, '{"secret-token":bad-json}', { mode: 0o600 });
		await assert.rejects(readMcpConfig(path), {
			message: "MCP configuration must be valid JSON.",
		});
		await writeFile(
			path,
			JSON.stringify({
				servers: {
					local: {
						url: "http://localhost/mcp",
						headers: { Authorization: "Bearer private" },
					},
				},
			}),
		);
		await chmod(path, 0o644);
		await assert.rejects(readMcpConfig(path), /owner-only permissions/);
		await chmod(path, 0o600);
		assert.equal((await readMcpConfig(path)).servers.local?.timeoutMs, 20_000);
	} finally {
		await rm(dir, { recursive: true });
	}
});

test("実MCPの一覧・認証・呼出し・失敗・上限と取消を扱う", async () => {
	const fixture = await startMcpFixture();
	const registry = await connectMcp(
		parseMcpConfig({
			servers: {
				local: {
					url: fixture.url,
					headers: { Authorization: "Bearer fixture-mcp-token" },
					timeoutMs: 300,
				},
			},
		}),
	);
	try {
		const secret = registry.tools.local_get_secret_word;
		assert(secret?.execute);
		assert(!JSON.stringify(secret.inputSchema).includes("fixture-mcp-token"));
		const result = await secret.execute({}, { observe: noopObserve });
		assert(JSON.stringify(result).includes("琥珀の月583"));
		const fail = registry.tools.local_fail;
		assert(fail?.execute);
		await assert.rejects(fail.execute({}, { observe: noopObserve }));
		const wait = registry.tools.local_wait;
		assert(wait?.execute);
		await assert.rejects(wait.execute({}, { observe: noopObserve }));
		const abort = new AbortController();
		const waiting = wait.execute(
			{},
			{ abortSignal: abort.signal, observe: noopObserve },
		);
		await setTimeout(50);
		abort.abort();
		await assert.rejects(waiting);
		await setTimeout(50);
		assert(fixture.cancelled >= 1);
		assert.deepEqual(fixture.calls, [
			"get_secret_word",
			"fail",
			"wait",
			"wait",
		]);
	} finally {
		await registry.disconnect();
		await fixture.close();
	}
});
