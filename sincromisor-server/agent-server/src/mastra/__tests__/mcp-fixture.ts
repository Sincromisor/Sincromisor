/** 固定データと制御可能な失敗・待機だけを提供する、常駐構成外のMCP検証サーバー。 */
import { createServer } from "node:http";
import { setTimeout } from "node:timers/promises";
import { createTool } from "@mastra/core/tools";
import { MCPServer } from "@mastra/mcp";
import { z } from "zod";

export async function startMcpFixture(host = "127.0.0.1", port = 0) {
	const calls: string[] = [];
	let cancelled = 0;
	const mcp = new MCPServer({
		id: "test-mcp",
		name: "無害な確認用MCP",
		version: "1.0.0",
		tools: {
			get_secret_word: createTool({
				id: "get_secret_word",
				description: "確認用の合言葉を取得する。外部データは変更しない。",
				inputSchema: z.object({}),
				execute: async () => {
					calls.push("get_secret_word");
					return { word: "琥珀の月583" };
				},
			}),
			fail: createTool({
				id: "fail",
				description: "失敗確認",
				inputSchema: z.object({}),
				execute: async () => {
					calls.push("fail");
					throw new Error("Intentional tool failure");
				},
			}),
			wait: createTool({
				id: "wait",
				description: "取消確認",
				inputSchema: z.object({}),
				execute: async (_, context) => {
					calls.push("wait");
					try {
						await setTimeout(60_000, undefined, {
							signal: context.mcp?.extra.signal,
						});
					} finally {
						if (context.mcp?.extra.signal.aborted) cancelled++;
					}
					return { completed: true };
				},
			}),
		},
	});
	const server = createServer(async (req, res) => {
		if (req.headers.authorization !== "Bearer fixture-mcp-token") {
			res.writeHead(401).end();
			return;
		}
		if (req.url === "/calls") {
			res
				.writeHead(200, { "Content-Type": "application/json" })
				.end(JSON.stringify({ calls, cancelled }));
			return;
		}
		await mcp.startHTTP({
			url: new URL(req.url ?? "/", `http://${host}`),
			httpPath: "/mcp",
			req,
			res,
		});
	});
	await new Promise<void>((resolve) => server.listen(port, host, resolve));
	const address = server.address();
	if (!address || typeof address === "string")
		throw new Error("Missing fixture address");
	return {
		url: `http://${host}:${address.port}/mcp`,
		calls,
		get cancelled() {
			return cancelled;
		},
		close: async () => {
			await mcp.close();
			server.closeAllConnections();
			await new Promise<void>((resolve) => server.close(() => resolve()));
		},
	};
}
