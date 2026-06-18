import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readCustomFields, readMeta, stringifyMeta } from "../lib.mjs";

let tmp;

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "kit-meta-"));
});
afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

async function writeMeta(content) {
    const metaPath = join(tmp, "chore", "task-260101000000-fixture", "meta.yaml");
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, content, "utf8");
    return metaPath;
}

const KNOWN_ONLY_GOLDEN = `id: task-260101000000-fixture
title: Fixture
category: chore
status: open
depends_on: []
superseded_by: null
review: null
reviewed_sha: null
verdict: null
attempts: 0
created_at: null
closed_at: null
`;

describe("stringifyMeta golden (回帰防止)", () => {
    test("extra が空の meta の出力は現行と完全一致する", () => {
        const meta = {
            id: "task-260101000000-fixture",
            title: "Fixture",
            category: "chore",
            status: "open",
            depends_on: [],
            superseded_by: null,
            review: null,
            reviewed_sha: null,
            verdict: null,
            attempts: 0,
            created_at: null,
            closed_at: null,
        };
        expect(stringifyMeta(meta)).toBe(KNOWN_ONLY_GOLDEN);
    });
});

describe("readMeta / stringifyMeta round-trip で custom field を保全する", () => {
    test("既知 12 フィールドのみは extra なしで読める", async () => {
        const metaPath = await writeMeta(KNOWN_ONLY_GOLDEN);
        const meta = await readMeta(metaPath);
        expect(meta.extra).toBeUndefined();
        expect(stringifyMeta(meta)).toBe(KNOWN_ONLY_GOLDEN);
    });

    test("独自フィールドは値・型・出現順を保って round-trip する", async () => {
        const src = `${KNOWN_ONLY_GOLDEN}legacy_id: TASK-42
external_ticket: ABC-123
priority: 7
`;
        const metaPath = await writeMeta(src);
        const meta = await readMeta(metaPath);
        expect(meta.extra).toEqual({
            legacy_id: "TASK-42",
            external_ticket: "ABC-123",
            priority: 7,
        });
        expect(stringifyMeta(meta)).toBe(src);
    });
});

describe("readCustomFields", () => {
    test("package.json の taskMeta.customFields を読む", async () => {
        const pkg = join(tmp, "package.json");
        await writeFile(pkg, JSON.stringify({ taskMeta: { customFields: ["legacy_id", "x"] } }));
        expect(await readCustomFields(pkg)).toEqual(["legacy_id", "x"]);
    });
    test("未定義なら空配列", async () => {
        const pkg = join(tmp, "package.json");
        await writeFile(pkg, JSON.stringify({ name: "x" }));
        expect(await readCustomFields(pkg)).toEqual([]);
    });
    test("ファイルが無ければ空配列", async () => {
        expect(await readCustomFields(join(tmp, "nope.json"))).toEqual([]);
    });
});
