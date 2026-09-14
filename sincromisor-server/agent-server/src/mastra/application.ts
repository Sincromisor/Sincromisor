/** 内部LLM、Editorと会話履歴を組み立てる。管理者認証はStudioとAPIで共通にする。 */
import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { SimpleAuth } from "@mastra/core/server";
import { MastraEditor } from "@mastra/editor";
import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import { readConfig } from "./config.js";

const config = readConfig(process.env);
const storage = new LibSQLStore({
	id: "sincromisor-storage",
	url: config.SINCRO_AGENT_DB_URL,
});
const character = new Agent({
	id: "sincromisor-character",
	name: "Sincromisorのキャラクター",
	instructions: `日本語で親しみやすく簡潔に会話してください。
重要: 各応答の先頭に、感情コードを必ず1回だけ付けてください。
形式は半角2文字で ^N です（Nは0〜5）。
^0=標準、^1=楽しい、^2=悲しい、^3=怒り、^4=喜び、^5=驚き。
^Nの直後に本文を続け、改行しないでください。本文中で感情コードを繰り返さないでください。
感情が不明な場合は^0を使ってください。`,
	model: {
		providerId: "llama-server",
		modelId: config.SINCRO_AGENT_LLM_MODEL,
		url: config.SINCRO_AGENT_LLM_URL,
	},
	// 生成失敗を会話全体の再実行へ変えない。ツール往復には最大5ステップを使う。
	maxRetries: 0,
	defaultOptions: { maxSteps: 5, modelSettings: { maxRetries: 0 } },
	// Editorの既定動作でコードの初期指示を公開済み設定がある場合だけ上書きする。
	memory: new Memory({
		storage,
		// 履歴は呼出元が指定したthread内の直近20件のみ。セッション横断の記憶は作らない。
		options: {
			lastMessages: 20,
			semanticRecall: false,
			workingMemory: { enabled: false },
			observationalMemory: false,
		},
	}),
});

/** Mastra CLIの入口から公開し、HTTPサーバーが保存領域と生成要求の生存期間を管理する。 */
export const mastra = new Mastra({
	agents: { "sincromisor-character": character },
	storage,
	editor: new MastraEditor(),
	server: {
		host: "0.0.0.0",
		port: 4111,
		cors: { origin: ["http://localhost:4111", "http://127.0.0.1:4111"] },
		auth: new SimpleAuth({
			tokens: {
				[config.SINCRO_AGENT_ADMIN_TOKEN]: {
					id: "local-admin",
					name: "ローカル管理者",
				},
			},
		}),
	},
});
