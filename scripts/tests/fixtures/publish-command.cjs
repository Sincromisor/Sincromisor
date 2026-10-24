#!/usr/bin/env -S node --
/** 公開CLIの外部コマンドを模擬する。Docker/GitHubへ接続しない。 */
const fs = require("node:fs");
const path = require("node:path");
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
const mode = process.env.MODE;
const sha = "a".repeat(40);
fs.appendFileSync(process.env.CALLS, JSON.stringify([tool, ...args]) + "\n");
if (tool === "git" && args[0] === "rev-parse") console.log(sha);
// git archiveの展開結果を再現し、パス検査が実際のファイルに対して動くようにする。
if (tool === "tar") {
  const source = args[args.indexOf("-C") + 1];
  for (const file of [
    "Docker/rtc/Dockerfile",
    "Docker/frontend/Dockerfile",
    "Docker/agent-server/Dockerfile",
    "Docker/logging/vector/Dockerfile",
    "Docker/logging/Dockerfile",
    "sincromisor-server/agent-server/package.json",
  ]) {
    const full = path.join(source, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, "fixture");
  }
  fs.writeFileSync(
    path.join(path.dirname(source), "outside.Dockerfile"),
    "outside",
  );
  fs.symlinkSync(path.dirname(source), path.join(source, "outside-link"));
  fs.symlinkSync("../outside.Dockerfile", path.join(source, "dockerfile-link"));
  fs.symlinkSync("Docker/rtc/Dockerfile", path.join(source, "inside-link"));
}
if (tool === "docker" && args[0] === "compose") {
  const source = args[args.indexOf("--project-directory") + 1];
  const services = {
    rtc: {
      image: "ghcr.io/sincromisor/sincro-rtc:latest",
      build: {
        context: source,
        dockerfile: "Docker/rtc/Dockerfile",
        args: { SINCRO_USER_ID: "sincromisor" },
      },
    },
    frontend: {
      image: "ghcr.io/sincromisor/sincro-frontend",
      build: { context: source, dockerfile: "Docker/frontend/Dockerfile" },
    },
    vector: {
      image: "ghcr.io/sincromisor/vector:0.60.0",
      build: { context: path.join(source, "Docker/logging/vector") },
    },
    logs: {
      image: "ghcr.io/sincromisor/victoria-logs:v1.53.0",
      build: { context: path.join(source, "Docker/logging") },
    },
    consul: { image: "hashicorp/consul:latest" },
  };
  if (args.includes("*"))
    services.agent = {
      image: "ghcr.io/sincromisor/agent-server:latest",
      build: {
        context: path.join(source, "sincromisor-server/agent-server"),
        dockerfile: "../../Docker/agent-server/Dockerfile",
      },
    };
  const build = services.rtc.build;
  if (mode === "outside-context") build.context = path.dirname(source);
  if (mode === "prefix-context") build.context = source + "-other";
  if (mode === "outside-dockerfile") build.dockerfile = "../outside.Dockerfile";
  if (mode === "absolute-dockerfile")
    build.dockerfile = path.join(path.dirname(source), "outside.Dockerfile");
  if (mode === "link-context")
    build.context = path.join(source, "outside-link");
  if (mode === "link-dockerfile") build.dockerfile = "dockerfile-link";
  if (mode === "inside-link") build.dockerfile = "inside-link";
  if (mode === "missing-dockerfile") build.dockerfile = "missing";
  if (mode === "directory-dockerfile") build.dockerfile = "Docker";
  if (mode === "remote-context")
    build.context = "https://example.invalid/source.git";
  if (mode === "extra-feature") build.additional_contexts = { outside: "/tmp" };
  if (mode === "inline-dockerfile") build.dockerfile_inline = "FROM scratch";
  if (mode === "foreign-registry")
    services.rtc.image = "ghcr.io/other/rtc:latest";
  if (mode === "foreign-namespace")
    services.rtc.image = "ghcr.io/sincromisor/other/rtc:latest";
  if (mode === "digest-image")
    services.rtc.image = "ghcr.io/sincromisor/rtc@sha256:abc";
  if (mode === "invalid-tag")
    services.rtc.image = "ghcr.io/sincromisor/rtc:-bad";
  console.log(JSON.stringify({ services: mode === "empty" ? {} : services }));
}
if (
  tool === "docker" &&
  args[1] === "build" &&
  mode === "fail-build" &&
  args.some((a) => a.includes("vector:"))
)
  process.exit(1);
if (
  tool === "docker" &&
  args[0] === "push" &&
  mode === "fail-push" &&
  args[1].includes("vector:")
)
  process.exit(1);
if (tool === "docker" && args[2] === "create" && mode === "fail-tag")
  process.exit(1);
if (tool === "docker" && args[0] === "--config" && mode === "fail-anon")
  process.exit(1);
if (tool === "docker" && args[0] === "image")
  console.log(
    JSON.stringify([
      {
        Os: "linux",
        Architecture: mode === "bad-arch" ? "arm64" : "amd64",
        Config: {
          Labels: {
            "org.opencontainers.image.revision":
              mode === "bad-revision" ? "b".repeat(40) : sha,
          },
        },
      },
    ]),
  );
if (tool === "docker" && args[2] === "inspect")
  console.log(
    JSON.stringify(
      mode === "bad-digest" && args[3].endsWith(":0.60.0")
        ? "sha256:wrong"
        : "sha256:abc",
    ),
  );
if (tool === "gh" && !args.includes("DELETE"))
  console.log(
    JSON.stringify([
      [
        ...[
          "minio",
          "sincro-rtc",
          "sincro-frontend",
          "vector",
          "victoria-logs",
          "agent-server",
        ].map((name) => ({
          name,
          visibility: "public",
          repository: { full_name: "Sincromisor/Sincromisor" },
        })),
        { name: "other", repository: { full_name: "Sincromisor/Other" } },
      ],
    ]),
  );
