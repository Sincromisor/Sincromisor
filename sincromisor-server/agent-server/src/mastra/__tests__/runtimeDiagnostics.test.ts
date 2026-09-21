/** 実LLM代役とlibSQLの書込拒否で、本文を複製せず失敗段階を特定できることを確認する。 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createClient } from "@libsql/client";
import { Mastra } from "@mastra/core";
import { LibSQLStore } from "@mastra/libsql";
import { createCharacterAgent } from "../agents/character.js";
import { createServiceLogger, routeLibraryConsoleLogs } from "../logging.js";
import { observeMemoryOperations } from "../runtimeDiagnostics.js";

test("LLMの503・切断とDBの書込拒否を本文なしで分類する", async () => {
	const dir = await mkdtemp(join(tmpdir(), "runtime-diagnostics-"));
	const logger = createServiceLogger(false);
	const events: Record<string, unknown>[] = [];
	logger.info =
		logger.warn =
		logger.error =
			(_message, fields = {}) => {
				events.push(fields);
			};
	routeLibraryConsoleLogs(logger);
	const db = createClient({ url: `file:${join(dir, "test.db")}` });
	const storage = new LibSQLStore({ id: "runtime-test", client: db });
	const memory = storage.stores.memory;
	assert(memory);
	observeMemoryOperations(memory, logger);
	let failure = "503";
	const server = createServer((_request, response) => {
		if (failure === "503") {
			response.writeHead(503);
			response.end("private-response-token");
		} else response.destroy();
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert(address && typeof address !== "string");
	const agent = createCharacterAgent({
		model: {
			providerId: "llama-server",
			modelId: "test",
			url: `http://127.0.0.1:${address.port}/v1`,
		},
		storage,
		logger,
	});
	const mastra = new Mastra({ agents: { test: agent }, storage, logger });
	try {
		for (const mode of ["503", "disconnect"]) {
			failure = mode;
			events.length = 0;
			try {
				const stream = await agent.stream(
					[{ role: "user", content: "private-request-body" }],
					{ memory: { thread: `sincromisor:${mode}`, resource: "test" } },
				);
				await stream.consumeStream();
			} catch {
				/* 公開側の失敗伝播を許可し、運用診断を別に確認する。 */
			}
			const rows = events.filter((event) => event.event === "llm_request");
			assert(
				rows.some((row) => row.outcome === "started"),
				JSON.stringify(rows),
			);
			assert(
				rows.some((row) => row.outcome === "failed"),
				JSON.stringify(rows),
			);
			if (mode === "503")
				assert(
					rows.some((row) => row.reason === "http_503"),
					JSON.stringify(rows),
				);
			assert(!JSON.stringify(rows).includes("private-"));
		}
		await db.execute("PRAGMA query_only = ON");
		events.length = 0;
		await assert.rejects(
			memory.saveThread({
				thread: {
					id: "sincromisor:db-failure",
					resourceId: "test",
					title: "private-db-body",
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			}),
		);
		const rows = events.filter((event) => event.event === "memory_operation");
		assert(
			rows.some(
				(row) =>
					row.outcome === "failed" &&
					row.stage === "write_thread" &&
					row.reason === "permission_denied",
			),
			JSON.stringify(rows),
		);
		assert(!JSON.stringify(rows).includes("private-"));
	} finally {
		await mastra.shutdown();
		db.close();
		server.closeAllConnections();
		await new Promise<void>((resolve) => server.close(() => resolve()));
		await rm(dir, { recursive: true });
	}
});
