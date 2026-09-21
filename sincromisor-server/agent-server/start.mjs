/** Mastraの起動失敗を、設定値や例外本文を含まないJSONLで残す。 */
try {
	await import("./.mastra/output/index.mjs");
} catch (error) {
	process.stderr.write(
		`${JSON.stringify({
			timestamp: new Date().toISOString(),
			level: "error",
			event: "agent_startup_failed",
			// 設定検証が生成するキー名だけの診断は維持し、他の例外本文は出さない。
			message:
				error instanceof Error &&
				/^Invalid agent configuration: SINCRO_[A-Z_]+(?:, SINCRO_[A-Z_]+)*$/.test(
					error.message,
				)
					? error.message
					: "Agent startup failed",
			error_type: error instanceof Error ? error.name : "unknown",
		})}\n`,
	);
	process.exitCode = 1;
}
