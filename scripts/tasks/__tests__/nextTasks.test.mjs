import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "nextTasks.mjs");

test("未レビューでも依存解決済みタスクを実行可能として返す", async () => {
    const root = mkdtempSync(join(tmpdir(), "next-tasks-"));
    const id = "task-260808000000-ready";
    const dir = join(root, "tasks", "test", id);
    await mkdir(dir, { recursive: true });
    await writeFile(
        join(dir, "meta.yaml"),
        `id: ${id}\ntitle: ready\ncategory: test\nstatus: open\ndepends_on: []\nreview: null\nverdict: null\nattempts: 0\ncreated_at: 2026-08-08\n`,
    );

    try {
        const proc = Bun.spawn(["bun", SCRIPT, "--json", "--ready-only"], {
            cwd: root,
            stdout: "pipe",
        });
        const output = await new Response(proc.stdout).text();
        expect(await proc.exited).toBe(0);
        expect(JSON.parse(output).recommended).toMatchObject({ id, readyKind: "run" });
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
