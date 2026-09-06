/** 外部サービスを変更せず、CLI境界で削除保護と公開順序を確認する。 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

test("公開失敗時の停止と、現行・他リポジトリの削除保護", () => {
  const dir = mkdtempSync(join(tmpdir(), "sincromisor-publish-test-"));
  const script = resolve("scripts/publish-images.mjs");
  const mock = `#!/usr/bin/env -S node --
const fs = require('node:fs');
const tool = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify([tool, ...args]) + '\\n');
const sha = 'a'.repeat(40);
if (tool === 'git' && args[0] === 'rev-parse') console.log(sha);
if (tool === 'docker' && args[0] === 'compose') {
 const context = args[args.indexOf('--project-directory') + 1];
 console.log(JSON.stringify({services: {
  rtc: {image: 'ghcr.io/sincromisor/sincro-rtc:latest', build: {context, dockerfile: 'Docker/rtc/Dockerfile'}},
  frontend: {image: 'ghcr.io/sincromisor/sincro-frontend:latest', build: {context, dockerfile: 'Docker/frontend/Dockerfile'}},
  consul: {image: 'hashicorp/consul:latest'}
 }}));
}
if (tool === 'docker' && args[0] === '--config' && process.env.FAIL_ANON === '1') process.exit(1);
if (tool === 'docker' && args[1] === 'build' && process.env.FAIL_BUILD === '1') process.exit(1);
if (tool === 'docker' && args[0] === 'image') console.log(JSON.stringify([{Os:'linux', Architecture:'amd64', Config:{Labels:{'org.opencontainers.image.revision': process.env.BAD_REV ? 'b'.repeat(40) : sha}}}]));
if (tool === 'docker' && args[2] === 'inspect') console.log('"sha256:abc"');
if (tool === 'gh' && !args.includes('DELETE')) console.log(JSON.stringify([[
 {name:'minio', repository:{full_name:'Sincromisor/Sincromisor'}},
 {name:'sincro-frontend', visibility:'public', repository:{full_name:'Sincromisor/Sincromisor'}},
 {name:'sincro-rtc', visibility:'public', repository:{full_name:'Sincromisor/Sincromisor'}},
 {name:'other', repository:{full_name:'Sincromisor/Other'}}
]]));
`;
  try {
    for (const tool of ["git", "docker", "gh", "tar"])
      writeFileSync(join(dir, tool), mock, { mode: 0o755 });
    const callsFile = join(dir, "calls");
    const invoke = (args, env = {}) => {
      writeFileSync(callsFile, "");
      const result = spawnSync(process.execPath, [script, ...args], {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          CALLS: callsFile,
          NODE_TEST_CONTEXT: undefined,
          ...env,
        },
        encoding: "utf8",
      });
      const calls = readFileSync(callsFile, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(JSON.parse);
      return { result, calls };
    };
    for (const name of ["sincro-rtc", "other", "missing"]) {
      const { result, calls } = invoke(["delete-retired", "minio", name]);
      assert.equal(result.status, 1, result.stderr);
      assert(
        !calls.some((c) => c.includes("DELETE")),
        "全対象の検証前に削除しない",
      );
    }
    const deleted = invoke(["delete-retired", "minio"]);
    assert.equal(deleted.result.status, 0, deleted.result.stderr);
    assert.deepEqual(
      deleted.calls.filter((c) => c.includes("DELETE")),
      [
        [
          "gh",
          "api",
          "--method",
          "DELETE",
          "/orgs/Sincromisor/packages/container/minio",
        ],
      ],
    );
    const failed = invoke(["publish"], { FAIL_BUILD: "1" });
    assert.equal(failed.result.status, 1);
    assert(
      !failed.calls.some((c) => c.includes("push") || c.includes("create")),
    );
    const bad = invoke(["push", "20260907t010203-aaaaaaaaaaaa"], {
      BAD_REV: "1",
    });
    assert.equal(bad.result.status, 1);
    assert(!bad.calls.some((c) => c.includes("push")));
    const privateImage = invoke(["publish"], { FAIL_ANON: "1" });
    assert.equal(privateImage.result.status, 1, "非公開なら公開完了としない");
    const published = invoke(["publish"]);
    assert.equal(published.result.status, 0, published.result.stderr);
    const writes = published.calls.filter(
      (c) => c.includes("push") || c.includes("create"),
    );
    assert.deepEqual(
      writes.map((c) => (c.includes("push") ? "push" : "latest")),
      ["push", "push", "latest", "latest"],
    );
    assert(!writes.some((c) => c.some((a) => a.includes("hashicorp"))));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
