/** 製品のPinoをJSONLへ設定し、自由な本文・例外の文字列化を出力境界で防ぐ。 */

import { ConsoleLogger } from "@mastra/core/logger";
import { PinoLogger } from "@mastra/loggers";
import { failureFields, safeFailureField } from "./failureDiagnostics.js";

const messages = new Set([
	"Runtime operation",
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
	"reason",
	"stage",
	"peer",
	"exception_type",
	"error_code",
	"http_status",
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
					Object.entries(fields)
						.map(([key, value]): [string, unknown] =>
							[
								"exception_type",
								"error_code",
								"http_status",
							].includes(key)
								? [key, safeFailureField(key, value)]
								: [key, value],
						)
						.filter(
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
	if (typeof body !== "object" || body === null || !("memory" in body))
		return;
	const memory = body.memory;
	if (typeof memory !== "object" || memory === null || !("thread" in memory))
		return;
	if (typeof memory.thread !== "string") return;
	return /^sincromisor:([A-Za-z0-9_-]{1,128})$/.exec(memory.thread)?.[1];
}

/** LibSQL内部の非公開DB層が独自生成するConsoleLoggerも、安全な共通出力へ接続する。
 * 採用版はこの層へloggerを注入できないため公開クラスの出力口だけを置換する。
 * 製品が内部logger注入に対応したらその設定へ移す。例外の型・既知コードだけを選び、任意の引数は渡さない。
 */
export function routeLibraryConsoleLogs(logger: PinoLogger): void {
	for (const level of ["debug", "info", "warn", "error"] as const) {
		ConsoleLogger.prototype[level] = (...args: unknown[]) => {
			const error =
				args.find((value) => value instanceof Error) ??
				args
					.filter(
						(value): value is Record<string, unknown> =>
							typeof value === "object" && value !== null,
					)
					.flatMap((value) => [value.error, value.err])
					.find((value) => value instanceof Error);
			logger[level]("Mastra event", {
				event: "library_log",
				...(error ? failureFields(error) : {}),
			});
		};
	}
}
