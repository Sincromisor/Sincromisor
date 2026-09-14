/** 未認証起動と、誤ったURL指定を設定境界で拒否する。 */
import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../config.js";

test("管理者トークンと内部LLMの設定を検証し、秘密をエラーへ含めない", () => {
	const env = {
		SINCRO_AGENT_ADMIN_TOKEN: "test-only-token-with-at-least-32-characters",
		SINCRO_AGENT_LLM_URL: "http://llama-server:8080/v1",
		SINCRO_AGENT_LLM_MODEL: "gemma-4-E2B-it",
	};
	assert.equal(readConfig(env).SINCRO_AGENT_DB_URL, "file:/data/mastra.db");
	assert.throws(() => readConfig({}), /SINCRO_AGENT_ADMIN_TOKEN/);
	assert.throws(
		() => readConfig({ ...env, SINCRO_AGENT_LLM_URL: "file:/secret" }),
		/SINCRO_AGENT_LLM_URL/,
	);
	assert.throws(
		() => readConfig({ ...env, SINCRO_AGENT_ADMIN_TOKEN: "private-short" }),
		(error: unknown) => {
			assert(error instanceof Error);
			assert(!error.message.includes("private-short"));
			return true;
		},
	);
});
