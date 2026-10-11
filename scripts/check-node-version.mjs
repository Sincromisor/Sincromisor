// 導入とセットアップで同じ宣言を検査し、異なる実行環境でロックを更新しない。
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const { engines } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const npmVersion = execFileSync("npm", ["--version"], { encoding: "utf8" }).trim();
if (process.versions.node !== engines.node || npmVersion !== engines.npm) {
    console.error(`Node.js ${engines.node} / npm ${engines.npm} が必要です。公式配布または既存のバージョン管理ツールで切り替えて再実行してください。`);
    process.exitCode = 1;
}
