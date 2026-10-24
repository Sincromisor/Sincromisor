/** CLI境界で公開順序・入力検証を確認し、実Composeとの差異も読み取りで検出する。 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const script = resolve("scripts/publish-images.mjs");
const historyTag = "20261018t010203-aaaaaaaaaaaa";
const expectedRefs = [
  "sincro-rtc:latest",
  "sincro-frontend:latest",
  "vector:0.60.0",
  "victoria-logs:v1.53.0",
  "agent-server:latest",
].map((ref) => `ghcr.io/sincromisor/${ref}`);

/** テストごとに外部コマンドと呼出し記録を隔離し、終了時に一時ファイルを回収する。 */
function mockCli(t) {
  const dir = mkdtempSync(join(tmpdir(), "sincromisor-publish-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const tool of ["git", "docker", "gh", "tar"])
    copyFileSync(
      resolve("scripts/tests/fixtures/publish-command.cjs"),
      join(dir, tool),
    );
  const callsFile = join(dir, "calls");
  return (args, mode = "") => {
    writeFileSync(callsFile, "");
    const result = spawnSync(process.execPath, [script, ...args], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CALLS: callsFile,
        MODE: mode,
        NODE_TEST_CONTEXT: undefined,
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
}

const writes = (calls) =>
  calls.filter(
    (c) => c.includes("push") || c.includes("create") || c.includes("DELETE"),
  );

test("サブディレクトリとDockerfile省略・相対指定を解決して全件ビルド後に指定タグを更新する", (t) => {
  const { result, calls } = mockCli(t)(["publish"]);
  assert.equal(result.status, 0, result.stderr);
  const compose = calls.find((c) => c[1] === "compose");
  assert.equal(compose[compose.indexOf("--profile") + 1], "*");
  const source = compose[compose.indexOf("--project-directory") + 1];
  const builds = calls.filter((c) => c[1] === "buildx" && c[2] === "build");
  assert.equal(builds.length, 5);
  const vector = builds.find((c) => c.some((a) => a.includes("vector:")));
  assert.equal(vector.at(-1), join(source, "Docker/logging/vector"));
  assert.equal(
    vector[vector.indexOf("-f") + 1],
    join(source, "Docker/logging/vector/Dockerfile"),
  );
  const agent = builds.find((c) => c.some((a) => a.includes("agent-server:")));
  assert.equal(agent.at(-1), join(source, "sincromisor-server/agent-server"));
  assert.equal(
    agent[agent.indexOf("-f") + 1],
    join(source, "Docker/agent-server/Dockerfile"),
  );
  assert(builds[0].includes("SINCRO_USER_ID=sincromisor"));
  assert(
    calls.indexOf(builds.at(-1)) < calls.findIndex((c) => c[1] === "push"),
  );
  assert.deepEqual(
    writes(calls).map((c) => (c[1] === "push" ? "push" : "tag")),
    [...Array(5).fill("push"), ...Array(5).fill("tag")],
  );
  assert.deepEqual(
    calls.filter((c) => c[3] === "create").map((c) => c[c.indexOf("-t") + 1]),
    expectedRefs,
  );
  assert.deepEqual(
    calls.filter((c) => c[1] === "--config").map((c) => c.at(-1)),
    expectedRefs,
  );
  for (const ref of expectedRefs)
    assert(calls.some((c) => c[3] === "inspect" && c[4] === ref));
  assert(!writes(calls).some((c) => c.some((a) => a.includes("hashicorp"))));
  assert(
    !calls.some(
      (c) =>
        c.includes("ghcr.io/sincromisor/vector:latest") ||
        c.includes("ghcr.io/sincromisor/victoria-logs:latest"),
    ),
  );
});

test("公開失敗時に停止し、全件送信前には配布タグを変えない", (t) => {
  const invoke = mockCli(t);
  for (const mode of ["fail-build", "bad-revision", "bad-arch"]) {
    const { result, calls } = invoke(["publish"], mode);
    assert.equal(result.status, 1, mode);
    assert.deepEqual(writes(calls), [], mode);
  }
  const failedPush = invoke(["push", historyTag], "fail-push");
  assert.equal(failedPush.result.status, 1);
  assert(!failedPush.calls.some((c) => c.includes("create")));
  for (const mode of ["fail-tag", "bad-digest", "fail-anon"]) {
    const { result } = invoke(["publish"], mode);
    assert.equal(result.status, 1, mode);
  }
  const resumed = invoke(["push", historyTag]);
  assert.equal(resumed.result.status, 0, resumed.result.stderr);
  assert(
    resumed.calls
      .filter((c) => c[1] === "push")
      .every((c) => c[2].endsWith(`:${historyTag}`)),
  );
  assert(!resumed.calls.some((c) => c[2] === "build"));
});

test("展開元外・リンク逸脱・想定外公開先・未対応ビルド機能を操作前に拒否する", (t) => {
  const invoke = mockCli(t);
  for (const mode of [
    "outside-context",
    "prefix-context",
    "outside-dockerfile",
    "absolute-dockerfile",
    "link-context",
    "link-dockerfile",
    "missing-dockerfile",
    "directory-dockerfile",
    "remote-context",
    "extra-feature",
    "inline-dockerfile",
    "foreign-registry",
    "foreign-namespace",
    "digest-image",
    "invalid-tag",
    "empty",
  ]) {
    const { result, calls } = invoke(["publish"], mode);
    assert.equal(result.status, 1, mode);
    assert(!calls.some((c) => c[2] === "build"), mode);
    assert.deepEqual(writes(calls), [], mode);
  }
  const inside = invoke(["plan"], "inside-link");
  assert.equal(inside.result.status, 0, inside.result.stderr);
});

test("固定タグを含む現行パッケージと他リポジトリの削除を保護する", (t) => {
  const invoke = mockCli(t);
  for (const name of [
    "sincro-rtc",
    "vector",
    "victoria-logs",
    "agent-server",
    "other",
    "missing",
  ]) {
    const { result, calls } = invoke(["delete-retired", "retired-image", name]);
    assert.equal(result.status, 1, name);
    assert.deepEqual(writes(calls), [], "全対象の検証前に削除しない");
  }
  const deleted = invoke(["delete-retired", "retired-image"]);
  assert.equal(deleted.result.status, 0, deleted.result.stderr);
  assert.deepEqual(writes(deleted.calls), [
    [
      "gh",
      "api",
      "--method",
      "DELETE",
      "/orgs/Sincromisor/packages/container/retired-image",
    ],
  ]);
  const inventory = invoke(["inventory"]);
  assert.equal(inventory.result.status, 0, inventory.result.stderr);
  assert.match(
    inventory.result.stdout,
    /"name": "vector",[\s\S]*?"current": true/,
  );
});

test("コミット済み実Composeの全プロファイルから得た対象とplanが一致する", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "sincromisor-compose-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, "source");
  mkdirSync(source);
  execFileSync("git", [
    "archive",
    "--format=tar",
    `--output=${join(dir, "source.tar")}`,
    "HEAD",
  ]);
  execFileSync("tar", ["-xf", join(dir, "source.tar"), "-C", source]);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith("SINCRO_") &&
        !key.startsWith("COMPOSE_") &&
        key !== "DOCKER_DEFAULT_PLATFORM",
    ),
  );
  // 実設定を表示せず、コミット済みサンプルからbuildとimageだけを比較する。
  const config = JSON.parse(
    execFileSync(
      "docker",
      [
        "compose",
        "--project-directory",
        source,
        "--env-file",
        join(source, "examples/compose.env"),
        "-f",
        join(source, "compose.yml"),
        "--profile",
        "*",
        "config",
        "--format",
        "json",
      ],
      { env, encoding: "utf8" },
    ),
  );
  const expected = Object.entries(config.services)
    .filter(([, service]) => service.build)
    .map(
      ([name, service]) =>
        `${name}: ${service.image.includes(":") ? service.image : `${service.image}:latest`}`,
    )
    .sort();
  const result = spawnSync(process.execPath, [script, "plan"], {
    env: {
      ...env,
      SINCRO_REGISTRY_NAME: "invalid.example/private",
      COMPOSE_PROFILES: "rtc",
      NODE_TEST_CONTEXT: undefined,
    },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const actual = result.stdout.trim().split("\n").slice(2).sort();
  assert.deepEqual(actual, expected);
  for (const name of [
    "agent-server",
    "log-observer",
    "vector",
    "victoria-logs",
  ])
    assert(actual.some((line) => line.startsWith(`${name}: `)));
  assert(!actual.some((line) => line.startsWith("llama-server:")));
});
