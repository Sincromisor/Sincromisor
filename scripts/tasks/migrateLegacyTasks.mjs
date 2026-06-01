#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { stringifyMeta, TASKS_ROOT } from "./lib.mjs";

const LEGACY_ROOT = process.env.LEGACY_TASKS_ROOT ?? "documents/tasks";
const APPLY = process.argv.includes("--apply");

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function categoryName(value) {
  return slugify(value.replace(/_/g, "-"));
}

function parseTaskFile(filePath, status) {
  const match = basename(filePath).match(/^TASK-([^-]+)-(.+)\.md$/);
  if (!match) return null;
  const [, legacyNumber, slugPart] = match;
  const slug = slugify(slugPart);
  return {
    legacyId: `TASK-${legacyNumber}`,
    legacyNumber,
    slug,
    taskDirName: `task-${legacyNumber}-${slug}`,
    title: slugPart.replace(/-/g, " "),
    status,
    filePath,
  };
}

async function listEntries(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function collectLegacy() {
  const tasks = [];
  const categoryReadmes = [];
  const artifacts = [];

  for (const categoryEntry of await listEntries(LEGACY_ROOT)) {
    if (!categoryEntry.isDirectory()) continue;
    const legacyCategory = categoryEntry.name;
    const legacyCategoryDir = join(LEGACY_ROOT, legacyCategory);
    const category = categoryName(legacyCategory);
    const readme = join(legacyCategoryDir, "README.md");
    if (existsSync(readme)) categoryReadmes.push({ category, source: readme });

    for (const statusDirName of ["open", "done"]) {
      const statusDir = join(legacyCategoryDir, statusDirName);
      const status = statusDirName === "done" ? "done" : "open";
      for (const entry of await listEntries(statusDir)) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        const parsed = parseTaskFile(join(statusDir, entry.name), status);
        if (parsed) tasks.push({ ...parsed, category, legacyCategory });
      }
    }

    for (const entry of await listEntries(legacyCategoryDir)) {
      if (!entry.isFile() || entry.name === "README.md") continue;
      artifacts.push({
        category,
        legacyCategory,
        source: join(legacyCategoryDir, entry.name),
        prefix: entry.name.match(/^(TASK-[^-]+)/)?.[1] ?? null,
      });
    }
  }

  return { tasks, categoryReadmes, artifacts };
}

function taskTarget(task) {
  const dir = join(TASKS_ROOT, task.category, task.taskDirName);
  return {
    dir,
    taskMd: join(dir, "task.md"),
    meta: join(dir, "meta.yaml"),
  };
}

function metaFor(task) {
  return {
    id: task.taskDirName,
    title: task.title,
    category: task.category,
    status: task.status,
    depends_on: [],
    superseded_by: null,
    review: null,
    verdict: task.status === "done" ? "PASS" : null,
    attempts: 0,
    legacy_ids: [task.legacyId],
    created_at: null,
    closed_at: null,
  };
}

function uniqueArtifactTarget(artifact, tasks) {
  if (!artifact.prefix) return null;
  const candidates = tasks.filter(
    (task) =>
      task.category === artifact.category && task.legacyId === artifact.prefix,
  );
  if (candidates.length !== 1) return null;
  return join(
    taskTarget(candidates[0]).dir,
    "artifacts",
    basename(artifact.source),
  );
}

