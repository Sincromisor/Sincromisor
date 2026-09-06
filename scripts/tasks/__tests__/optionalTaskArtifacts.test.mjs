import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("最小構成で生成・検査でき、必須ファイルの欠落は拒否する", () => {
    // 実タスクから隔離し、生成と検査の両方に同じ保存先を渡す。
    const root = mkdtempSync(join(tmpdir(), "sincromisor-task-layout-"));
    const env = { ...process.env, TASKS_ROOT: root };
    const createScript = new URL("../newTask.mjs", import.meta.url);
    const checkScript = new URL("../checkTasks.mjs", import.meta.url);
    try {
        const created = spawnSync(
            process.execPath,
            [createScript.pathname, "test", "最小構成の確認", "--slug=minimal"],
            { env, encoding: "utf8" },
        );
        assert.ifError(created.error);
        assert.equal(created.status, 0, created.stderr);
        const category = join(root, "test");
        const task = join(category, readdirSync(category)[0]);
        assert.deepEqual(readdirSync(task).sort(), ["meta.yaml", "task.md"]);

        const valid = spawnSync(process.execPath, [checkScript.pathname], {
            env,
            encoding: "utf8",
        });
        assert.ifError(valid.error);
        assert.equal(valid.status, 0, valid.stderr);

        rmSync(join(task, "task.md"));
        const missingTask = spawnSync(process.execPath, [checkScript.pathname], {
            env,
            encoding: "utf8",
        });
        assert.ifError(missingTask.error);
        assert.equal(missingTask.status, 1);
        assert.match(missingTask.stderr, /missing task\.md/);

        rmSync(join(task, "meta.yaml"));
        const missingMeta = spawnSync(process.execPath, [checkScript.pathname], {
            env,
            encoding: "utf8",
        });
        assert.ifError(missingMeta.error);
        assert.equal(missingMeta.status, 1);
        assert.match(missingMeta.stderr, /missing meta\.yaml/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
