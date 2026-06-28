#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const SOURCE_ROOT = "sincromisor-frontend/src";
const LINE_LIMIT = 300;
const EXCEPTION_PATTERN = /\/\/ reason: structure-threshold-exception\s+\S/;

function toRepoPath(path) {
    return path.split(sep).join("/");
}

function isFrontendSourceFile(path) {
    if (!path.startsWith(`${SOURCE_ROOT}/`)) return false;
    if (path.includes("/__tests__/")) return false;
    if (path.endsWith(".d.ts")) return false;
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) return false;
    return path.endsWith(".ts") || path.endsWith(".tsx");
}

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

async function readChangedSourceFiles() {
    try {
        const { stdout } = await execFileAsync("git", [
            "diff",
            "main",
            "--name-only",
            "--",
            SOURCE_ROOT,
        ]);
        return stdout
            .split("\n")
            .map((path) => path.trim())
            .filter((path) => path.length > 0)
            .filter((path) => existsSync(path))
            .filter(isFrontendSourceFile)
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        console.warn(
            `frontend-structure: strict target diff unavailable; running inventory only (${error.message})`,
        );
        return [];
    }
}

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

const sourceFiles = await listSourceFiles(SOURCE_ROOT);
const strictFiles = new Set(await readChangedSourceFiles());
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
