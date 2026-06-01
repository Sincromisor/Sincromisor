#!/usr/bin/env node

import { existsSync } from "node:fs";
import { join } from "node:path";
import { stringifyMeta, TASKS_ROOT, today, writeFileEnsured } from "./lib.mjs";

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

function timestamp() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${String(date.getFullYear()).slice(2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
        date.getHours(),
    )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}

function parseArgs(args) {
    const flags = new Map();
    const positional = [];
    for (const arg of args) {
        const match = arg.match(/^--([^=]+)=(.*)$/);
        if (match) flags.set(match[1], match[2]);
        else positional.push(arg);
    }
    return { flags, positional };
}

const { flags, positional } = parseArgs(process.argv.slice(2));
const [category, title] = positional;

if (!category || !title) {
    fail('Usage: node scripts/tasks/newTask.mjs <category> "<title>" [--slug=slug] [--depends=a,b]');
}

const slug = flags.has("slug") ? slugify(flags.get("slug")) : slugify(title);
if (!slug) fail("Could not derive an ASCII slug. Pass --slug=<ascii-slug>.");

const id = `task-${timestamp()}-${slug}`;
const dir = join(TASKS_ROOT, category, id);
if (existsSync(dir)) fail(`Task already exists: ${dir}`);

const dependsOn = (flags.get("depends") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

const meta = {
    id,
    title,
    category,
    status: "open",
    depends_on: dependsOn,
    superseded_by: null,
    review: null,
    verdict: null,
    attempts: 0,
    legacy_ids: [],
    created_at: today(),
    closed_at: null,
};

const taskMd = `# ${title}

## 目的

-

## 変更範囲

-

## 設計同期

- [ ] 実装、設定、compose、設計文書の更新要否を確認する。

## 受け入れ条件

- [ ] 

## 確認

- [ ] 

## 実行できなかった検証

-

## subagent 成果物

- review: \`review.md\`
- implementation log: \`impl.md\`
- evaluation: \`eval.md\`
- acceptance artifacts: \`acceptance/\`
`;

const reviewMd = `# Review

## Verdict

- 

## Notes

-
`;

const implMd = `# Implementation Log

## Attempts

-

## Verification

-

## Not Run

-
`;

const evalMd = `# Evaluation

## Verdict

-

## Verification

-

## Residual Risk

-
`;

await writeFileEnsured(join(dir, "meta.yaml"), stringifyMeta(meta));
await writeFileEnsured(join(dir, "task.md"), taskMd);
await writeFileEnsured(join(dir, "review.md"), reviewMd);
await writeFileEnsured(join(dir, "impl.md"), implMd);
await writeFileEnsured(join(dir, "eval.md"), evalMd);
await writeFileEnsured(join(dir, "acceptance", ".gitkeep"), "");
await writeFileEnsured(join(dir, "artifacts", ".gitkeep"), "");

console.log(`created: ${dir}`);
console.log("next: edit task.md, then run npm run tasks:index");
