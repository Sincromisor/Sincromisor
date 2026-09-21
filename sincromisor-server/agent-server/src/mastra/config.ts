/** Composeから渡された設定を起動時に検証し、不足した認証での起動を拒否する。 */
import { z } from "zod";

const schema = z.object({
	SINCRO_LOG_CONVERSATION_ENABLED: z
		.enum(["true", "false"])
		.default("true")
		.transform((value) => value === "true"),
	SINCRO_AGENT_ADMIN_TOKEN: z.string().min(32),
	SINCRO_AGENT_LLM_URL: z
		.url()
		.refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
	SINCRO_AGENT_LLM_MODEL: z.string().min(1),
	SINCRO_AGENT_DB_URL: z
		.string()
		.startsWith("file:")
		.default("file:/data/mastra.db"),
});

/** 設定値そのものをエラーに含めず、欠損したキーだけを管理者へ示す。 */
export function readConfig(env: NodeJS.ProcessEnv) {
	const result = schema.safeParse(env);
	if (!result.success) {
		throw new Error(
			`Invalid agent configuration: ${result.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
		);
	}
	return result.data;
}
