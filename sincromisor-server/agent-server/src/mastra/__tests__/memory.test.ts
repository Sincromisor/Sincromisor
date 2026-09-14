/** 採用MemoryがLLMへ送る履歴を捕捉し、応答の偶然に依存せずthread分離を確認する。 */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("同じthreadだけに過去の発話を投入し、別会話とStudioに混入しない", async () => {
	const requests: string[] = [];
	const directory = await mkdtemp(join(tmpdir(), "sincro-memory-"));
	const server = createServer(async (request, response) => {
		let body = "";
		for await (const chunk of request) body += chunk;
		requests.push(body);
		response.writeHead(200, { "Content-Type": "text/event-stream" });
		for (const choice of [
			{
				delta: { role: "assistant", content: "確認しました。" },
				finish_reason: null,
			},
			{ delta: {}, finish_reason: "stop" },
		]) {
			response.write(
				`data: ${JSON.stringify({ id: "test", object: "chat.completion.chunk", created: 0, model: "test", choices: [{ index: 0, ...choice }] })}\n\n`,
			);
		}
		response.end("data: [DONE]\n\n");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert(address && typeof address !== "string");
	process.env.SINCRO_AGENT_ADMIN_TOKEN =
		"test-only-token-with-at-least-32-characters";
	process.env.SINCRO_AGENT_LLM_URL = `http://127.0.0.1:${address.port}/v1`;
	process.env.SINCRO_AGENT_LLM_MODEL = "test";
	process.env.SINCRO_AGENT_DB_URL = `file:${join(directory, "memory.db")}`;
	const { mastra } = await import("../application.js");
	try {
		const agent = mastra.getAgent("sincromisor-character");
		for (const [thread, content] of [
			["sincromisor:a", "Aだけの合言葉は赤い森781"],
			["sincromisor:b", "Bだけの合言葉は白い雲923"],
			["studio-test", "Studioだけの合言葉は緑の島456"],
			["sincromisor:a", "前の合言葉を覚えていますか"],
		]) {
			const stream = await agent.stream([{ role: "user", content }], {
				memory: { resource: "sincromisor-local", thread },
			});
			await stream.consumeStream();
			assert.equal(await stream.finishReason, "stop");
		}
		assert.equal(requests.length, 4);
		assert(!requests[1].includes("赤い森781"));
		assert(
			!requests[2].includes("赤い森781") && !requests[2].includes("白い雲923"),
		);
		assert(requests[3].includes("赤い森781"));
		assert(
			!requests[3].includes("白い雲923") && !requests[3].includes("緑の島456"),
		);
		assert.equal(requests[3].split("赤い森781").length - 1, 1);
	} finally {
		// 保存領域だけを先に閉じず、Mastra所有の処理を止めてから接続を解放する。
		await mastra.shutdown();
		server.closeAllConnections();
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		await rm(directory, { recursive: true });
	}
});
