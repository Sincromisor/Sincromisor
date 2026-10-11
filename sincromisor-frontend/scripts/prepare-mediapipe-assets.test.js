import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import {
    copyFile,
    mkdir,
    mkdtemp,
    readdir,
    readFile,
    rm,
    symlink,
    writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// 実際のCLIを隔離した配置先で実行し、ローカル素材やnode_modulesを変更せず再発条件を作る。
test("古いリンク・素材を除去し、再実行と生成先リンクの交換でも他の素材を保つ", async () => {
    const root = await mkdtemp(join(tmpdir(), "sincro-assets-"));
    try {
        await mkdir(join(root, "scripts"));
        await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
        const script = join(root, "scripts/prepare-mediapipe-assets.js");
        await copyFile(new URL("./prepare-mediapipe-assets.js", import.meta.url), script);
        const source = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
        const destination = join(root, "public/mediapipe-wasm");
        await mkdir(source, { recursive: true });
        await mkdir(destination, { recursive: true });
        await writeFile(join(source, "vision.wasm"), "current");
        await writeFile(join(source, "vision.js"), "loader");
        await writeFile(join(root, "public/keep.txt"), "keep");
        await writeFile(join(destination, "old.wasm"), "old");
        await symlink("../node_modules/@mediapipe/tasks-vision/wasm", join(destination, "wasm"));
        const run = () => execFileSync(process.execPath, [script], { stdio: "pipe" });
        run();
        run();
        assert.deepEqual((await readdir(destination)).sort(), ["vision.js", "vision.wasm"]);
        assert.equal(await readFile(join(destination, "vision.wasm"), "utf8"), "current");
        await rm(destination, { recursive: true });
        await symlink(source, destination);
        run();
        assert.equal(await readFile(join(source, "vision.wasm"), "utf8"), "current");
        assert.equal(await readFile(join(root, "public/keep.txt"), "utf8"), "keep");
        await rm(source, { recursive: true });
        assert.throws(run);
        assert.equal(await readFile(join(destination, "vision.wasm"), "utf8"), "current");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
