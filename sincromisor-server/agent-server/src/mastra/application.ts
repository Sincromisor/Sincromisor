/** 内部LLM、Editorと会話履歴を組み立てる。管理者認証はStudioとAPIで共通にする。 */
import { Mastra } from "@mastra/core";
import { type ContextWithMastra, SimpleAuth } from "@mastra/core/server";
import { MastraCompositeStore } from "@mastra/core/storage";
import { MastraEditor } from "@mastra/editor";
import { LibSQLStore } from "@mastra/libsql";
import { createCharacterAgent } from "./agents/character.js";
import { readConfig } from "./config.js";
import { conversationId, createServiceLogger } from "./logging.js";
import { connectMcp, readMcpConfig } from "./mcp.js";

const config = readConfig(process.env);
const logger = createServiceLogger(config.SINCRO_LOG_CONVERSATION_ENABLED);
// StudioとAPI、および未対応feedbackの応答で同じ認証判定を使う。
const auth = new SimpleAuth({
	tokens: {
		[config.SINCRO_AGENT_ADMIN_TOKEN]: {
			id: "local-admin",
			name: "ローカル管理者",
		},
	},
});
const mcp = await connectMcp(await readMcpConfig("/data/mcp.json"), logger);
// libSQL未対応のfeedbackを提供可能と扱わないよう、未使用の監視保存領域を無効化する。
// Editorと会話履歴は従来と同じDBを使う。
const storage = new MastraCompositeStore({
	id: "sincromisor-storage",
	default: new LibSQLStore({
		id: "sincromisor-libsql",
		url: config.SINCRO_AGENT_DB_URL,
	}),
	domains: { observability: false },
});
const character = createCharacterAgent({
	model: {
		providerId: "llama-server",
		modelId: config.SINCRO_AGENT_LLM_MODEL,
		url: config.SINCRO_AGENT_LLM_URL,
	},
	storage,
});

/** Mastra CLIの入口から公開し、HTTPサーバーが保存領域と生成要求の生存期間を管理する。 */
export const mastra = new Mastra({
	logger,
	agents: { "sincromisor-character": character },
	tools: mcp.tools,
	storage,
	editor: new MastraEditor(),
	server: {
		host: "0.0.0.0",
		port: 4111,
		// 採用StudioのInboxは501でも定期取得する。未対応の一覧だけを例外化せず返す。
		// 前段middlewareなのでSimpleAuthで認証を確認し、不正な要求は標準ルートへ委ねる。
		middleware: [
			{
				path: "/api/agents/:agentId/stream",
				handler: async (c: ContextWithMastra, next: () => Promise<void>) => {
					if (!(await auth.getCurrentUser(c.req.raw))) return next();
					// 生の要求を再読込みする生成ルートのため、複製からIDだけを読む。
					let sessionId: string | undefined;
					try {
						sessionId = conversationId(await c.req.raw.clone().json());
					} catch {
						/* 不正JSONの応答は本来のルートへ委ねる。 */
					}
					const ids = sessionId
						? { session_id: sessionId, thread_id: `sincromisor:${sessionId}` }
						: {};
					const start = performance.now();
					logger.info("Agent request started", {
						event: "agent_request_started",
						...ids,
					});
					try {
						await next();
						// SSEの応答を渡した時点であり、生成本文の正常完了を意味しない。
						logger.info("Agent request dispatched", {
							event: "agent_request_dispatched",
							...ids,
							status: c.res.status,
							duration_ms: performance.now() - start,
						});
					} catch (error) {
						logger.error("Agent request failed", {
							event: "agent_request_failed",
							...ids,
							duration_ms: performance.now() - start,
						});
						throw error;
					}
				},
			},
			{
				path: "/api/observability/feedback",
				handler: async (c: ContextWithMastra, next: () => Promise<void>) => {
					if (
						c.req.method === "GET" &&
						(await auth.getCurrentUser(c.req.raw))
					) {
						return c.json(
							{ error: "Observability storage domain is not available" },
							501,
						);
					}
					await next();
				},
			},
		],
		cors: { origin: ["http://localhost:4111", "http://127.0.0.1:4111"] },
		auth,
	},
});
