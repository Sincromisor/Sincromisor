/** モデル・保存・MCPの診断を固定語彙へ閉じる。例外本文と処理対象データは複製しない。 */
import type { Processor } from "@mastra/core/processors";
import { MASTRA_THREAD_ID_KEY } from "@mastra/core/request-context";
import type { MemoryStorage } from "@mastra/core/storage";
import type { PinoLogger } from "@mastra/loggers";
import { conversationId } from "./logging.js";

/** 下位例外の既知コードだけを読む。causeの参照も最大4段で止める。 */
export function failureReason(error: unknown): string {
	for (let n = 0; n < 4 && error instanceof Error; n++) {
		if (error.name === "AbortError") return "cancelled";
		if (error.name === "TimeoutError") return "timeout";
		const code = "code" in error ? error.code : undefined;
		if (
			["EACCES", "EPERM", "SQLITE_READONLY", "SQLITE_AUTH"].includes(
				String(code),
			)
		)
			return "permission_denied";
		if (["ECONNREFUSED", "ECONNRESET", "ENOTFOUND"].includes(String(code)))
			return "connection_failed";
		if (["ETIMEDOUT", "UND_ERR_CONNECT_TIMEOUT"].includes(String(code)))
			return "timeout";
		if (code === -32001 || code === "REQUEST_TIMEOUT") return "timeout";
		if (code === "SQLITE_FULL") return "disk_full";
		if (code === "SQLITE_BUSY") return "busy";
		if ("statusCode" in error && typeof error.statusCode === "number")
			return error.statusCode === 503 ? "http_503" : "http_failure";
		error = error.cause;
	}
	return "failed";
}

/** Pythonの会話threadだけを採用し、Studioの任意名称や内容を識別子へ転用しない。 */
function threadFields(thread: unknown): Record<string, string> {
	const session = conversationId({ memory: { thread } });
	return session
		? { session_id: session, thread_id: `sincromisor:${session}` }
		: {};
}

/** 製品の処理フックでモデル要求の生存期間を観測する。本文や再試行動作は変更しない。 */
export function modelDiagnostics(logger: PinoLogger) {
	const finish = (
		state: Record<string, unknown>,
		outcome: string,
		reason: string,
	) => {
		if (state.finished || typeof state.started !== "number") return;
		state.finished = true;
		if (typeof state.cleanup === "function") state.cleanup();
		logger.info("Runtime operation", {
			event: "llm_request",
			peer: "llama_server",
			stage: "generate",
			outcome,
			reason,
			...threadFields(state.thread),
			duration_ms: performance.now() - state.started,
		});
	};
	return {
		id: "runtime-model-diagnostics",
		processInputStep({ state, messages, requestContext }) {
			state.thread =
				requestContext?.get(MASTRA_THREAD_ID_KEY) ??
				messages.find((message) => message.threadId)?.threadId;
		},
		processLLMRequest({ state, abortSignal }) {
			state.started = performance.now();
			state.finished = false;
			logger.info("Runtime operation", {
				event: "llm_request",
				peer: "llama_server",
				stage: "generate",
				outcome: "started",
				...threadFields(state.thread),
			});
			const cancelled = () => finish(state, "cancelled", "cancelled");
			abortSignal?.addEventListener("abort", cancelled, { once: true });
			state.cleanup = () =>
				abortSignal?.removeEventListener("abort", cancelled);
			if (abortSignal?.aborted) cancelled();
		},
		async processOutputStream({ part, state }) {
			if (part.type === "error")
				finish(state, "failed", failureReason(part.payload.error));
			if (part.type === "abort") finish(state, "cancelled", "remote_abort");
			return part;
		},
		processLLMResponse({ state, chunks }) {
			const error = chunks.find((chunk) => chunk.type === "error");
			const aborted = chunks.some((chunk) => chunk.type === "abort");
			finish(
				state,
				error ? "failed" : aborted ? "cancelled" : "success",
				error
					? failureReason(
							typeof error.payload === "object" &&
								error.payload !== null &&
								"error" in error.payload
								? error.payload.error
								: undefined,
						)
					: aborted
						? "remote_abort"
						: "completed",
			);
		},
		processAPIError({ error, state }) {
			finish(state, "failed", failureReason(error));
		},
	} satisfies Processor;
}

/** 所有者を変えず、製品が直接呼ぶ履歴ストアの共有入口に診断を付ける。DB接続は増やさない。 */
export function observeMemoryOperations(
	store: MemoryStorage,
	logger: PinoLogger,
): void {
	/** 元の操作を一度だけ呼び、失敗・保存内容・再試行設定を維持する。 */
	const observe = async <T>(
		stage: string,
		thread: unknown,
		operation: () => Promise<T>,
	): Promise<T> => {
		const started = performance.now();
		const ids = threadFields(thread);
		logger.info("Runtime operation", {
			event: "memory_operation",
			peer: "libsql",
			stage,
			outcome: "started",
			...ids,
		});
		try {
			const result = await operation();
			logger.info("Runtime operation", {
				event: "memory_operation",
				peer: "libsql",
				stage,
				outcome: "success",
				...ids,
				duration_ms: performance.now() - started,
			});
			return result;
		} catch (error) {
			logger.warn("Runtime operation", {
				event: "memory_operation",
				peer: "libsql",
				stage,
				outcome: "failed",
				reason: failureReason(error),
				...ids,
				duration_ms: performance.now() - started,
			});
			throw error;
		}
	};
	// thisを実ストアへ固定し、MastraがMemoryを経由しない一括保存も同じ境界で扱う。
	const read = store.listMessages.bind(store);
	store.listMessages = (args) =>
		observe("read_messages", args.threadId, () => read(args));
	const thread = store.getThreadById.bind(store);
	store.getThreadById = (args) =>
		observe("read_thread", args.threadId, () => thread(args));
	const saveThread = store.saveThread.bind(store);
	store.saveThread = (args) =>
		observe("write_thread", args.thread.id, () => saveThread(args));
	const saveMessages = store.saveMessages.bind(store);
	store.saveMessages = (args) =>
		observe("write_messages", args.messages[0]?.threadId, () =>
			saveMessages(args),
		);
}
