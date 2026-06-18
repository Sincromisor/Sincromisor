#!/usr/bin/env node
/**
 * impl-evaluator 用の隔離 worktree を 1 コマンドで構築・破棄する。Node / Bun 両対応・依存ゼロ。
 * 従来エージェントが毎回手組みしていた手順（worktree add → 依存ディレクトリの symlink →
 * gitignore された設定ファイルのコピー）を決定論化し、漏れによる失敗・リトライを無くす。
 *
 *   node scripts/eval/setupWorktree.mjs add <commit-sha>                  # 構築（detach HEAD）。worktree パスを stdout 最終行に出力
 *   node scripts/eval/setupWorktree.mjs add <sha> --branch <name>         # 名前付きブランチ上に worktree を構築（実装フェーズ用）
 *   node scripts/eval/setupWorktree.mjs remove <worktree-path>            # 片付け（dirty なら拒否。安全網。ブランチは保持）
 *   node scripts/eval/setupWorktree.mjs remove <worktree-path> --discard  # dirty でも強制破棄（git worktree remove --force 相当）
 *
 * モード:
 *   - 既定（`--branch` 無し）: `git worktree add --detach <wt> <sha>`。評価フェーズ用。detach HEAD
 *     なのでコミットを載せるブランチを持たない（検証専用）。従来挙動を完全保持する。
 *   - `--branch <name>`: 実装フェーズ用。指定ブランチが未存在なら `git worktree add -b <name> <wt> <sha>`
 *     で `<sha>` を基点に作成し、既存ならそのブランチを checkout する。実装コミットはこのブランチに
 *     載る。`remove` は worktree のみ削除し**ブランチは保持する**（評価・再実装ループ・最終マージ用）。
 *
 * remove は対象 worktree が dirty（未追跡・未コミット変更あり）なら既定で削除を拒否し、保全
 * すべきパス（例: 評価成果物 `acceptance/`）を表示して非ゼロ終了する。`--discard` を明示した
 * ときのみ強制削除する。clean な worktree は従来どおり無印で削除できる。dirty 判定は対象
 * worktree の `git status --porcelain -uall`（gitignore は尊重。`.gate-cache` symlink 等の
 * gitignore 対象は検出しない）で行う。
 *
 * 対象は展開先 `package.json` の **`evalWorktree`** 設定を正本とする（無ければ既定値）:
 *
 *   {
 *       "evalWorktree": {
 *           "symlinks": ["node_modules", "frontend/node_modules"],  // メインツリーから symlink する
 *           "copies": [".env", "frontend/.env"]                      // メインツリーからコピーする
 *       }
 *   }
 *
 *   既定: { "symlinks": ["node_modules", ".gate-cache"], "copies": [".env"] }
 *   いずれもリポジトリルートからの相対パス。存在しないものは黙ってスキップされる。
 *
 * submodule を持つプロジェクトでは展開を本スクリプトに足してカスタマイズする
 * （未 push の gitlink はローカル submodule から `git clone --shared` + gitlink checkout で補える）。
 *
 * gate キャッシュはメインツリーの `.gate-cache` を worktree に symlink して共有する（既定 symlink に
 * 含む）。実装者が同一コミットで gate を通していれば（= メインツリーに `.gate-cache` 実体があれば）
 * 評価側の gate は即キャッシュヒットする。メインツリーに `.gate-cache` が無ければ symlink は張られず
 * （黙ってスキップ）、worktree はローカルに `.gate-cache` を新規作成する。
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const DEFAULT_CONFIG = { symlinks: ["node_modules", ".gate-cache"], copies: [".env"] };

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

/** 名前付きブランチが既にローカルに存在するか（`git worktree add` の -b 要否を決める）。 @param {string} name */
function branchExists(name) {
    try {
        execFileSync("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`], {
            stdio: "pipe",
        });
        return true;
    } catch {
        return false;
    }
}

