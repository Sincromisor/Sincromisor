#!/usr/bin/env node

import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);

const implementationRoot = process.argv[2];
assert.ok(implementationRoot, "usage: node frontend-structure-guard.test.mjs <implementation-root>");

async function run(command, args, options = {}) {
    try {
        const result = await execFileAsync(command, args, {
            maxBuffer: 1024 * 1024 * 8,
            ...options,
        });
        return { code: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
        return {
            code: error.code ?? 1,
            stdout: error.stdout ?? "",
            stderr: error.stderr ?? "",
        };
    }
}

function numberedLines(count, prefix) {
    return Array.from({ length: count }, (_, index) => `export const ${prefix}${index} = ${index};`).join(
        "\n",
    );
}

async function writeSource(path, lineCount, exception = false) {
    const lines = exception
        ? [`// reason: structure-threshold-exception acceptance fixture`, numberedLines(lineCount - 1, "value")]
        : [numberedLines(lineCount, "value")];
    await writeFile(path, `${lines.join("\n")}\n`);
}

const tempRoot = await mkdtemp(join(tmpdir(), "frontend-structure-guard-"));

try {
    await mkdir(join(tempRoot, "scripts/tasks"), { recursive: true });
    await mkdir(join(tempRoot, "sincromisor-frontend/src/__tests__"), { recursive: true });
    await mkdir(join(tempRoot, "sincromisor-frontend/src/nested"), { recursive: true });

    const script = await readFile(
        join(implementationRoot, "scripts/tasks/checkFrontendStructure.mjs"),
        "utf8",
    );
    await writeFile(join(tempRoot, "scripts/tasks/checkFrontendStructure.mjs"), script);

    const strictFile = join(tempRoot, "sincromisor-frontend/src/strict.ts");
    await writeSource(strictFile, 10);
    await writeSource(join(tempRoot, "sincromisor-frontend/src/strict.test.ts"), 350);
    await writeSource(join(tempRoot, "sincromisor-frontend/src/__tests__/fixture.ts"), 350);
    await writeSource(join(tempRoot, "sincromisor-frontend/src/nested/types.d.ts"), 350);
    await writeFile(join(tempRoot, "sincromisor-frontend/src/nested/page.html"), numberedLines(350, "html"));

    assert.equal((await run("git", ["init"], { cwd: tempRoot })).code, 0);
    assert.equal((await run("git", ["checkout", "-b", "main"], { cwd: tempRoot })).code, 0);
    assert.equal((await run("git", ["config", "user.email", "acceptance@example.invalid"], { cwd: tempRoot })).code, 0);
    assert.equal((await run("git", ["config", "user.name", "Acceptance Test"], { cwd: tempRoot })).code, 0);
    assert.equal((await run("git", ["add", "."], { cwd: tempRoot })).code, 0);
    assert.equal((await run("git", ["commit", "-m", "baseline"], { cwd: tempRoot })).code, 0);

    await writeSource(strictFile, 301);
    const strictFailure = await run(process.execPath, ["scripts/tasks/checkFrontendStructure.mjs"], {
        cwd: tempRoot,
    });
    assert.equal(strictFailure.code, 1);
    assert.match(strictFailure.stdout, /301 sincromisor-frontend\/src\/strict\.ts/);
    assert.match(strictFailure.stderr, /strict target file\(s\) exceed 300 line\(s\)/);
    assert.doesNotMatch(`${strictFailure.stdout}\n${strictFailure.stderr}`, /strict\.test\.ts/);
    assert.doesNotMatch(`${strictFailure.stdout}\n${strictFailure.stderr}`, /__tests__\/fixture\.ts/);
    assert.doesNotMatch(`${strictFailure.stdout}\n${strictFailure.stderr}`, /types\.d\.ts/);
    assert.doesNotMatch(`${strictFailure.stdout}\n${strictFailure.stderr}`, /page\.html/);

    await writeSource(strictFile, 301, true);
    const exceptionWarning = await run(process.execPath, ["scripts/tasks/checkFrontendStructure.mjs"], {
        cwd: tempRoot,
    });
    assert.equal(exceptionWarning.code, 0);
    assert.match(exceptionWarning.stderr, /accepted by structure-threshold-exception/);
    assert.match(exceptionWarning.stdout, /warnings=1, failures=0/);

    const fallback = await run(process.execPath, ["scripts/tasks/checkFrontendStructure.mjs"], {
        cwd: tempRoot,
        env: { ...process.env, PATH: "/private/tmp/no-such-git" },
    });
    assert.equal(fallback.code, 0);
    assert.match(fallback.stderr, /strict target diff unavailable; running inventory only/);
    assert.match(fallback.stdout, /strict=0, warnings=0, failures=0/);

    console.log("frontend structure guard acceptance checks passed");
} finally {
    await rm(tempRoot, { recursive: true, force: true });
}
