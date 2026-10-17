/** 例外の値を文字列化せず、実行境界とPinoの出力境界で同じ有限語彙を使う。 */
const exceptionTypes = new Set([
	"Error",
	"TypeError",
	"RangeError",
	"SyntaxError",
	"AbortError",
	"TimeoutError",
	"AI_APICallError",
	"AI_RetryError",
	"AI_NoOutputGeneratedError",
	"LibsqlError",
	"LibsqlBatchError",
	"MastraError",
	"McpError",
]);
const codeReasons = new Map<string | number, string>([
	["EACCES", "permission_denied"],
	["EPERM", "permission_denied"],
	["SQLITE_READONLY", "permission_denied"],
	["SQLITE_AUTH", "permission_denied"],
	["ECONNREFUSED", "connection_failed"],
	["ECONNRESET", "connection_failed"],
	["ENOTFOUND", "connection_failed"],
	["ETIMEDOUT", "timeout"],
	["UND_ERR_CONNECT_TIMEOUT", "timeout"],
	[-32001, "timeout"],
	["REQUEST_TIMEOUT", "timeout"],
	["SQLITE_FULL", "disk_full"],
	["SQLITE_BUSY", "busy"],
]);

/** 第三者や子ロガーが同名の属性を渡しても、未知の型・コードは原文を出さない。 */
export function safeFailureField(
	key: string,
	value: unknown,
): string | number | undefined {
	if (key === "exception_type")
		return typeof value === "string" && exceptionTypes.has(value)
			? value
			: "unknown";
	if (key === "error_code")
		return (typeof value === "string" || typeof value === "number") &&
			codeReasons.has(value)
			? value
			: "unknown";
	if (key === "http_status")
		return typeof value === "number" &&
			Number.isInteger(value) &&
			value >= 100 &&
			value <= 599
			? value
			: undefined;
}

/** 最大4段のcauseから最初の既知原因を採用する。任意name/codeの文字列化はしない。 */
export function failureFields(error: unknown): Record<string, string | number> {
	const fields: Record<string, string | number> = {
		reason: "failed",
		exception_type: "unknown",
	};
	for (let n = 0; n < 4 && error instanceof Error; n++) {
		fields.exception_type =
			safeFailureField("exception_type", error.name) ?? "unknown";
		const code = "code" in error ? error.code : undefined;
		if (code !== undefined)
			fields.error_code =
				safeFailureField("error_code", code) ?? "unknown";
		const status = safeFailureField(
			"http_status",
			"statusCode" in error ? error.statusCode : undefined,
		);
		if (status !== undefined) fields.http_status = status;
		let reason: string | undefined;
		if (error.name === "AbortError") reason = "cancelled";
		else if (error.name === "TimeoutError") reason = "timeout";
		else if (typeof code === "string" || typeof code === "number")
			reason = codeReasons.get(code);
		if (!reason && status !== undefined)
			reason = status === 503 ? "http_503" : "http_failure";
		if (reason) return { ...fields, reason };
		error = error.cause;
	}
	return fields;
}
