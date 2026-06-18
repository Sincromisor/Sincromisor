#!/usr/bin/env node
/**
 * （任意ツール）タスク・ドキュメント配下の md にある「壊れた相対リンク」を解決して修正する。
 * 多くは `../` の数を誤った深さエラーで、リンク末尾（tail）は実ファイルに一致する。
 *
 *   node scripts/tasks/fixLinks.mjs            # ドライラン（修正候補を表示）
 *   node scripts/tasks/fixLinks.mjs --apply    # 実適用
 *   bun  scripts/tasks/fixLinks.mjs            # Bun でも同じ
 *
 * スキャン対象は `SCAN_DIRS`（既定 `tasks`）。`TASKS_DOCS_DIRS=tasks,docs` のように
 * 環境変数で増やせる。解決ターゲットはリポジトリ全体の .md（EXCLUDE を除く）。
 *
 * 解決優先度:
 *   1. 完全一致     : repo 相対パス === tail
 *   2. suffix 一意  : `/tail` で終わる repo ファイルが 1 件
 *   3. task stem    : TASK-/task- 形式 → タスク id から task.md を引き当て
 *   4. basename 一意: 同名ファイルが repo 内に 1 件
 * いずれも決まらなければ unresolved として理由付きで報告する。
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { TASKS_ROOT } from "./lib.mjs";

const SCAN_DIRS = (process.env.TASKS_DOCS_DIRS ?? TASKS_ROOT)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
// 走査から除外するディレクトリ。`TASKS_FIXLINKS_EXCLUDE=.cache,.svelte-kit` のように環境変数で追加できる。
const EXCLUDE = [
    "node_modules",
    ".git",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".venv",
    "venv",
    "__pycache__",
    "target",
    "vendor",
    ...(process.env.TASKS_FIXLINKS_EXCLUDE ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
];
const APPLY = process.argv.includes("--apply");

/** リポジトリ全体の .md を再帰収集する（EXCLUDE 配下は除外）。 */
async function collectMd(dir, repoRoot, out, byBasename) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        if (e.isDirectory()) {
            if (EXCLUDE.includes(e.name)) continue;
            await collectMd(join(dir, e.name), repoRoot, out, byBasename);
        } else if (e.isFile() && e.name.endsWith(".md")) {
            const rel = relative(repoRoot, join(dir, e.name)).split("\\").join("/");
            out.push(rel);
            const arr = byBasename.get(e.name) ?? [];
            arr.push(rel);
            byBasename.set(e.name, arr);
        }
    }
}

function resolveTarget(tail, idx, taskById) {
    // 1. 完全一致
    if (idx.all.includes(tail)) return { target: tail, how: "exact" };

    // 2. suffix 一意
    const suffix = idx.all.filter((p) => p.endsWith(`/${tail}`));
    if (suffix.length === 1) return { target: suffix[0], how: "suffix" };

    const base = basename(tail);

    // 3. task stem（`TASK-260...` / `task-...` 形式）→ タスク id から task.md を引き当て
    const stemM = base.match(/^(?:TASK-|task-)(.+?)\.md$/i);
    if (stemM) {
        const id = `task-${stemM[1]}`;
        const t = taskById.get(id);
        if (t) return { target: t, how: "stem→task" };
    }

    // 4. basename 一意
    const byName = idx.byBasename.get(base) ?? [];
    if (byName.length === 1) return { target: byName[0], how: "basename" };
    if (suffix.length > 1) return { target: null, how: `ambiguous(suffix×${suffix.length})` };
    if (byName.length > 1) return { target: null, how: `ambiguous(basename×${byName.length})` };
    return { target: null, how: "not-found" };
}

/** あるディレクトリ配下の .md を再帰列挙（スキャン側）。 */
async function listMdUnder(dir, out) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    } catch {
        return;
    }
    for (const e of entries) {
        if (e.isDirectory()) {
            if (EXCLUDE.includes(e.name)) continue;
            await listMdUnder(join(dir, e.name), out);
        } else if (e.isFile() && e.name.endsWith(".md")) {
            out.push(join(dir, e.name));
        }
    }
}

async function main() {
    const repoRoot = process.cwd();
    const all = [];
    const byBasename = new Map();
    await collectMd(repoRoot, repoRoot, all, byBasename);
    const idx = { all, byBasename };

    // タスク id → task.md（repo 相対）
    const taskById = new Map();
    for (const rel of all) {
        const m = rel.match(/(?:^|\/)(task-[^/]+)\/task\.md$/);
        if (m) taskById.set(m[1], rel);
    }

    const fixes = [];
    const unresolved = [];
    const fileEdits = new Map();

    const scanFiles = [];
    for (const d of SCAN_DIRS) await listMdUnder(d, scanFiles);

    for (const rel of scanFiles) {
        const fileDir = dirname(resolve(rel));
        const content = await readFile(rel, "utf8");
        let touched = false;

        const next = content.replace(/\]\(([^)]+)\)/g, (full, inner) => {
            const trimmed = inner.trim();
            const sp = trimmed.search(/\s/);
            const pathPart = sp === -1 ? trimmed : trimmed.slice(0, sp);
            const titlePart = sp === -1 ? "" : trimmed.slice(sp);
            if (/^([a-z]+:|#|\/)/i.test(pathPart)) return full;
            const h = pathPart.indexOf("#");
            const filePart = h === -1 ? pathPart : pathPart.slice(0, h);
            const anchor = h === -1 ? "" : pathPart.slice(h);
            if (!filePart.endsWith(".md")) return full;
            const targetAbs = resolve(fileDir, decodeURIComponent(filePart));
            if (existsSync(targetAbs)) return full; // 壊れていないリンクは触らない
            const tail = filePart.replace(/^(\.\.?\/)+/, "");
            const res = resolveTarget(tail, idx, taskById);
            if (!res.target) {
                unresolved.push({ file: rel, link: pathPart, how: res.how });
                return full;
            }
            let newRel = relative(fileDir, resolve(res.target)).split("\\").join("/");
            if (!newRel.startsWith(".")) newRel = `./${newRel}`;
            const to = `](${newRel}${anchor}${titlePart})`;
            if (to !== full) {
                fixes.push({ file: rel, from: full, to, how: res.how });
                touched = true;
            }
            return to;
        });

        if (touched) fileEdits.set(rel, next);
    }

    // レポート
    console.log(`\n=== 壊れリンク修正 ${APPLY ? "[APPLY]" : "[DRY-RUN]"} ===`);
    console.log(`スキャン対象: ${SCAN_DIRS.join(", ")}\n`);
    console.log(`■ 修正: ${fixes.length} 件 / ${fileEdits.size} ファイル`);
    const byHow = new Map();
    for (const f of fixes) byHow.set(f.how, (byHow.get(f.how) ?? 0) + 1);
    if (fixes.length) {
        console.log(
            `  解決手段別: ${[...byHow.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`,
        );
    }
    for (const f of fixes) console.log(`  ${f.file}\n    [${f.how}] ${f.from}  →  ${f.to}`);

    if (unresolved.length) {
        console.log(`\n■ 未解決: ${unresolved.length} 件（要手動確認）`);
        for (const u of unresolved) console.log(`  ${u.file}\n    [${u.how}] ${u.link}`);
    }

    if (!APPLY) {
        console.log("\nドライラン完了。問題なければ --apply で適用。");
        return;
    }
    for (const [path, content] of fileEdits) await writeFile(path, content, "utf8");
    console.log(`\n適用完了: ${fileEdits.size} ファイルを修正。`);
}

await main();
