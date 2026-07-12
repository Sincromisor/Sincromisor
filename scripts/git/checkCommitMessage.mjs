import { execFileSync } from "node:child_process";

/**
 * Git が展開しないエスケープ改行をコミットメッセージから検出する。
 *
 * `git commit -m "...\\n..."` を生成しやすい CLI エージェントの誤用を、履歴へ追加した直後に
 * 検出するための境界チェックである。パスやコマンド例に現れる単独の `\\n` まで拒否しないよう、
 * 空行または Why/What/Verify/Risk/Refs として使われたものだけを対象にする。
 */
export function findEscapedNewline(message) {
  const match = message.match(
    /\\n(?:\\n|(?=Why:|What:|Verify:|Risk:|Refs:|- ))/,
  );
  return match?.[0] ?? null;
}

if (import.meta.main) {
  const revision = process.argv[2] ?? "HEAD";
  const message = execFileSync("git", ["log", "-1", "--format=%B", revision], {
    encoding: "utf8",
  });
  if (findEscapedNewline(message)) {
    console.error(
      `${revision} のコミットメッセージに文字列 \\n が含まれています。` +
        "複数の -m 引数または実改行を含む message file (-F) を使用してください。",
    );
    process.exitCode = 1;
  }
}
