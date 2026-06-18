import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const SET_META = resolve(import.meta.dir, "../setMeta.mjs");
const MIGRATE = resolve(import.meta.dir, "../migrateReviewedSha.mjs");

let tmp;
let metaPath;

const BASE_META = `id: task-260101000000-fixture
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

beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "kit-setmeta-"));
    metaPath = join(tmp, "tasks", "chore", "task-260101000000-fixture", "meta.yaml");
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, BASE_META, "utf8");
});
afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

async function writePkg(customFields) {
    const pkg = customFields ? { taskMeta: { customFields } } : { name: "x" };
    await writeFile(join(tmp, "package.json"), JSON.stringify(pkg), "utf8");
}

async function runSetMeta(...args) {
    const proc = Bun.spawn(["node", SET_META, ...args], {
        cwd: tmp,
        stdout: "pipe",
        stderr: "pipe",
    });
    const code = await proc.exited;
    const meta = await readFile(metaPath, "utf8");
    return { code, meta };
}

test("宣言されていないキーは既定で拒否される（タイポ保護）", async () => {
    await writePkg();
    const { code, meta } = await runSetMeta(dirname(metaPath), "staus=done");
    expect(code).not.toBe(0);
    expect(meta).toBe(BASE_META);
});

test("宣言済みカスタムフィールドは key=value で設定でき、削除もできる", async () => {
    await writePkg(["legacy_id"]);
    const set = await runSetMeta(dirname(metaPath), "legacy_id=TASK-42");
    expect(set.code).toBe(0);
    expect(set.meta).toContain("legacy_id: TASK-42");
    const del = await runSetMeta(dirname(metaPath), "legacy_id=null");
    expect(del.code).toBe(0);
    expect(del.meta).not.toContain("legacy_id");
});

test("宣言外の既存 custom field は触らず保持する", async () => {
    await writePkg(["legacy_id"]);
    await writeFile(metaPath, `${BASE_META}external_ticket: ABC-123\n`, "utf8");
    const { code, meta } = await runSetMeta(dirname(metaPath), "legacy_id=X");
    expect(code).toBe(0);
    expect(meta).toContain("external_ticket: ABC-123");
    expect(meta).toContain("legacy_id: X");
});

async function runMigrate(apply) {
    const args = apply ? [MIGRATE, "--apply"] : [MIGRATE];
    const proc = Bun.spawn(["node", ...args], { cwd: tmp, stdout: "pipe", stderr: "pipe" });
    return { code: await proc.exited };
}

const NO_SHA_META = `id: task-260101000000-fixture
title: Fixture
category: chore
status: open
depends_on: []
superseded_by: null
review: null
verdict: null
attempts: 0
created_at: null
closed_at: null
legacy_id: TASK-42
`;

test("移行スクリプト: dry-run は未付与 meta にファイルを書かない", async () => {
    await writeFile(metaPath, NO_SHA_META, "utf8");
    await writePkg();
    const { code } = await runMigrate(false);
    expect(code).toBe(0);
    expect(await readFile(metaPath, "utf8")).toBe(NO_SHA_META);
});

test("移行スクリプト: --apply で reviewed_sha のみ付与し extra は不変", async () => {
    await writeFile(metaPath, NO_SHA_META, "utf8");
    await writePkg();
    const { code } = await runMigrate(true);
    expect(code).toBe(0);
    expect(await readFile(metaPath, "utf8")).toBe(`${BASE_META}legacy_id: TASK-42\n`);
});
