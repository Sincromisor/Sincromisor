#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { TASKS_ROOT } from "./lib.mjs";

const SCAN_DIRS = (process.env.TASKS_DOCS_DIRS ?? TASKS_ROOT)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const EXCLUDE = new Set(["node_modules", ".git", "dist", "build", "coverage", ".playwright-cli", ".ruff_cache", ".venv"]);
const APPLY = process.argv.includes("--apply");

async function collectMarkdown(dir, repoRoot, out, byBasename) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (EXCLUDE.has(entry.name)) continue;
            await collectMarkdown(join(dir, entry.name), repoRoot, out, byBasename);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const rel = relative(repoRoot, join(dir, entry.name)).split("\\").join("/");
        out.push(rel);
        const matching = byBasename.get(entry.name) ?? [];
        matching.push(rel);
        byBasename.set(entry.name, matching);
    }
}

async function listMarkdownUnder(dir, out) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (EXCLUDE.has(entry.name)) continue;
            await listMarkdownUnder(join(dir, entry.name), out);
            continue;
        }
        if (entry.isFile() && entry.name.endsWith(".md")) out.push(join(dir, entry.name));
    }
}

function resolveTarget(tail, index, taskById) {
    if (index.all.includes(tail)) return { target: tail, how: "exact" };

    const suffix = index.all.filter((path) => path.endsWith(`/${tail}`));
    if (suffix.length === 1) return { target: suffix[0], how: "suffix" };

    const fileName = basename(tail);
    const taskMatch = fileName.match(/^(?:TASK-|task-)(.+?)\.md$/i);
    if (taskMatch) {
        const found = taskById.get(`task-${taskMatch[1]}`);
        if (found) return { target: found, how: "task-id" };
    }

    const byName = index.byBasename.get(fileName) ?? [];
    if (byName.length === 1) return { target: byName[0], how: "basename" };
    if (suffix.length > 1) return { target: null, how: `ambiguous suffix (${suffix.length})` };
    if (byName.length > 1) return { target: null, how: `ambiguous basename (${byName.length})` };
    return { target: null, how: "not found" };
}

const repoRoot = process.cwd();
const all = [];
const byBasename = new Map();
await collectMarkdown(repoRoot, repoRoot, all, byBasename);

const taskById = new Map();
for (const rel of all) {
    const match = rel.match(/(?:^|\/)(task-[^/]+)\/task\.md$/);
    if (match) taskById.set(match[1], rel);
}

const scanFiles = [];
for (const dir of SCAN_DIRS) await listMarkdownUnder(dir, scanFiles);

const fixes = [];
const unresolved = [];
const edits = new Map();

for (const file of scanFiles) {
    const fileDir = dirname(resolve(file));
    const content = await readFile(file, "utf8");
    let touched = false;
    const next = content.replace(/\]\(([^)]+)\)/g, (full, inner) => {
        const trimmed = inner.trim();
        const space = trimmed.search(/\s/);
        const pathPart = space === -1 ? trimmed : trimmed.slice(0, space);
        const titlePart = space === -1 ? "" : trimmed.slice(space);
        if (/^([a-z]+:|#|\/)/i.test(pathPart)) return full;

        const hash = pathPart.indexOf("#");
        const filePart = hash === -1 ? pathPart : pathPart.slice(0, hash);
        const anchor = hash === -1 ? "" : pathPart.slice(hash);
        if (!filePart.endsWith(".md")) return full;
        if (existsSync(resolve(fileDir, decodeURIComponent(filePart)))) return full;

        const tail = filePart.replace(/^(\.\.?\/)+/, "");
        const result = resolveTarget(tail, { all, byBasename }, taskById);
        if (!result.target) {
            unresolved.push({ file, link: pathPart, how: result.how });
            return full;
        }

        let newRel = relative(fileDir, resolve(result.target)).split("\\").join("/");
        if (!newRel.startsWith(".")) newRel = `./${newRel}`;
        const replacement = `](${newRel}${anchor}${titlePart})`;
        if (replacement !== full) {
            fixes.push({ file, from: full, to: replacement, how: result.how });
            touched = true;
        }
        return replacement;
    });
    if (touched) edits.set(file, next);
}

console.log(`mode: ${APPLY ? "apply" : "dry-run"}`);
console.log(`scan: ${SCAN_DIRS.join(", ")}`);
console.log(`fixes: ${fixes.length} in ${edits.size} file(s)`);
for (const fix of fixes) {
    console.log(`${fix.file}: ${fix.how}: ${fix.from} -> ${fix.to}`);
}

console.log(`unresolved: ${unresolved.length}`);
for (const item of unresolved) {
    console.log(`${item.file}: ${item.how}: ${item.link}`);
}

if (!APPLY) {
    console.log("dry-run complete. Re-run with --apply to write fixes.");
    process.exit(unresolved.length ? 1 : 0);
}

for (const [file, content] of edits) {
    await writeFile(file, content, "utf8");
}
console.log(`applied: ${edits.size} file(s)`);
