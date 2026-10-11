/**
 * Mastraが生成する配布用の依存定義ファイルへ、開発時と同じ脆弱性対策の依存指定を引き継ぐ。
 * npm run buildの後処理として実行し、再導入に失敗した場合はビルド全体を失敗させる。
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const project = JSON.parse(
	await readFile(new URL("./package.json", import.meta.url), "utf8"),
);
const outputDirectory = new URL("./.mastra/output/", import.meta.url);
const outputManifest = new URL("package.json", outputDirectory);
const output = JSON.parse(await readFile(outputManifest, "utf8"));

// Mastraの再導入で固定された旧版へ戻るため、配布側のロックと実体も更新する。
output.overrides = project.overrides;
await writeFile(outputManifest, `${JSON.stringify(output, null, 2)}\n`);
execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
	cwd: fileURLToPath(outputDirectory),
	stdio: "inherit",
});
