import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("../checkFrontendStructure.mjs", import.meta.url));
const sourceRoot = "sincromisor-frontend/src";

async function fixture(t) {
    const cwd = await mkdtemp(join(tmpdir(), "frontend-structure-"));
    t.after(() => rm(cwd, { recursive: true, force: true }));
    const git = (...args) => exec("git", args, { cwd });
    const write = async (name, count, first = "// 検査用", ending = "\n") => {
        const path = join(cwd, sourceRoot, name);
        await mkdir(dirname(path), { recursive: true });
        const lines = Array.from({ length: count }, (_, i) => (i === 0 ? first : "export {};"));
        await writeFile(path, lines.join("\n") + (count ? ending : ""));
    };
    const check = async (args = [], env = process.env) => {
        try {
            const output = await exec(process.execPath, [script, ...args], { cwd, env });
            return { code: 0, ...output };
        } catch (error) {
            return { code: error.code, stdout: error.stdout, stderr: error.stderr };
        }
    };
    await git("init", "-b", "main");
    await git("config", "user.name", "Structure Test");
    await git("config", "user.email", "structure@example.invalid");
    await git("config", "core.hooksPath", join(cwd, "no-hooks"));
    await write("existing.ts", 350);
    await write("changed.ts", 1);
    await writeFile(join(cwd, ".gitignore"), `${sourceRoot}/ignored.ts\n`);
    await git("add", ".");
    await git("-c", "commit.gpgsign=false", "commit", "-m", "baseline");
    return { cwd, git, write, check };
}

function expectFailure(result, path) {
    assert.equal(result.code, 1, result.stderr);
    assert.match(result.stderr, /strict target file\(s\) exceed 300/);
    assert.ok(result.stderr.includes(path), result.stderr);
}

for (const state of ["未追跡", "未ステージ", "ステージ済み"]) {
    test(`${state}の301行を失敗にする`, async (t) => {
        const f = await fixture(t);
        const name = state === "未追跡" ? "日本語 空白\n名前.tsx" : "changed.ts";
        await f.write(name, 301);
        if (state === "ステージ済み") await f.git("add", ".");
        expectFailure(await f.check(), name);
    });
}

test("mainへコミットした変更は明示比較元で検査する", async (t) => {
    const f = await fixture(t);
    await f.write("changed.ts", 301);
    await f.git("add", ".");
    await f.git("-c", "commit.gpgsign=false", "commit", "-m", "oversized");
    const inventory = await f.check();
    assert.equal(inventory.code, 0, inventory.stderr);
    assert.match(inventory.stdout, /350 sincromisor-frontend\/src\/existing.ts/);
    assert.match(inventory.stdout, /inventory=2, strict=0/);
    expectFailure(await f.check(["--base", "HEAD~1"]), "changed.ts");
    await f.write("new.ts", 301);
    const withUntracked = await f.check(["--base", "HEAD~1"]);
    expectFailure(withUntracked, "new.ts");
    assert.match(withUntracked.stderr, /2 strict target/);
});

test("ステージと未ステージが相殺しても対象を落とさず作業ツリーを読む", async (t) => {
    const f = await fixture(t);
    await f.write("existing.ts", 1);
    await f.git("add", ".");
    await f.write("existing.ts", 350);
    expectFailure(await f.check(), "existing.ts");
});

test("物理行数は末尾改行の有無によらず300行まで成功する", async (t) => {
    const f = await fixture(t);
    for (const ending of ["\n", "", "\r\n"]) {
        for (const count of [0, 300, 301]) {
            await f.write("boundary.ts", count, "// コメントも1行", ending);
            const result = await f.check();
            if (count > 300) expectFailure(result, "boundary.ts");
            else assert.equal(result.code, 0, result.stderr);
        }
    }
    await writeFile(join(f.cwd, sourceRoot, "boundary.ts"), "\n".repeat(301));
    expectFailure(await f.check(), "boundary.ts");
});

test("理由付き例外だけを警告として受理する", async (t) => {
    const f = await fixture(t);
    await f.write(
        "changed.ts",
        301,
        "// reason: structure-threshold-exception 一体で管理する固定表",
    );
    const accepted = await f.check();
    assert.equal(accepted.code, 0, accepted.stderr);
    assert.match(accepted.stderr, /accepted by structure-threshold-exception/);
    assert.match(accepted.stdout, /warnings=1, failures=0/);
    for (const suffix of ["", "   ", "\t"]) {
        await f.write("changed.ts", 301, `// reason: structure-threshold-exception${suffix}`);
        expectFailure(await f.check(), "changed.ts");
    }
});

test("テスト・型宣言は除外し、Git除外の未追跡ファイルは厳格な対象にしない", async (t) => {
    const f = await fixture(t);
    const excluded = [
        "__tests__/large.ts",
        "large.test.ts",
        "large.test.tsx",
        "types.d.ts",
        "page.html",
    ];
    for (const name of [...excluded, "ignored.ts"]) await f.write(name, 350);
    const result = await f.check();
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /strict=0/);
    for (const name of excluded) assert.ok(!result.stdout.includes(name), result.stdout);
});

test("削除済みファイルを除き、改名先を検査する", async (t) => {
    const f = await fixture(t);
    await f.git("rm", `${sourceRoot}/existing.ts`);
    assert.equal((await f.check()).code, 0);
    await f.git("mv", `${sourceRoot}/changed.ts`, `${sourceRoot}/renamed.ts`);
    await f.write("renamed.ts", 301);
    expectFailure(await f.check(), "renamed.ts");
});

test("不正な比較元・引数・Git実行失敗を終了コードで返す", async (t) => {
    const f = await fixture(t);
    for (const args of [
        ["--base", "missing"],
        ["--base"],
        ["--unknown"],
        ["--base", "HEAD..HEAD"],
    ]) {
        const result = await f.check(args);
        assert.equal(result.code, 1, result.stderr);
        assert.match(result.stderr, /target selection failed/);
        assert.doesNotMatch(result.stdout, /failures=0/);
    }
    const noGit = await f.check([], { ...process.env, PATH: join(f.cwd, "no-git") });
    assert.equal(noGit.code, 1);
    assert.match(noGit.stderr, /target selection failed/);
});

test("比較元の解決後も差分・未追跡一覧の取得失敗を成功にしない", async (t) => {
    const f = await fixture(t);
    const bin = join(f.cwd, "bin");
    await mkdir(bin);
    const { stdout: revision } = await f.git("rev-parse", "HEAD");
    for (const command of ["diff", "ls-files"]) {
        await writeFile(
            join(bin, "git"),
            `#!/bin/sh\ncase "$1" in\nrev-parse) echo ${revision.trim()} ;;\n${command}) exit 1 ;;\n*) exit 0 ;;\nesac\n`,
            { mode: 0o755 },
        );
        const result = await f.check([], { ...process.env, PATH: bin });
        assert.equal(result.code, 1, result.stderr);
        assert.match(result.stderr, /target selection failed/);
        assert.doesNotMatch(result.stdout, /failures=0/);
    }
});
