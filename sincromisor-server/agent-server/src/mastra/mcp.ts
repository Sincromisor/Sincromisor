/** 管理者のMCP設定を検証し、接続したツールだけをStudioの選択候補へ登録する。 */
import { readFile, stat } from "node:fs/promises";
import { noopLogger } from "@mastra/core/logger";
import type { Processor } from "@mastra/core/processors";
import { MCPClient } from "@mastra/mcp";
import { z } from "zod";
import { conversationId, createServiceLogger } from "./logging.js";
import { failureReason } from "./runtimeDiagnostics.js";

/** ファイルと将来の管理画面で共用する設定境界。実行コードや指示は受け付けない。 */
export const mcpConfigSchema = z.strictObject({
	servers: z.record(
		z.string().regex(/^[a-z][a-z0-9-]*$/),
		z.strictObject({
			url: z.url().refine((value) => {
				const url = new URL(value);
				return (
					["http:", "https:"].includes(url.protocol) &&
					!url.username &&
					!url.password &&
					!url.hash
				);
			}),
			headers: z
				.record(
					z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/),
					z.string().regex(/^[^\r\n]*$/),
				)
				.default({}),
			// Pythonの無受信30秒より先にツール失敗を通知する。
			timeoutMs: z.number().int().positive().max(20_000).default(20_000),
		}),
	),
});

/** 入力値をエラーへ含めず検証する。将来の設定保存APIもこの関数を使う。 */
export function parseMcpConfig(value: unknown) {
	const result = mcpConfigSchema.safeParse(value);
	if (!result.success) throw new Error("Invalid MCP configuration.");
	return result.data;
}

/** 未配置は未設定として扱い、秘密を含み得る設定は管理者専用の権限に限定する。 */
export async function readMcpConfig(path: string) {
	let data: string;
	try {
		data = await readFile(path, "utf8");
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return parseMcpConfig({ servers: {} });
		throw error;
	}
	let value: unknown;
	try {
		value = JSON.parse(data);
	} catch {
		// JSON.parseの例外には入力断片が入るため、秘密を含まない診断へ置き換える。
		throw new Error("MCP configuration must be valid JSON.");
	}
	const config = parseMcpConfig(value);
	if (Object.keys(config.servers).length && (await stat(path)).mode & 0o077)
		throw new Error(
			"MCP configuration requires owner-only permissions (0600).",
		);
	return config;
}

/** サービスが接続を所有する。設定の再読込みは再作成時に行い、稼働中の入替えはしない。 */
export async function connectMcp(
	config: z.infer<typeof mcpConfigSchema>,
	logger = createServiceLogger(false),
) {
	if (!Object.keys(config.servers).length)
		logger.info("MCP inactive", { event: "mcp_inactive" });
	const clients: MCPClient[] = [];
	const tools: Awaited<ReturnType<MCPClient["listTools"]>> = {};
	for (const [id, server] of Object.entries(config.servers)) {
		const start = performance.now();
		logger.info("MCP discovery started", {
			event: "mcp_discovery_started",
			server: id,
		});
		const discovery = new AbortController();
		let timer: NodeJS.Timeout | undefined;
		const deadline = new Promise<never>((_, reject) => {
			timer = setTimeout(() => {
				discovery.abort();
				reject(new Error("MCP discovery timed out."));
			}, server.timeoutMs);
		});
		const client = new MCPClient({
			id: `sincromisor-${id}`,
			timeout: server.timeoutMs,
			servers: {
				[id]: {
					url: new URL(server.url),
					requestInit: { headers: server.headers },
					timeout: server.timeoutMs,
					// 発見待ちも時間内に取消す。通常のツール要求にはSDKのSignalを引き継ぐ。
					fetch: (input, init) =>
						fetch(input, {
							...init,
							signal: AbortSignal.any([
								discovery.signal,
								...(init?.signal ? [init.signal] : []),
							]),
						}),
					enableServerLogs: false,
					logger: ({ level }) => {
						if (level === "error" || level === "warning")
							logger.warn("MCP transport failure", {
								event: "mcp_transport_failure",
								server: id,
							});
					},
				},
			},
		});
		// 下位ライブラリーの例外詳細には外部応答が含まれる。接続診断は上の名前だけで記録する。
		client.__setLogger(noopLogger);
		try {
			for (const [name, tool] of Object.entries(
				await Promise.race([client.listTools(), deadline]),
			)) {
				const execute = tool.execute?.bind(tool);
				if (!execute) continue;
				tools[name] = {
					...tool,
					execute: async (input, context) => {
						const started = performance.now();
						const sessionId = conversationId({
							memory: {
								thread: context?.requestContext?.get("mastra__threadId"),
							},
						});
						const ids = sessionId ? { session_id: sessionId } : {};
						logger.info("MCP tool started", {
							event: "mcp_tool_started",
							...ids,
							server: id,
							tool: name,
						});
						try {
							const result = await execute(input, context);
							const failed =
								typeof result === "object" &&
								result !== null &&
								"isError" in result &&
								result.isError === true;
							logger.info(failed ? "MCP tool failed" : "MCP tool succeeded", {
								event: "mcp_tool_finished",
								...ids,
								server: id,
								tool: name,
								outcome: failed ? "failed" : "success",
								reason: failed ? "tool_error" : "completed",
								duration_ms: performance.now() - started,
							});
							return result;
						} catch (error) {
							const reason = context?.abortSignal?.aborted
								? "cancelled"
								: failureReason(error);
							logger.warn("MCP tool failed", {
								event: "mcp_tool_finished",
								...ids,
								server: id,
								tool: name,
								outcome: reason === "cancelled" ? "cancelled" : "failed",
								reason,
								duration_ms: performance.now() - started,
							});
							// MCP側のエラー全文をモデル・Studio・公開ログへ流さない。
							throw new Error("MCP tool execution failed.");
						}
					},
				};
			}
			clients.push(client);
			logger.info("MCP discovery succeeded", {
				event: "mcp_discovery_finished",
				server: id,
				outcome: "success",
				duration_ms: performance.now() - start,
			});
		} catch (error) {
			// 接続不能で通常会話を止めない。資格情報を含み得る下位例外は公開しない。
			logger.warn("MCP discovery failed", {
				event: "mcp_discovery_finished",
				server: id,
				outcome: "failed",
				reason: discovery.signal.aborted ? "timeout" : failureReason(error),
				duration_ms: performance.now() - start,
			});
			await client.disconnect();
		} finally {
			clearTimeout(timer);
		}
	}
	return {
		tools,
		// MCPClient自身の非同期終了hookも同じdisconnectの完了を待つ。
		disconnect: async () => {
			await Promise.all(clients.map((client) => client.disconnect()));
		},
	};
}

/** ツール失敗後のモデルによる回答続行を止め、呼出元へ異常終端を伝える。 */
export const stopOnToolFailure = {
	id: "stop-on-tool-failure",
	async processOutputStream({ part, abort }) {
		if (
			part.type === "tool-error" ||
			(part.type === "tool-result" && part.payload.isError)
		)
			abort("MCP tool failed.", { retry: false });
		return part;
	},
} satisfies Processor;
