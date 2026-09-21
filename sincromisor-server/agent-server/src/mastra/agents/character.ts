/** キャラクターの定義をまとめる。接続先と保存領域の生成・終了はapplicationが担当する。 */
import { Agent, type AgentConfig } from "@mastra/core/agent";
import type { MastraCompositeStore } from "@mastra/core/storage";
import type { PinoLogger } from "@mastra/loggers";
import { Memory } from "@mastra/memory";
import { createServiceLogger } from "../logging.js";
import { stopOnToolFailure } from "../mcp.js";
import { characterInstructions } from "../prompts/character.js";
import { modelDiagnostics } from "../runtimeDiagnostics.js";

/** 呼出元が所有するモデル接続設定と保存領域を使い、会話用エージェントを生成する。 */
export function createCharacterAgent({
	model,
	storage,
	logger = createServiceLogger(false),
}: {
	model: AgentConfig["model"];
	storage: MastraCompositeStore;
	logger?: PinoLogger;
}): Agent {
	const diagnostics = modelDiagnostics(logger);
	return new Agent({
		id: "sincromisor-character",
		name: "Sincromisorのキャラクター",
		instructions: characterInstructions,
		model,
		// 生成失敗を会話全体の再実行へ変えない。ツール往復には最大5ステップを使う。
		maxRetries: 0,
		defaultOptions: { maxSteps: 5, modelSettings: { maxRetries: 0 } },
		inputProcessors: [diagnostics],
		outputProcessors: [diagnostics, stopOnToolFailure],
		errorProcessors: [diagnostics],
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
}