async function writeIndexPreface(readme, taskCount) {
  const source = await readFile(readme.source, "utf8");
  const title = source.match(/^#\s+(.+)$/m)?.[1] ?? readme.category;
  const body = source.replace(/^#\s+.+\n?/, "").trim();
  const indexPath = join(TASKS_ROOT, readme.category, "index.md");
  const content = [
    `# ${title}`,
    "",
    body,
    "",
    `> Migrated from \`${readme.source}\`.`,
    `> Legacy task count in this category: ${taskCount}.`,
    "",
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");
  await mkdir(dirname(indexPath), { recursive: true });
  await writeFile(indexPath, content, "utf8");
}

function printPlan(collected, artifactTargets) {
  const byStatus = new Map();
  for (const task of collected.tasks)
    byStatus.set(task.status, (byStatus.get(task.status) ?? 0) + 1);

  const duplicateLegacy = new Map();
  for (const task of collected.tasks) {
    const key = `${task.category}:${task.legacyId}`;
    const values = duplicateLegacy.get(key) ?? [];
    values.push(task.taskDirName);
    duplicateLegacy.set(key, values);
  }

  const unresolvedArtifacts = collected.artifacts.filter(
    (artifact) => !artifactTargets.get(artifact.source),
  );
  console.log(`mode: ${APPLY ? "apply" : "dry-run"}`);
  console.log(`legacy root: ${LEGACY_ROOT}`);
  console.log(`target root: ${TASKS_ROOT}`);
  console.log(`task files: ${collected.tasks.length}`);
  console.log(
    `status: open=${byStatus.get("open") ?? 0}, done=${byStatus.get("done") ?? 0}`,
  );
  console.log(`category README files: ${collected.categoryReadmes.length}`);
  console.log(`artifact candidates: ${collected.artifacts.length}`);
  console.log(
    `artifact auto targets: ${collected.artifacts.length - unresolvedArtifacts.length}`,
  );
  console.log(`artifact unresolved: ${unresolvedArtifacts.length}`);

  for (const [key, values] of duplicateLegacy) {
    if (values.length > 1)
      console.log(`duplicate legacy id: ${key} -> ${values.join(", ")}`);
  }
  for (const artifact of unresolvedArtifacts)
    console.log(`unresolved artifact: ${artifact.source}`);
}

const collected = await collectLegacy();
const artifactTargets = new Map();
for (const artifact of collected.artifacts) {
  const target = uniqueArtifactTarget(artifact, collected.tasks);
  if (target) artifactTargets.set(artifact.source, target);
}

printPlan(collected, artifactTargets);

if (!APPLY) {
  console.log("dry-run complete. Re-run with --apply to migrate files.");
  process.exit(0);
}

for (const task of collected.tasks) {
  const target = taskTarget(task);
  if (existsSync(target.dir))
    throw new Error(`target already exists: ${target.dir}`);
  await mkdir(join(target.dir, "acceptance"), { recursive: true });
  await mkdir(join(target.dir, "artifacts"), { recursive: true });
  await rename(task.filePath, target.taskMd);
  await writeFile(target.meta, stringifyMeta(metaFor(task)), "utf8");
  await writeFile(
    join(target.dir, "review.md"),
    "# Review\n\n## Verdict\n\n-\n",
    "utf8",
  );
  await writeFile(
    join(target.dir, "impl.md"),
    "# Implementation Log\n\n-\n",
    "utf8",
  );
  await writeFile(
    join(target.dir, "eval.md"),
    "# Evaluation\n\n## Verdict\n\n-\n",
    "utf8",
  );
  await writeFile(join(target.dir, "acceptance", ".gitkeep"), "", "utf8");
  await writeFile(join(target.dir, "artifacts", ".gitkeep"), "", "utf8");
}

for (const readme of collected.categoryReadmes) {
  const taskCount = collected.tasks.filter(
    (task) => task.category === readme.category,
  ).length;
  await writeIndexPreface(readme, taskCount);
}

for (const artifact of collected.artifacts) {
  const target = artifactTargets.get(artifact.source);
  if (!target) continue;
  await mkdir(dirname(target), { recursive: true });
  await rename(artifact.source, target);
}

await writeFile(
  join(LEGACY_ROOT, "README.md"),
  [
    "# タスク管理",
    "",
    "Sincromisor のタスク管理正本は `tasks/README.md` と `tasks/<category>/task-*/` に移行した。",
    "",
    "旧 `documents/tasks/<category>/open` / `done` のタスク本文は新レイアウトへ移動済み。",
    "",
  ].join("\n"),
  "utf8",
);

console.log("migration applied");
