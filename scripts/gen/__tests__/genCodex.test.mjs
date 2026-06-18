import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const GEN = join(import.meta.dir, "..", "genCodex.mjs");

let tmp;

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "kit-gencodex-"));
});
afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

async function writeFileEnsured(path, content) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
}

/** genCodex.mjs を子プロセスで実行し、{ code, stdout, stderr } を返す。 */
async function runGen(extraArgs = []) {
    const proc = Bun.spawn(["bun", GEN, "--root", tmp, ...extraArgs], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return { code, stdout, stderr };
}

/** 一時 .claude/ に command / agent の最小 source を仕込む。 */
async function seedSource() {
    await writeFileEnsured(
        join(tmp, ".claude", "commands", "alpha.md"),
        "---\nname: alpha\ndescription: alpha command\n---\n\nAlpha body.\n",
    );
    await writeFileEnsured(
        join(tmp, ".claude", "agents", "beta.md"),
        "---\nname: beta\ndescription: beta agent\ntools: Read\n---\n\nBeta body.\n",
    );
}

describe("gen:codex orphan 検出・prune", () => {
    test("source と生成物が一致すれば --check は orphan ゼロで通過（回帰なし）", async () => {
        await seedSource();
        const gen = await runGen();
        expect(gen.code).toBe(0);

        const check = await runGen(["--check"]);
        expect(check.code).toBe(0);
        expect(check.stdout).toContain("すべて最新です");
    });

    test("source 削除後 --check は当該 orphan を列挙して exit 1", async () => {
        await seedSource();
        await runGen();

        // source を削除（生成物は残る → orphan になる）
        rmSync(join(tmp, ".claude", "commands", "alpha.md"));
        rmSync(join(tmp, ".claude", "agents", "beta.md"));

        const check = await runGen(["--check"]);
        expect(check.code).toBe(1);
        expect(check.stderr).toContain("orphan");
        expect(check.stderr).toContain(join(tmp, ".agents", "skills", "alpha", "SKILL.md"));
        expect(check.stderr).toContain(join(tmp, ".codex", "agents", "beta.toml"));
    });

    test("生成モードは marker 付き orphan を削除し空 skill ディレクトリも除去、再 --check で通過", async () => {
        await seedSource();
        await runGen();

        rmSync(join(tmp, ".claude", "commands", "alpha.md"));
        rmSync(join(tmp, ".claude", "agents", "beta.md"));

        const gen = await runGen();
        expect(gen.code).toBe(0);
        expect(gen.stdout).toContain("orphan");

        // orphan が消えている
        expect(existsSync(join(tmp, ".agents", "skills", "alpha", "SKILL.md"))).toBe(false);
        expect(existsSync(join(tmp, ".agents", "skills", "alpha"))).toBe(false); // 空ディレクトリも削除
        expect(existsSync(join(tmp, ".codex", "agents", "beta.toml"))).toBe(false);

        const check = await runGen(["--check"]);
        expect(check.code).toBe(0);
    });

    test("marker 無し手書きファイルは検出・削除しない", async () => {
        await seedSource();
        await runGen();

        // source を全削除
        rmSync(join(tmp, ".claude", "commands", "alpha.md"));
        rmSync(join(tmp, ".claude", "agents", "beta.md"));

        // marker を持たない手書きファイルを生成先に置く
        const handToml = join(tmp, ".codex", "agents", "handwritten.toml");
        const handSkill = join(tmp, ".agents", "skills", "manual", "SKILL.md");
        await writeFileEnsured(handToml, 'name = "handwritten"\n');
        await writeFileEnsured(handSkill, "---\nname: manual\n---\n\nhand written.\n");

        // --check は marker 付き orphan のみ検出（手書きは含まない）
        const check = await runGen(["--check"]);
        expect(check.code).toBe(1);
        expect(check.stderr).not.toContain("handwritten.toml");
        expect(check.stderr).not.toContain(join("manual", "SKILL.md"));

        // 生成しても手書きファイルは残る
        await runGen();
        expect(existsSync(handToml)).toBe(true);
        expect(existsSync(handSkill)).toBe(true);
        // marker 付き orphan は消える
        expect(existsSync(join(tmp, ".codex", "agents", "beta.toml"))).toBe(false);
    });

    test("生成先ディレクトリ未作成なら orphan ゼロで --check 通過", async () => {
        await seedSource();
        // 生成せず（.codex / .agents は存在しない）に --check
        const check = await runGen(["--check"]);
        // 生成物が無い → stale で fail するが orphan は出ない
        expect(check.stderr).not.toContain("orphan");
    });

    test("手書きファイル同居の skill ディレクトリは orphan 削除で巻き込まない", async () => {
        await seedSource();
        await runGen();
        rmSync(join(tmp, ".claude", "commands", "alpha.md"));

        // alpha skill ディレクトリに marker 無しファイルを同居させる
        const sibling = join(tmp, ".agents", "skills", "alpha", "NOTES.md");
        await writeFile(sibling, "hand notes\n");

        await runGen();
        // SKILL.md（orphan）は消えるが、同居の NOTES.md とディレクトリは残る
        expect(existsSync(join(tmp, ".agents", "skills", "alpha", "SKILL.md"))).toBe(false);
        expect(existsSync(sibling)).toBe(true);
        expect(existsSync(join(tmp, ".agents", "skills", "alpha"))).toBe(true);
    });
});
