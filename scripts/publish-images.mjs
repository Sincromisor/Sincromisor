#!/usr/bin/env node
/**
 * 現行Composeの自作イメージをGHCRへ公開する。Node.js、Git、Docker、ghを使う。
 * コミット済みソースだけを一時展開し、運用中の.env、辞書、キャッシュを混入させない。
 * 使い方: node scripts/publish-images.mjs plan|build|publish|push|inventory|delete-retired [タグまたは名前...]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const registry = "ghcr.io/sincromisor/";
const repository = "Sincromisor/Sincromisor";
const [command = "plan", ...names] = process.argv.slice(2);

/** シェルを介さず実行し、失敗した段階で停止する。認証情報は出力しない。 */
function run(program, args, options = {}) {
  return execFileSync(program, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
}

/** ghのページ送りで全件取得する。失敗を空の一覧として扱わない。 */
function packages() {
  return JSON.parse(
    run("gh", [
      "api",
      "--paginate",
      "--slurp",
      "/orgs/Sincromisor/packages?package_type=container&per_page=100",
    ]),
  ).flat();
}

/** 展開先のComposeから自作イメージだけを選ぶ。他社の配布物は再公開しない。 */
function targets(source) {
  // 開発端末の環境変数で公開構成が変わらないよう、サンプル設定だけを採用する。
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith("SINCRO_") &&
        !key.startsWith("COMPOSE_") &&
        key !== "DOCKER_DEFAULT_PLATFORM",
    ),
  );
  const config = JSON.parse(
    run(
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
        "full",
        "config",
        "--format",
        "json",
      ],
      { env },
    ),
  );
  const result = Object.entries(config.services)
    .filter(([, service]) => service.build)
    .map(([name, service]) => {
      if (
        typeof service.image !== "string" ||
        !service.image.startsWith(registry) ||
        !/^[a-z0-9-]+(?::latest)?$/.test(service.image.slice(registry.length))
      ) {
        throw new Error(`公開先が想定外: ${service.image}`);
      }
      // Composeに新しいビルド機能が加わったら、黙って省略せず対応を判断する。
      if (
        Object.keys(service.build).some(
          (key) => !["context", "dockerfile", "args"].includes(key),
        ) ||
        service.build.context !== source
      )
        throw new Error(`未対応のビルド構成: ${name}`);
      return {
        name,
        image: service.image.replace(/:latest$/, ""),
        build: service.build,
      };
    });
  if (!result.length) throw new Error("公開対象がありません");
  return result;
}

/** 全イメージのビルドを完了してから呼び出し元へ戻す。latestはまだ変更しない。 */
function buildImages(images, source, release) {
  for (const { image, build } of images) {
    const args = Object.entries(build.args ?? {}).flatMap(([key, value]) => [
      "--build-arg",
      `${key}=${value}`,
    ]);
    console.log(`ビルド: ${image}:${release.tag}`);
    run(
      "docker",
      [
        "buildx",
        "build",
        "--pull",
        "--load",
        "--platform",
        "linux/amd64",
        "--label",
        `org.opencontainers.image.source=https://github.com/${repository}`,
        "--label",
        `org.opencontainers.image.revision=${release.sha}`,
        "--label",
        `org.opencontainers.image.created=${release.created}`,
        "-f",
        join(source, build.dockerfile),
        "-t",
        `${image}:${release.tag}`,
        ...args,
        source,
      ],
      { stdio: "inherit" },
    );
  }
}

