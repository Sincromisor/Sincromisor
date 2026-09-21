/** 製品のPinoをJSONLへ設定し、自由な本文・例外の文字列化を出力境界で防ぐ。 */
import { PinoLogger } from "@mastra/loggers";

const messages = new Set([
	"Mastra API running",
	"Studio available",
	"Shutting down Mastra server",
	"MCP inactive",
	"MCP discovery started",
	"MCP discovery succeeded",
	"MCP discovery failed",
	"MCP transport failure",
	"MCP tool started",
	"MCP tool succeeded",
	"MCP tool failed",
	"Agent request started",
	"Agent request dispatched",
	"Agent request failed",
]);
const diagnosticKeys = new Set([
	"timestamp",
	"event",
	"session_id",
	"thread_id",
	"server",
	"tool",
	"outcome",
	"duration_ms",
	"status",
	"component",
]);

/** 本文の主記録元はTextProcessor。第三者の任意属性は診断に必要な項目へ限定する。 */
export function createServiceLogger(
	conversationEnabled: boolean,
	context: Record<string, unknown> = {},
): PinoLogger {
	// Pinoのchildは親のbindings formatterを引き継がないため、同じ属性選別を再適用する。
	class ServiceLogger extends PinoLogger {
		override child(bindings: Record<string, unknown>): PinoLogger {
			return createServiceLogger(conversationEnabled, {
				...context,
				...bindings,
			});
		}
	}
	return new ServiceLogger({
		name: "sincromisor-agent",
		level: "info",
		prettyPrint: false,
		messageKey: "message",
		mixin: () => ({
			...context,
			timestamp: new Date().toISOString(),
			event: "log",
		}),
		formatters: {
			bindings: (fields) => ({
				name: "sincromisor-agent",
				...(typeof fields.component === "string"
					? { component: fields.component }
					: {}),
			}),
			level: (level) => ({ level }),
			log: (fields) =>
				Object.fromEntries(
					Object.entries(fields).filter(
						([key, value]) =>
							(diagnosticKeys.has(key) ||
								(conversationEnabled && key === "text")) &&
							(typeof value === "string" ||
								typeof value === "number" ||
								typeof value === "boolean"),
					),
				),
		},
		// 例外や動的メッセージにURL・認証・要求本文が入り得るため、固定文だけを許可する。
		serializers: {
			message: (value: unknown) =>
				typeof value === "string" && messages.has(value)
					? value
					: "Mastra event",
		},
	});
}

/** Pythonが作るthreadだけを会話IDへ戻す。Studioの任意のthread名を本文として記録しない。 */
export function conversationId(body: unknown): string | undefined {
	if (typeof body !== "object" || body === null || !("memory" in body)) return;
	const memory = body.memory;
	if (typeof memory !== "object" || memory === null || !("thread" in memory))
		return;
	if (typeof memory.thread !== "string") return;
	return /^sincromisor:([A-Za-z0-9_-]{1,128})$/.exec(memory.thread)?.[1];
}
