import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

export const TASKS_ROOT = process.env.TASKS_ROOT ?? "tasks";
export const STATUSES = ["open", "blocked", "done", "cancelled", "superseded"];
export const TERMINAL_STATUSES = ["done", "cancelled", "superseded"];
export const REVIEWS = ["APPROVED", "NEEDS_REVISION"];
export const VERDICTS = ["PASS", "FAIL"];

const STATUS_RANK = { open: 0, blocked: 1, done: 2, cancelled: 3, superseded: 4 };

export function isStatus(value) {
    return typeof value === "string" && STATUSES.includes(value);
}

export function isReview(value) {
    return typeof value === "string" && REVIEWS.includes(value);
}

export function isVerdict(value) {
    return typeof value === "string" && VERDICTS.includes(value);
}

function parseScalar(value) {
    const trimmed = value.trim();
    if (trimmed === "" || trimmed === "null") return null;
    if (trimmed === "[]") return [];
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        const parsed = JSON.parse(trimmed);
        if (!Array.isArray(parsed)) throw new Error(`array expected: ${value}`);
        return parsed.map(String);
    }
    if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
    }
    return trimmed;
}

export function parseMetaYaml(content) {
    const out = {};
    let currentArrayKey = null;
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line.trim() || line.trimStart().startsWith("#")) continue;
        const item = line.match(/^\s*-\s+(.*)$/);
        if (item && currentArrayKey) {
            out[currentArrayKey].push(String(parseScalar(item[1])));
            continue;
        }
        currentArrayKey = null;
        const match = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
        if (!match) continue;
        const [, key, value = ""] = match;
        if (value === "") {
            out[key] = [];
            currentArrayKey = key;
        } else {
            out[key] = parseScalar(value);
        }
    }
    return out;
}

function yamlValue(value) {
    if (value == null) return "null";
    if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(String(v))).join(", ")}]`;
    if (typeof value === "number") return String(value);
    return JSON.stringify(String(value));
}

export function stringifyMeta(meta) {
    const ordered = {
        id: meta.id,
        title: meta.title,
        category: meta.category,
        status: meta.status,
        depends_on: meta.depends_on,
        superseded_by: meta.superseded_by,
        review: meta.review,
        reviewed_sha: meta.reviewed_sha,
        verdict: meta.verdict,
        attempts: meta.attempts,
        legacy_ids: meta.legacy_ids,
        created_at: meta.created_at,
        closed_at: meta.closed_at,
    };
    return `${Object.entries(ordered)
        .map(([key, value]) => `${key}: ${yamlValue(value)}`)
        .join("\n")}\n`;
}

export async function readMeta(metaPath) {
    const raw = parseMetaYaml(await readFile(metaPath, "utf8"));
    const dir = dirname(metaPath);
    const id = typeof raw.id === "string" ? raw.id : basename(dir);
    const status = isStatus(raw.status) ? raw.status : "open";
    return {
        id,
        title: typeof raw.title === "string" ? raw.title : id,
        category: typeof raw.category === "string" ? raw.category : basename(dirname(dir)),
        status,
        depends_on: Array.isArray(raw.depends_on) ? raw.depends_on.map(String) : [],
        superseded_by: typeof raw.superseded_by === "string" ? raw.superseded_by : null,
        review: isReview(raw.review) ? raw.review : null,
        reviewed_sha: typeof raw.reviewed_sha === "string" ? raw.reviewed_sha : null,
        verdict: isVerdict(raw.verdict) ? raw.verdict : null,
        attempts: Number.isInteger(raw.attempts) ? raw.attempts : 0,
        legacy_ids: Array.isArray(raw.legacy_ids) ? raw.legacy_ids.map(String) : [],
        created_at: typeof raw.created_at === "string" ? raw.created_at : null,
        closed_at: typeof raw.closed_at === "string" ? raw.closed_at : null,
    };
}

export async function discoverTasks(root = TASKS_ROOT) {
    const out = [];
    for (const category of await listDirs(root)) {
        const catDir = join(root, category);
        for (const name of await listDirs(catDir)) {
            if (!name.startsWith("task-")) continue;
            const dir = join(catDir, name);
            const metaPath = join(dir, "meta.yaml");
            if (!existsSync(metaPath)) continue;
            const meta = await readMeta(metaPath);
            out.push({ meta, metaPath, dir, taskMdPath: join(dir, "task.md") });
        }
    }
    out.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
    return out;
}

export async function listDirs(dir) {
    try {
        const entries = await readdir(dir, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
        return [];
    }
}

export function sortByStatusThenId(a, b) {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    return rank !== 0 ? rank : a.id.localeCompare(b.id);
}

export function mdCell(value) {
    return String(value).replace(/\|/g, "\\|").replace(/\n+/g, " ").trim();
}

export function relLink(fromFile, toFile) {
    let link = relative(dirname(fromFile), toFile).split("\\").join("/");
    if (!link.startsWith(".")) link = `./${link}`;
    return link;
}

export async function writeFileEnsured(filePath, content) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
}

export function today() {
    return new Date().toISOString().slice(0, 10);
}