/** 全履歴タグの送信成功後にlatestを更新し、配布先のダイジェスト一致を確認する。 */
function publishImages(images, tag) {
  // buildで作った全対象が揃うまで送信しない。別コミットや別アーキテクチャの混在も拒否する。
  const sha = run("git", ["rev-parse", "HEAD"]).trim();
  for (const { image } of images) {
    const [local] = JSON.parse(
      run("docker", ["image", "inspect", `${image}:${tag}`]),
    );
    if (
      local.Config.Labels?.["org.opencontainers.image.revision"] !== sha ||
      local.Os !== "linux" ||
      local.Architecture !== "amd64"
    )
      throw new Error(`公開元が不一致: ${image}:${tag}`);
  }
  for (const { image } of images)
    run("docker", ["push", `${image}:${tag}`], { stdio: "inherit" });
  // GHCRには複数イメージを一括切替する機能がない。失敗時は同じ履歴タグから再実行する。
  for (const { image } of images) {
    run(
      "docker",
      [
        "buildx",
        "imagetools",
        "create",
        "--prefer-index=false",
        "-t",
        `${image}:latest`,
        `${image}:${tag}`,
      ],
      { stdio: "inherit" },
    );
    const digest = (ref) =>
      run("docker", [
        "buildx",
        "imagetools",
        "inspect",
        ref,
        "--format",
        "{{json .Manifest.Digest}}",
      ]);
    if (digest(`${image}:${tag}`) !== digest(`${image}:latest`))
      throw new Error(`公開先の不一致: ${image}`);
    console.log(
      `公開確認: ${image}:latest ${digest(`${image}:latest`).trim()}`,
    );
  }
  // 保存済み認証を使わない取得で、匿名利用者にも公開されていることを確認する。
  const anonymous = mkdtempSync(join(tmpdir(), "sincromisor-anonymous-"));
  try {
    for (const { image } of images) {
      run("docker", [
        "--config",
        anonymous,
        "manifest",
        "inspect",
        `${image}:latest`,
      ]);
      console.log(`匿名取得確認: ${image}:latest`);
    }
  } finally {
    rmSync(anonymous, { recursive: true, force: true });
  }
}

/** 現行対象を保護し、リポジトリに紐付く明示指定の旧パッケージだけを削除する。 */
function deleteRetired(images, remote) {
  if (!names.length)
    throw new Error("inventoryで確認した旧パッケージ名を指定してください");
  const current = new Set(
    images.map(({ image }) => image.slice(registry.length)),
  );
  // 全対象の検証を先に終え、後半の入力ミスで前半だけ削除される事態を避ける。
  const selected = [...new Set(names)].map((name) => {
    const item = remote.find((entry) => entry.name === name);
    if (
      current.has(name) ||
      !item ||
      item.repository?.full_name !== repository
    ) {
      throw new Error(
        `現行・所属不明・別リポジトリのパッケージは削除できません: ${name}`,
      );
    }
    return item;
  });
  for (const item of selected) {
    console.log(`旧構成を削除: ${registry}${item.name}`);
    run("gh", [
      "api",
      "--method",
      "DELETE",
      `/orgs/Sincromisor/packages/container/${encodeURIComponent(item.name)}`,
    ]);
  }
}

/** 指定操作を実行し、一時展開したソースを成功・失敗の双方で片付ける。 */
function main() {
  if (
    ![
      "plan",
      "build",
      "publish",
      "push",
      "inventory",
      "delete-retired",
    ].includes(command) ||
    (!["delete-retired", "push"].includes(command) && names.length) ||
    (command === "push" &&
      (names.length !== 1 || !/^\d{8}t\d{6}-[a-f0-9]{12}$/.test(names[0])))
  ) {
    throw new Error(
      "使い方: node scripts/publish-images.mjs plan|build|publish|push|inventory|delete-retired [タグまたは旧パッケージ名...]",
    );
  }
  const sha = run("git", ["rev-parse", "HEAD"]).trim();
  const created = new Date().toISOString();
  const tag =
    command === "push"
      ? names[0]
      : `${created.replace(/[-:]/g, "").slice(0, 15).toLowerCase()}-${sha.slice(0, 12)}`;
  const temp = mkdtempSync(join(tmpdir(), "sincromisor-publish-"));
  const source = join(temp, "source");
  try {
    run("git", [
      "archive",
      "--format=tar",
      `--output=${join(temp, "source.tar")}`,
      sha,
    ]);
    mkdirSync(source);
    run("tar", ["-xf", join(temp, "source.tar"), "-C", source]);
    const images = targets(source);
    console.log(
      `ソース: ${sha}\n履歴タグ: ${tag}\n${images.map(({ image }) => image).join("\n")}`,
    );
    if (command === "inventory" || command === "delete-retired") {
      const remote = packages();
      if (command === "delete-retired") deleteRetired(images, remote);
      else
        console.log(
          JSON.stringify(
            remote.map(({ name, visibility, repository: repo }) => ({
              name,
              visibility,
              repository: repo?.full_name ?? null,
              current: images.some(({ image }) => image === registry + name),
            })),
            null,
            2,
          ),
        );
    }
    if (command === "build" || command === "publish") {
      buildImages(images, source, { sha, tag, created });
      if (command === "publish") publishImages(images, tag);
    }
    if (command === "push") publishImages(images, tag);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
