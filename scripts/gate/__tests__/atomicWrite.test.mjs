import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { atomicWrite } from "../gate.mjs";

describe("atomicWrite", () => {
    let dir;
    const dirs = [];

    beforeEach(() => {
        dir = mkdtempSync(path.join(tmpdir(), "gate-atomic-"));
        dirs.push(dir);
    });

    afterEach(() => {
        for (const d of dirs.splice(0)) {
            try {
                rmSync(d, { recursive: true, force: true });
            } catch {
                /* ignore cleanup errors */
            }
        }
    });

    test("書き込み後にファイルが完全な内容として読める（JSON も round-trip する）", () => {
        const dst = path.join(dir, "abc123.json");
        const payload = JSON.stringify({ step: "test", code: 0, ts: "2026-06-17T00:00:00.000Z" });
        atomicWrite(dst, payload);
        const read = readFileSync(dst, "utf8");
        expect(read).toBe(payload);
        expect(JSON.parse(read).code).toBe(0);
    });

    test("確定後に .tmp 残骸が残らない（rename で消費される）", () => {
        const dst = path.join(dir, "key.log");
        atomicWrite(dst, "full log output\n");
        const entries = readdirSync(dir);
        expect(entries).toContain("key.log");
        expect(entries.some((e) => e.endsWith(".tmp"))).toBe(false);
    });

    test("同一キーへ連続 2 回書いても最終内容が一貫している（last writer wins）", () => {
        const dst = path.join(dir, "key.json");
        atomicWrite(dst, "first");
        atomicWrite(dst, "second");
        expect(readFileSync(dst, "utf8")).toBe("second");
        const entries = readdirSync(dir);
        expect(entries).toEqual(["key.json"]);
    });
});
