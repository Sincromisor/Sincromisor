#!/usr/bin/env node

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as yamlParse } from "yaml";
import {
    hasJapaneseText,
    isStatus,
    listDirs,
    readMeta,
    STATUSES,
    TASKS_ROOT,
    TERMINAL_STATUSES,
} from "./lib.mjs";

// meta.yamlは個別に検証する。レビュー記録や補助ディレクトリの有無は完了条件にしない。
const REQUIRED_FILES = ["task.md"];
const REVIEWS = ["APPROVED", "NEEDS_REVISION"];
const VERDICTS = ["PASS", "FAIL"];
/** 既存の英語タイトルを履歴として残し、新規タスクだけを厳格化する境界日。 */
const JAPANESE_TITLE_REQUIRED_FROM = "2026-08-24";
const META_KEYS = [
    "id",
    "title",
    "category",
    "status",
    "depends_on",
    "superseded_by",
    "review",
    "reviewed_sha",
    "verdict",
    "attempts",
    "legacy_ids",
    "created_at",
    "closed_at",
];

function isStringOrNull(value) {
    return typeof value === "string" || value == null;
}

function formatAllowed(values) {
    return values.join("|");
}

function addIssue(issues, taskId, message) {
    issues.push(`${taskId}: ${message}`);
}

function isDateString(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isLegacyTerminalWithoutClosedAt(meta) {
    return meta.closed_at == null && meta.created_at == null && meta.attempts === 0;
}

async function readRawMeta(metaPath, fallbackTaskId, issues) {
    try {
        return yamlParse(await readFile(metaPath, "utf8")) ?? {};
    } catch (error) {
        addIssue(issues, fallbackTaskId, `meta.yaml parse failed: ${error.message}`);
        return null;
    }
}

function isReview(value) {
    return typeof value === "string" && REVIEWS.includes(value);
}

function isVerdict(value) {
    return typeof value === "string" && VERDICTS.includes(value);
}

async function collectTaskDirs(root) {
    const dirs = [];
    for (const category of await listDirs(root)) {
        const categoryDir = join(root, category);
        for (const name of await listDirs(categoryDir)) {
            if (name.startsWith("task-")) dirs.push({ category, dir: join(categoryDir, name), name });
        }
    }
    return dirs.sort((a, b) => a.dir.localeCompare(b.dir));
}

const taskDirs = await collectTaskDirs(TASKS_ROOT);
const issues = [];
const metas = new Map();

for (const task of taskDirs) {
    const taskId = task.name;
    const metaPath = join(task.dir, "meta.yaml");
    if (!existsSync(metaPath)) {
        addIssue(issues, taskId, "missing meta.yaml");
        continue;
    }

    const raw = await readRawMeta(metaPath, taskId, issues);
    if (!raw) continue;

    for (const key of META_KEYS) {
        if (!(key in raw)) addIssue(issues, taskId, `meta.yaml missing key: ${key}`);
    }

    if (raw.id !== taskId) addIssue(issues, taskId, `meta.id must match directory name (${taskId})`);
    if (raw.category !== task.category) addIssue(issues, taskId, `meta.category must match category directory (${task.category})`);
    if (typeof raw.title !== "string" || raw.title.trim() === "") {
        addIssue(issues, taskId, "title must be a non-empty string");
    } else if (
        isDateString(raw.created_at) &&
        raw.created_at >= JAPANESE_TITLE_REQUIRED_FROM &&
        !hasJapaneseText(raw.title)
    ) {
        addIssue(issues, taskId, "title には内容を説明する日本語が必要です");
    }
    if (!isStatus(raw.status)) addIssue(issues, taskId, `status must be one of ${formatAllowed(STATUSES)}`);
    if (!Array.isArray(raw.depends_on)) addIssue(issues, taskId, "depends_on must be an array");
    if (!isStringOrNull(raw.superseded_by)) addIssue(issues, taskId, "superseded_by must be a string or null");
    if (raw.review != null && !isReview(raw.review)) addIssue(issues, taskId, `review must be ${formatAllowed(REVIEWS)} or null`);
    if (
        raw.reviewed_sha != null &&
        (typeof raw.reviewed_sha !== "string" || !/^[0-9a-f]{7,40}$/i.test(raw.reviewed_sha))
    ) {
        addIssue(issues, taskId, "reviewed_sha must be null or a 7-40 character hex commit SHA");
    }
    if (raw.verdict != null && !isVerdict(raw.verdict)) addIssue(issues, taskId, `verdict must be ${formatAllowed(VERDICTS)} or null`);
    if (!Number.isInteger(raw.attempts) || raw.attempts < 0) addIssue(issues, taskId, "attempts must be a non-negative integer");
    if (!Array.isArray(raw.legacy_ids)) addIssue(issues, taskId, "legacy_ids must be an array");
    if (!isStringOrNull(raw.created_at)) addIssue(issues, taskId, "created_at must be a string or null");
    if (!isStringOrNull(raw.closed_at)) addIssue(issues, taskId, "closed_at must be a string or null");

    const meta = await readMeta(metaPath);
    const isTerminal = TERMINAL_STATUSES.includes(meta.status);
    if (meta.status === "done" && meta.verdict !== "PASS") addIssue(issues, taskId, "status=done requires verdict=PASS");
    if (meta.status !== "done" && meta.verdict === "PASS") addIssue(issues, taskId, "verdict=PASS requires status=done");
    if (isTerminal && !meta.closed_at && !isLegacyTerminalWithoutClosedAt(meta)) {
        addIssue(issues, taskId, "terminal status requires closed_at");
    }
    if (!isTerminal && meta.closed_at) addIssue(issues, taskId, "closed_at is only valid for terminal status");
    if (meta.closed_at && !isDateString(meta.closed_at)) addIssue(issues, taskId, "closed_at must use YYYY-MM-DD");
    if (meta.status === "superseded" && !meta.superseded_by) addIssue(issues, taskId, "status=superseded requires superseded_by");
    if (meta.superseded_by && meta.status !== "superseded") addIssue(issues, taskId, "superseded_by is only valid with status=superseded");

    for (const fileName of REQUIRED_FILES) {
        if (!existsSync(join(task.dir, fileName))) addIssue(issues, taskId, `missing ${fileName}`);
    }

    if (metas.has(meta.id)) addIssue(issues, taskId, `duplicate task id also used by ${metas.get(meta.id).dir}`);
    metas.set(meta.id, { dir: task.dir, meta });
}

for (const { meta } of metas.values()) {
    for (const dependency of meta.depends_on) {
        if (!metas.has(dependency)) addIssue(issues, meta.id, `depends_on references missing task: ${dependency}`);
    }
    if (meta.superseded_by && !metas.has(meta.superseded_by)) {
        addIssue(issues, meta.id, `superseded_by references missing task: ${meta.superseded_by}`);
    }
}

if (issues.length > 0) {
    console.error(`tasks:check failed with ${issues.length} issue(s)`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
}

const byStatus = new Map();
for (const { meta } of metas.values()) byStatus.set(meta.status, (byStatus.get(meta.status) ?? 0) + 1);
const statusSummary = [...byStatus.entries()]
    .sort(([a], [b]) => STATUSES.indexOf(a) - STATUSES.indexOf(b))
    .map(([status, count]) => `${status}=${count}`)
    .join(", ");
console.log(`tasks:check passed: ${metas.size} task(s), ${taskDirs.length} task directorie(s), ${statusSummary}`);