/** @param {string} sha @param {string} [branch] */
function add(sha, branch) {
    const root = git("rev-parse", "--show-toplevel");
    let resolved = "";
    try {
        resolved = git("rev-parse", "--verify", `${sha}^{commit}`);
    } catch {
        fail(`コミットを解決できません: ${sha}`);
    }
    const short = resolved.slice(0, 12);

    const wt = mkdtempSync(join(tmpdir(), `eval-${short}-`));
    if (branch) {
        // 実装フェーズ: 名前付きブランチ上に worktree を作る。
        if (branchExists(branch)) {
            // 既存ブランチを checkout（再実装ループで同一ブランチを別 worktree に再展開する経路）。
            execFileSync("git", ["worktree", "add", wt, branch], { stdio: "pipe" });
            console.log(`branch: ${branch}（既存を checkout）`);
        } else {
            execFileSync("git", ["worktree", "add", "-b", branch, wt, resolved], { stdio: "pipe" });
            console.log(`branch: ${branch}（${short} を基点に新規作成）`);
        }
    } else {
        // 評価フェーズ: detach HEAD（従来挙動）。
        execFileSync("git", ["worktree", "add", "--detach", wt, resolved], { stdio: "pipe" });
    }

    const config = loadConfig(root);
    for (const rel of config.symlinks) {
        const src = join(root, rel);
        const dst = join(wt, rel);
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

    console.log(
        branch
            ? `\n構築完了。作業後は eval:worktree remove ${wt} で worktree を片付けること（ブランチ ${branch} は保持される）。`
            : `\n構築完了。評価後は eval:worktree remove ${wt} で片付けること。`,
    );
    // オーケストレーター / エージェントがパスを機械的に拾えるよう最終行はパスのみ
    console.log(wt);
}

/**
 * worktree の `git status --porcelain` 出力（未追跡含む）と `--discard` 指定から、削除を拒否
 * すべきか判定する純粋関数。dirty かつ `--discard` 無しなら拒否し、保全候補パスを含む理由を返す。
 * gitignore は尊重した porcelain（`-uall` で未追跡は見るが `--ignored` は付けない）を前提とする。
 * @param {string} porcelain @param {boolean} discard
 * @returns {{ refuse: boolean, reason?: string }}
 */
export function decideRemoval(porcelain, discard) {
    const entries = porcelain
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);
    if (entries.length === 0 || discard) return { refuse: false };
    // porcelain の各行は `XY <path>`。保全候補としてパス部分を抽出する。
    const paths = entries.map((l) => l.slice(3));
    const reason =
        `worktree に未コミット/未追跡の変更があります（${entries.length} 件）。評価成果物の` +
        `喪失を防ぐため削除を拒否しました。main checkout の <task-dir> へ保全してから再実行するか、` +
        `破棄してよい場合は --discard を付けてください。\n保全すべきパス:\n` +
        paths.map((p) => `  - ${p}`).join("\n");
    return { refuse: true, reason };
}

/** @param {string} wtPath @param {boolean} discard */
function remove(wtPath, discard) {
    if (!existsSync(wtPath)) fail(`worktree が見つかりません: ${wtPath}`);
    // dirty 判定: 対象 worktree の未追跡含む変更を gitignore 尊重で取得（`.gate-cache` symlink 等は無視）。
    const porcelain = execFileSync("git", ["-C", wtPath, "status", "--porcelain", "-uall"], {
        encoding: "utf8",
    }).trimEnd();
    const decision = decideRemoval(porcelain, discard);
    if (decision.refuse) fail(decision.reason ?? `worktree が dirty です: ${wtPath}`);
    execFileSync("git", ["worktree", "remove", "--force", wtPath], { stdio: "inherit" });
    console.log(`削除: ${wtPath}`);
}

/**
 * CLI 引数（`process.argv.slice(2)` 相当）を解釈する純粋関数。フラグ（`--discard` /
 * `--branch <name>`）と位置引数（cmd / target）を分離する。`--branch` は次の非フラグ語を値に取る。
 * 不正・不足時は `{ cmd: "usage" }` を返す（呼び出し側が usage を表示する）。
 * @param {string[]} args
 * @returns {{ cmd: "add", target: string, branch?: string }
 *   | { cmd: "remove", target: string, discard: boolean }
 *   | { cmd: "usage" }}
 */
export function parseArgs(args) {
    const discard = args.includes("--discard");
    let branch;
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--branch") {
            branch = args[i + 1];
            i++; // 値を消費
            continue;
        }
        if (a.startsWith("--")) continue;
        positional.push(a);
    }
    const [cmd, target] = positional;
    if (cmd === "add" && target) {
        if (args.includes("--branch") && !branch) return { cmd: "usage" };
        return branch ? { cmd: "add", target, branch } : { cmd: "add", target };
    }
    if (cmd === "remove" && target) {
        return { cmd: "remove", target, discard };
    }
    return { cmd: "usage" };
}

const USAGE =
    "使い方: setupWorktree.mjs add <commit-sha> [--branch <name>] | remove <worktree-path> [--discard]";

function main() {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.cmd === "add") {
        add(parsed.target, parsed.branch);
    } else if (parsed.cmd === "remove") {
        remove(parsed.target, parsed.discard);
    } else {
        fail(USAGE);
    }
}

// CLI として直接実行されたときのみ main を走らせる（テストからの import 時は実行しない）。
if (import.meta.url === `file://${process.argv[1]}`) {
    main();
}
