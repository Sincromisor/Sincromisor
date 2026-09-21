/** 実Pino出力で1行JSON、本文切替、秘密の除去とthread対応を確認する。 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { conversationId } from "../logging.js";

test("共通項目と診断属性を保持し、無効時の本文と常時の秘密を出さない", () => {
	for (const enabled of [true, false]) {
		const result = spawnSync(
			process.execPath,
			[
				"--import",
				"tsx",
				"--input-type=module",
				"-e",
				`
import {createServiceLogger} from './src/mastra/logging.ts';
const logger=createServiceLogger(${enabled});
logger.info('MCP tool succeeded', {event:'mcp_tool_finished', session_id:'session-a', duration_ms:12, text:'人工的な本文\\n次行', headers:{Authorization:'Bearer private-token'}, error:new Error('private-token')});
logger.child({authorization:'private-token', request:{body:'人工的な本文'}}).error('private-token 人工的な本文');
`,
			],
			{ encoding: "utf8" },
		);
		assert.equal(result.status, 0, result.stderr);
		assert.equal(result.stderr, "");
		assert(!result.stdout.includes("private-token"));
		assert.equal(result.stdout.includes("人工的な本文"), enabled);
		const rows = result.stdout
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line));
		assert.equal(rows.length, 2);
		assert.equal(rows[0].level, "info");
		assert.equal(rows[0].session_id, "session-a");
		assert.equal(rows[0].duration_ms, 12);
		assert(rows[0].timestamp);
	}
});

test("Pythonのthreadだけからsession_idを得る", () => {
	assert.equal(
		conversationId({ memory: { thread: "sincromisor:session-a" } }),
		"session-a",
	);
	for (const body of [
		null,
		{},
		{ memory: { thread: "studio-private-input" } },
		{ memory: { thread: "sincromisor:日本語本文" } },
	])
		assert.equal(conversationId(body), undefined);
});
