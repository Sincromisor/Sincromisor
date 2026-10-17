/** causeの深さと既知語彙だけで分類し、任意の例外値を出さない。 */
import assert from "node:assert/strict";
import test from "node:test";
import { failureFields } from "../failureDiagnostics.js";

test("HTTP状態・DBコード・接続原因と認識した型を保持する", () => {
	for (const [code, reason] of [
		["SQLITE_FULL", "disk_full"],
		["SQLITE_READONLY", "permission_denied"],
		["ECONNREFUSED", "connection_failed"],
		[-32001, "timeout"],
	]) {
		const cause = Object.assign(new Error("private-body"), {
			code,
			name: "LibsqlError",
		});
		const fields = failureFields(new Error("private-url", { cause }));
		assert.equal(fields.reason, reason);
		assert.equal(fields.error_code, code);
		assert.equal(fields.exception_type, "LibsqlError");
	}
	for (const statusCode of [503, 429, 500]) {
		const fields = failureFields(
			Object.assign(new Error("private-response"), {
				statusCode,
				name: "AI_APICallError",
			}),
		);
		assert.equal(fields.http_status, statusCode);
		assert.equal(
			fields.reason,
			statusCode === 503 ? "http_503" : "http_failure",
		);
	}
});

test("未知値・無効HTTP状態と4段を超えるcauseは公開しない", () => {
	const unknown = Object.assign(new Error("private-message"), {
		name: "private-name",
		code: "private-code",
		statusCode: 503.5,
	});
	assert.deepEqual(failureFields(unknown), {
		reason: "failed",
		exception_type: "unknown",
		error_code: "unknown",
	});
	const cause = Object.assign(new Error("private-cause"), {
		code: "ECONNREFUSED",
	});
	let nested: Error = cause;
	for (let n = 0; n < 3; n++)
		nested = new Error("wrapper", { cause: nested });
	assert.equal(failureFields(nested).reason, "connection_failed");
	assert.equal(
		failureFields(new Error("wrapper", { cause: nested })).reason,
		"failed",
	);
	unknown.cause = unknown;
	assert.equal(failureFields(unknown).reason, "failed");
	assert.equal(
		failureFields(
			Object.assign(new Error(), {
				code: {
					toString() {
						throw new Error("must not stringify");
					},
				},
			}),
		).error_code,
		"unknown",
	);
});
