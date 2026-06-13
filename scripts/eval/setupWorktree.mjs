#!/usr/bin/env node
/**
 * impl-evaluator 用の隔離 worktree を 1 コマンドで構築・破棄する。Node / Bun 両対応・依存ゼロ。
 * 従来エージェントが毎回手組みしていた手順（worktree add → 依存ディレクトリの symlink →
 * gitignore された設定ファイルのコピー）を決定論化し、漏れによる失敗・リトライを無くす。
 *
 *   node scripts/eval/setupWorktree.mjs add <commit-sha>        # 構築。worktree パスを stdout 最終行に出力
 *   node scripts/eval/setupWorktree.mjs remove <worktree-path>  # 片付け（git worktree remove --force）
 *
 * 対象は展開先 `package.json` の **`evalWorktree`** 設定を正本とする（無ければ既定値）:
 *
 *   {
 *       "evalWorktree": {
 *           "symlinks": [".gate-cache", "node_modules", "frontend/node_modules"], // メインツリーから symlink する
 *           "copies": [".env", "frontend/.env"]                      // メインツリーからコピーする
 *       }
 *   }
 *
 *   既定: { "symlinks": [".gate-cache", "node_modules"], "copies": [".env"] }
 *   いずれもリポジトリルートからの相対パス。存在しないものは黙ってスキップされる。
 *
 * submodule を持つプロジェクトでは展開を本スクリプトに足してカスタマイズする
 * （未 push の gitlink はローカル submodule から `git clone --shared` + gitlink checkout で補える）。
 *
 * gate キャッシュは既定の `.gate-cache/` を symlink して worktree 間共有するため、実装者が
 * 同一コミットで gate を通していれば評価側の gate は即キャッシュヒットする。
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_CONFIG = { symlinks: [".gate-cache", "node_modules"], copies: [".env"] };

function fail(msg) {
    console.error(`エラー: ${msg}`);
    process.exit(1);
}

/** @param {string[]} args @returns {string} */
function git(...args) {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function loadConfig(root) {
    try {
        const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
        const c = pkg.evalWorktree;
        if (!c || typeof c !== "object") return DEFAULT_CONFIG;
        return {
            symlinks: Array.isArray(c.symlinks) ? c.symlinks.map(String) : DEFAULT_CONFIG.symlinks,
            copies: Array.isArray(c.copies) ? c.copies.map(String) : DEFAULT_CONFIG.copies,
        };
    } catch {
        return DEFAULT_CONFIG;
    }
}

function add(sha) {
    const root = git("rev-parse", "--show-toplevel");
    let resolved = "";
    try {
        resolved = git("rev-parse", "--verify", `${sha}^{commit}`);
    } catch {
        fail(`コミットを解決できません: ${sha}`);
    }
    const short = resolved.slice(0, 12);

    const wt = mkdtempSync(join(tmpdir(), `eval-${short}-`));
    execFileSync("git", ["worktree", "add", "--detach", wt, resolved], { stdio: "pipe" });

    const config = loadConfig(root);
    for (const rel of config.symlinks) {
        const src = join(root, rel);
        const dst = join(wt, rel);
        if (rel === ".gate-cache" && !existsSync(src)) {
            mkdirSync(src, { recursive: true });
        }
        if (existsSync(src) && existsSync(dirname(dst)) && !existsSync(dst)) {
            symlinkSync(src, dst, "dir");
            console.log(`symlink: ${rel}`);
        }
    }
    for (const rel of config.copies) {
        const src = join(root, rel);
        const dst = join(wt, rel);
        if (existsSync(src) && existsSync(dirname(dst))) {
            copyFileSync(src, dst);
            console.log(`copy: ${rel}`);
        }
    }

    console.log(`\n構築完了。評価後は eval:worktree remove ${wt} で片付けること。`);
    // オーケストレーター / エージェントがパスを機械的に拾えるよう最終行はパスのみ
    console.log(wt);
}

function remove(wtPath) {
    if (!existsSync(wtPath)) fail(`worktree が見つかりません: ${wtPath}`);
    execFileSync("git", ["worktree", "remove", "--force", wtPath], { stdio: "inherit" });
    console.log(`削除: ${wtPath}`);
}

function main() {
    const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
    const [cmd, target] = args;
    if (cmd === "add" && target) {
        add(target);
    } else if (cmd === "remove" && target) {
        remove(target);
    } else {
        fail("使い方: setupWorktree.mjs add <commit-sha> | remove <worktree-path>");
    }
}

main();
