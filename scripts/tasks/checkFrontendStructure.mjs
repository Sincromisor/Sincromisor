#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SOURCE_ROOT = "sincromisor-frontend/src";
const LINE_LIMIT = 300;
// 理由は同じ行に必要。改行後のコードを理由として受理しない。
const EXCEPTION_PATTERN = /\/\/ reason: structure-threshold-exception[ \t]+\S/;

function toRepoPath(path) {
    return path.split(sep).join("/");
}

// テストと型宣言は実装の分割基準から除外する。
function isFrontendSourceFile(path) {
    if (!path.startsWith(`${SOURCE_ROOT}/`)) return false;
    if (path.includes("/__tests__/")) return false;
    if (path.endsWith(".d.ts")) return false;
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return false;
    return path.endsWith(".ts") || path.endsWith(".tsx");
}

// 既存超過の一覧は作業ツリー全体から作り、厳格な対象選択とは分ける。
async function listSourceFiles(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await listSourceFiles(path)));
            continue;
        }
        if (!entry.isFile()) continue;
        const repoPath = toRepoPath(relative(process.cwd(), path));
        if (isFrontendSourceFile(repoPath)) files.push(repoPath);
    }
    return files.sort((a, b) => a.localeCompare(b));
}

// 比較元は単一コミットに限定し、引数の誤りを検査成功として扱わない。
function readBaseRevision() {
    const args = process.argv.slice(2);
    if (args.length === 0) return "HEAD";
    if (args.length === 2 && args[0] === "--base" && args[1].length > 0) return args[1];
    throw new Error("usage: checkFrontendStructure.mjs [--base <commit>]");
}

// 比較元からステージまでの差分、未ステージ差分、未追跡を合成する。
// 一方の差分がもう一方を打ち消しても対象から落とさず、内容は作業ツリーを読む。
async function readChangedSourceFiles(base) {
    const { stdout: revision } = await execFileAsync("git", [
        "rev-parse",
        "--verify",
        "--end-of-options",
        `${base}^{commit}`,
    ]);
    const diffArgs = ["--name-only", "-z", "--no-renames"];
    const results = await Promise.all([
        execFileAsync("git", ["diff", "--cached", ...diffArgs, revision.trim(), "--", SOURCE_ROOT]),
        execFileAsync("git", ["diff", ...diffArgs, "--", SOURCE_ROOT]),
        execFileAsync("git", [
            "ls-files",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            SOURCE_ROOT,
        ]),
    ]);
    // NUL区切りなら日本語・空白・改行を含むパスもGitの引用形式に依存しない。
    return [...new Set(results.flatMap(({ stdout }) => stdout.split("\0")))]
        .filter(isFrontendSourceFile)
        .filter((path) => existsSync(path))
        .sort((a, b) => a.localeCompare(b));
}

// コメント・import・空行も数える。末尾の改行だけでは行を増やさない。
function countPhysicalLines(content) {
    if (content.length === 0) return 0;
    let lineCount = content.endsWith("\n") ? 0 : 1;
    for (const char of content) {
        if (char === "\n") lineCount++;
    }
    return lineCount;
}

async function inspectFile(path) {
    const content = await readFile(path, "utf8");
    return {
        lineCount: countPhysicalLines(content),
        path,
        hasException: EXCEPTION_PATTERN.test(content),
    };
}

function sortByLineCountThenPath(a, b) {
    return a.lineCount - b.lineCount || a.path.localeCompare(b.path);
}

let strictFiles;
try {
    strictFiles = new Set(await readChangedSourceFiles(readBaseRevision()));
} catch (error) {
    console.error(`frontend-structure: target selection failed: ${error.message}`);
    process.exit(1);
}

// 全体の超過は一覧表示に留め、変更対象の理由なし超過だけを失敗にする。
const sourceFiles = await listSourceFiles(SOURCE_ROOT);
const reports = (await Promise.all(sourceFiles.map(inspectFile))).sort(sortByLineCountThenPath);
const oversized = reports.filter((report) => report.lineCount > LINE_LIMIT);

for (const report of oversized) {
    console.log(`${report.lineCount} ${report.path}`);
}

const strictOversized = oversized.filter((report) => strictFiles.has(report.path));
const strictFailures = strictOversized.filter((report) => !report.hasException);
const strictWarnings = strictOversized.filter((report) => report.hasException);

for (const report of strictWarnings.sort(sortByLineCountThenPath)) {
    console.warn(
        `frontend-structure: warning: ${report.path} has ${report.lineCount} line(s), accepted by structure-threshold-exception`,
    );
}

if (strictFailures.length > 0) {
    console.error(
        `frontend-structure: ${strictFailures.length} strict target file(s) exceed ${LINE_LIMIT} line(s)`,
    );
    for (const report of strictFailures.sort(sortByLineCountThenPath)) {
        console.error(`- ${report.lineCount} ${report.path}`);
    }
    process.exit(1);
}

console.log(
    `frontend-structure: inventory=${oversized.length}, strict=${strictFiles.size}, warnings=${strictWarnings.length}, failures=0`,
);
