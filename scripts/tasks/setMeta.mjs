#!/usr/bin/env node

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
    isReview,
    isStatus,
    isVerdict,
    readMeta,
    REVIEWS,
    STATUSES,
    stringifyMeta,
    TERMINAL_STATUSES,
    today,
    VERDICTS,
} from "./lib.mjs";

function fail(message) {
    console.error(`Error: ${message}`);
    process.exit(1);
}

function resolveMetaPath(target) {
    if (target.endsWith("meta.yaml")) return target;
    if (target.endsWith("task.md")) return target.replace(/task\.md$/, "meta.yaml");
    return join(target, "meta.yaml");
}

function listValue(rawValue) {
    if (rawValue === "" || rawValue === "null") return [];
    return rawValue
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
}

const [target, ...pairs] = process.argv.slice(2);
if (!target || pairs.length === 0) {
    fail("Usage: node scripts/tasks/setMeta.mjs <task-dir|meta.yaml|task.md> key=value ...");
}

const metaPath = resolveMetaPath(target);
if (!existsSync(metaPath)) fail(`meta.yaml not found: ${metaPath}`);

const meta = await readMeta(metaPath);
let statusBecameTerminal = false;
let closedAtTouched = false;

for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq === -1) fail(`Expected key=value: ${pair}`);
    const key = pair.slice(0, eq).trim();
    const rawValue = pair.slice(eq + 1).trim();
    const nullish = rawValue === "" || rawValue === "null";

    switch (key) {
        case "status": {
            if (!isStatus(rawValue)) fail(`status must be one of ${STATUSES.join("|")}: ${rawValue}`);
            const wasTerminal = TERMINAL_STATUSES.includes(meta.status);
            const willBeTerminal = TERMINAL_STATUSES.includes(rawValue);
            if (willBeTerminal && !wasTerminal) statusBecameTerminal = true;
            if (rawValue === "superseded" && !meta.superseded_by) {
                console.warn("warning: status=superseded should also set superseded_by=<task-id>");
            }
            meta.status = rawValue;
            break;
        }
        case "review":
            if (!nullish && !isReview(rawValue)) {
                fail(`review must be one of ${REVIEWS.join("|")} or null: ${rawValue}`);
            }
            meta.review = nullish ? null : rawValue;
            break;
        case "reviewed_sha":
            if (!nullish && !/^[0-9a-f]{7,40}$/i.test(rawValue)) {
                fail(`reviewed_sha must be a 7-40 character hex commit SHA or null: ${rawValue}`);
            }
            meta.reviewed_sha = nullish ? null : rawValue.toLowerCase();
            break;
        case "verdict":
            if (!nullish && !isVerdict(rawValue)) {
                fail(`verdict must be one of ${VERDICTS.join("|")} or null: ${rawValue}`);
            }
            meta.verdict = nullish ? null : rawValue;
            break;
        case "attempts": {
            const attempts = Number(rawValue);
            if (!Number.isInteger(attempts) || attempts < 0) fail(`attempts must be a non-negative integer: ${rawValue}`);
            meta.attempts = attempts;
            break;
        }
        case "depends_on":
            meta.depends_on = listValue(rawValue);
            break;
        case "superseded_by":
            meta.superseded_by = nullish ? null : rawValue;
            break;
        case "legacy_ids":
            meta.legacy_ids = listValue(rawValue);
            break;
        case "closed_at":
            meta.closed_at = nullish ? null : rawValue;
            closedAtTouched = true;
            break;
        case "created_at":
            meta.created_at = nullish ? null : rawValue;
            break;
        case "title":
            meta.title = rawValue;
            break;
        case "id":
        case "category":
            fail(`${key} is derived from the task location and is not updated by setMeta`);
            break;
        default:
            fail(`Unknown meta field: ${key}`);
    }
}

if (statusBecameTerminal && !closedAtTouched && !meta.closed_at) {
    meta.closed_at = today();
}

if (meta.status === "done" && meta.verdict && meta.verdict !== "PASS") {
    fail("status=done requires verdict=PASS or verdict=null");
}

await writeFile(metaPath, stringifyMeta(meta), "utf8");
console.log(`updated: ${metaPath}`);
console.log(stringifyMeta(meta).trimEnd());
