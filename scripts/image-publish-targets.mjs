/** Composeの公開入力を検証し、ビルド用絶対パスと配布タグを分離する。 */
import { realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

// 公開先と削除保護で同じ名前空間を使う。
export const registry = "ghcr.io/sincromisor/";

/** 正規化後とリンク解決後を検査し、展開元の外を参照する入力は拒否する。 */
function sourcePath(source, path) {
  const root = realpathSync(source);
  const resolved = resolve(path);
  for (const candidate of [resolved, realpathSync(resolved)]) {
    const child = relative(root, candidate);
    if (child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child))
      throw new Error(`展開元の外を参照するビルド入力: ${path}`);
  }
  return resolved;
}

/** Composeの1サービスを、許可したローカルビルドとリポジトリ・タグへ変換する。 */
function target(source, name, service) {
  const ref =
    typeof service.image === "string" && service.image.startsWith(registry)
      ? service.image
          .slice(registry.length)
          .match(/^([a-z0-9-]+)(?::([\w][\w.-]{0,127}))?$/)
      : null;
  if (!ref) throw new Error(`公開先が想定外: ${service.image}`);
  const build = service.build;
  // 新しいビルド機能を黙って落とすと別のイメージになるため、対応済みの項目だけを許可する。
  if (
    typeof build !== "object" ||
    Array.isArray(build) ||
    Object.keys(build).some(
      (key) => !["context", "dockerfile", "args"].includes(key),
    )
  )
    throw new Error(`未対応のビルド構成: ${name}`);
  const context = sourcePath(source, resolve(source, build.context ?? "."));
  // Dockerfileはコンテキスト基準。AgentServerのようにコンテキスト外でも展開元内なら許可する。
  const dockerfile = sourcePath(
    source,
    resolve(context, build.dockerfile ?? "Dockerfile"),
  );
  if (!statSync(context).isDirectory() || !statSync(dockerfile).isFile())
    throw new Error(`ビルド入力の種類が不正: ${name}`);
  return {
    name,
    image: registry + ref[1],
    tag: ref[2] ?? "latest",
    build: { ...build, context, dockerfile },
  };
}

/**
 * コミットの展開先とCLIの実行関数を受け取り、全プロファイルの自作イメージを返す。
 * Composeを読み取り実行し、許可先・パス・ビルド機能の検証に失敗したら操作前に例外を返す。
 * 外部配布イメージは対象に含めず、ビルド・公開は呼び出し元へ委ねる。
 */
export function targets(source, run) {
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
        "*",
        "config",
        "--format",
        "json",
      ],
      { env },
    ),
  );
  const result = Object.entries(config.services)
    .filter(([, service]) => service.build)
    .map(([name, service]) => target(source, name, service));
  if (!result.length) throw new Error("公開対象がありません");
  return result;
}
