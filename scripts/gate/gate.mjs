#!/usr/bin/env node
/**
 * コミット前ゲートの「コンテンツアドレス型」実行ラッパー（Node / Bun 両対応・依存ゼロ）。
 *
 * 背景:
 *   `/run-task` パイプラインでは、実装者の完了ゲートと評価者の独立検証が **同一コミットの
 *   HEAD** に対して lint / 型・ビルド / テストを二重実行する。決定的（外部依存 mock 前提）な
 *   ゲートを毎回ゼロから回すのは無駄なので、結果をテキストログに記録し再利用する。
 *
 * ステップ定義:
 *   展開先プロジェクトの `package.json` の `gateSteps` を正本とする（導入時に定義する）。
 *   **差分を生まない検証版コマンド**（`--check` / `--max-warnings=0` 等）を登録すること。
 *   `--write` / `--fix` 系を入れると実行のたびにツリーが変わり、キャッシュも独立検証も壊れる。
 *
 *     "gateSteps": [
 *       { "id": "lint",  "cmd": "npm run lint -- --max-warnings=0", "label": "lint/format 検証" },
 *       { "id": "build", "cmd": "npm run build",                    "label": "型チェック / ビルド" },
 *       { "id": "test",  "cmd": "npm test",                         "label": "テスト" }
 *     ]
 *
 * キャッシュキー = sha256(step + command + HEAD SHA + ロックファイルハッシュ + 作業ツリーハッシュ)。
 *   - 作業ツリーがクリーン（`git status --porcelain` が空 かつ 未追跡ファイル無し）のときキーは
 *     **コミット由来のみ** になり、worktree をまたいで共有される（評価者の隔離 worktree は同一
 *     コミットで即ヒット）。
 *   - dirty ツリーは差分内容までキーに含めるため、**完全に同一の状態** が再現したときだけ再利用
 *     される（= 編集のたびに実質フレッシュ実行。誤ヒットなし）。
 *   - 作業ツリーハッシュには tracked 変更（`git diff HEAD`）と `git status --porcelain` に加え、
 *     **未追跡（非 ignore）ファイルの内容ハッシュ**（`git ls-files --others --exclude-standard` で
 *     列挙）を含める。`status --porcelain` は未追跡ディレクトリを畳む / 内容を持たないため、未追跡
 *     ファイルの内容編集や既存未追跡ディレクトリへの追加が key に反映されず**陳腐化キャッシュ**に
 *     ヒットし得る問題を防ぐ（内容をパスソート順で連結 → 1 ハッシュ化し決定性を担保）。
 *
 * 安全側の原則:
 *   - **PASS (exit 0) のみ記録**。失敗は決して記録せず常に再実行する（赤をキャッシュしない）。
 *   - 記録は **temp + rename** でアトミックに行う（`atomicWrite`）。`.gate-cache` を worktree 間で
 *     symlink 共有して同一キーに gate が並走しても、第三者リーダーは「古い完全なファイル」か「新しい
 *     完全なファイル」のどちらかしか観測しない（torn read を構造排除）。書き込み順は log → meta
 *     （meta を最後に rename）: リーダーは meta の `code === 0` で hit 判定し `.log` を参照するため。
 *   - キャッシュの置き場所は `GATE_CACHE_DIR`（環境変数）> 既定 `<repo root>/.gate-cache` の順で
 *     解決する（`.git` 配下には置かない: sandbox で `.git` 書込が制限される環境を回避）。`<repo root>`
 *     は `git rev-parse --show-toplevel`。`GATE_CACHE_DIR` の相対パスは実行 cwd 基準。worktree 間共有は
 *     eval worktree に `.gate-cache` symlink を張ることで担保する（setupWorktree.mjs 参照）。
 *     `.gate-cache/` はプロジェクトの `.gitignore` に追加すること。
 *   - 限界: gitignore 対象ファイル（.env / 生成物）は **依然キーに含まれない**（未追跡 content は
 *     含めるようになったが、`--exclude-standard` で ignore 済みは除外される）。ゲートに登録するステップは
 *     外部依存を mock した決定的なコマンドに限ること（非決定的な実機検証は対象外＝別コマンドで都度実行）。
 *   - 生成物のコミットを伴う条件付きステップ（例: 公開型定義の再生成）も対象外とし、都度実行する。
 *
 * 使い方:
 *   <RUNNER> run gate              # gateSteps を順に（キャッシュ有効）
 *   <RUNNER> run gate test         # 指定ステップのみ
 *   <RUNNER> run gate --no-cache   # 読込スキップして必ず実行（PASS なら記録は更新）
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sha = (s) => createHash("sha256").update(s).digest("hex");

/**
 * キャッシュルートを決定する。
 *   1. `GATE_CACHE_DIR`（環境変数）があればそれを使う。相対パスは実行 cwd 基準で解決。
 *   2. 無ければ `<repo root>/.gate-cache`。`repoRoot` は `git rev-parse --show-toplevel`。
 * `.git` 配下には置かない（sandbox での `.git` 書込制限を回避）。
 * @param {Record<string, string | undefined>} env
 * @param {string} repoRoot
 * @returns {string}
 */
function resolveCacheRoot(env, repoRoot) {
    const override = env.GATE_CACHE_DIR && env.GATE_CACHE_DIR.trim();
    if (override) return path.resolve(override);
    return path.join(repoRoot, ".gate-cache");
}

function gitText(args) {
    const r = spawnSync("git", args, { encoding: "utf8" });
    return r.status === 0 ? (r.stdout ?? "") : "";
}

/** 読み取れない未追跡ファイルに混ぜる固定マーカー（状態を「読めない」として差に残す）。 */
const UNREADABLE_MARKER = " <gate:unreadable> ";

/**
 * 未追跡（非 ignore）ファイルの内容ハッシュを算出する純関数。
 *
 *   - `git ls-files --others --exclude-standard` で未追跡ファイルを列挙する
 *     （`status --porcelain` の `??` には頼らない: 未追跡ディレクトリ畳み込みを回避し、
 *     既存未追跡ディレクトリへの追加も個別ファイルとして拾う）。gitignore 済みは除外される。
 *   - パスでソートし、各ファイルの内容を連結 → 1 ハッシュ化する（順序非依存の決定性を担保）。
 *   - 読み取れないファイル（パーミッション・特殊ファイル等）は内容の代わりに固定マーカーを
 *     混ぜる（無視せずエラーにもせず、必ず差として現れる）。
 *   - 未追跡ファイルが 0 件なら安定した空リストのハッシュを返す（clean ツリーでは常に同じ値に
 *     収束 = コミット由来キーの worktree 間共有を壊さない）。
 *
 * @param {string} cwd リポジトリルート（gate はルートで実行される前提。`ls-files` は cwd 起点の相対パス）。
 * @returns {string}
 */
function untrackedContentHash(cwd) {
    const r = spawnSync("git", ["ls-files", "--others", "--exclude-standard"], {
        cwd,
        encoding: "utf8",
    });
    const out = r.status === 0 ? (r.stdout ?? "") : "";
    const files = out
        .split("\n")
        .map((l) => l.replace(/\s+$/, ""))
        .filter((l) => l.length > 0)
        .sort();
    const parts = [];
    for (const rel of files) {
        let content;
        try {
            content = readFileSync(path.join(cwd, rel)).toString("base64");
        } catch {
            content = UNREADABLE_MARKER;
        }
        parts.push(`${rel} ${content}`);
    }
    return sha(parts.join(" \n"));
}

/**
 * 同一ディレクトリ内の一時ファイルへ書き → `rename` で確定するアトミック書き込み。
 *
 *   - `rename(2)` は同一ファイルシステム上でアトミックなため、リーダーは「古い完全なファイル」か
 *     「新しい完全なファイル」のどちらかのみを観測し、途中状態を観測しない（torn read 排除）。
 *   - tmp は **必ず `dst` と同ディレクトリ** に作る（`os.tmpdir()` は別 FS の可能性があり rename が
 *     EXDEV で失敗する）。`.gate-cache` はリポジトリルート配下なので同一 FS が保証される。
 *   - tmp 名は `<basename>.<pid>.<rand>.tmp`。同一キーへ並走する書き込みでも衝突しない。
 *     サフィックスは `.tmp` 固定（将来 glob 走査で除外しやすい）。
 *   - rename に至らず例外で抜けた場合、共有ディレクトリへの残骸累積を避けるため tmp を
 *     best-effort で unlink する（失敗は無視）。
 * @param {string} dst
 * @param {string} data
 */
function atomicWrite(dst, data) {
    const dir = path.dirname(dst);
    const base = path.basename(dst);
    const tmp = path.join(dir, `${base}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
    try {
        writeFileSync(tmp, data);
        renameSync(tmp, dst);
    } catch (err) {
        try {
            unlinkSync(tmp);
        } catch {
            /* best-effort: tmp が無い / 消せない場合は無視 */
        }
        throw err;
    }
}

export { atomicWrite, untrackedContentHash };

function loadSteps() {
    let pkg;
    try {
        pkg = JSON.parse(readFileSync("package.json", "utf8"));
    } catch {
        console.error("package.json をカレントディレクトリから読めません（リポジトリルートで実行する）。");
        process.exit(2);
    }
    const steps = pkg.gateSteps;
    if (!Array.isArray(steps) || steps.length === 0) {
        console.error(
            'package.json に "gateSteps" が未定義です。導入時にプロジェクトの 3 点ゲート\n' +
                "（lint/format 検証・型/ビルド・テスト。いずれも差分を生まない検証版）を定義してください。例:\n" +
                '  "gateSteps": [\n' +
                '    { "id": "lint",  "cmd": "npm run lint -- --max-warnings=0", "label": "lint/format 検証" },\n' +
                '    { "id": "build", "cmd": "npm run build",                    "label": "型チェック / ビルド" },\n' +
                '    { "id": "test",  "cmd": "npm test",                         "label": "テスト" }\n' +
                "  ]",
        );
        process.exit(2);
    }
    for (const s of steps) {
        if (!s || typeof s.id !== "string" || typeof s.cmd !== "string") {
            console.error(`gateSteps の要素が不正です（{ id, cmd, label? } 形式）: ${JSON.stringify(s)}`);
            process.exit(2);
        }
    }
    return steps.map((s) => ({ id: s.id, cmd: s.cmd, label: s.label ?? s.cmd }));
}

// ロックファイル（存在するものすべて）のハッシュ。依存変更でキャッシュを自然に無効化する。
// JS 以外のプロジェクトでも使えるよう、主要エコシステムのロックファイルを見る。
const LOCKFILES = [
    // JS / TS
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    // Python
    "uv.lock",
    "poetry.lock",
    "Pipfile.lock",
    // Go / Rust / Ruby / PHP
    "go.sum",
    "Cargo.lock",
    "Gemfile.lock",
    "composer.lock",
];
function lockHash() {
    const parts = [];
    for (const f of LOCKFILES) {
        try {
            parts.push(`${f}:${createHash("sha256").update(readFileSync(f)).digest("hex")}`);
        } catch {
            // 無いロックファイルはスキップ
        }
    }
    return sha(parts.join("\n"));
}

function run(cmd) {
    return new Promise((resolve) => {
        const proc = spawn(cmd, { shell: true, stdio: ["ignore", "pipe", "pipe"], env: process.env });
        let buf = "";
        proc.stdout.on("data", (d) => {
            buf += d;
            process.stdout.write(d);
        });
        proc.stderr.on("data", (d) => {
            buf += d;
            process.stderr.write(d);
        });
        proc.on("close", (code) => resolve({ code: code ?? 1, output: buf }));
        proc.on("error", (err) => {
            console.error(String(err));
            resolve({ code: 1, output: buf + String(err) });
        });
    });
}

async function main() {
    const argv = process.argv.slice(2);
    const noCache = argv.includes("--no-cache") || argv.includes("--force");
    const wanted = argv.filter((a) => !a.startsWith("-"));
    const STEPS = loadSteps();
    const steps = wanted.length > 0 ? STEPS.filter((s) => wanted.includes(s.id)) : STEPS;
    if (steps.length === 0) {
        console.error(`未知のステップ: ${wanted.join(", ")}。有効: ${STEPS.map((s) => s.id).join(", ")}`);
        process.exit(2);
    }

    // --- 作業ツリーの状態を 1 度だけスナップショット（全ステップ共通キー） ---
    const head = gitText(["rev-parse", "HEAD"]).trim() || "no-head";
    const porcelain = gitText(["status", "--porcelain"]);
    const diff = gitText(["diff", "HEAD"]);
    const clean = porcelain.trim() === "";
    const lock = lockHash();
    const repoRoot = gitText(["rev-parse", "--show-toplevel"]).trim() || process.cwd();
    // 未追跡（非 ignore）ファイルの内容も key に折り込む（porcelain/diff は内容を取りこぼすため）。
    const untrackedHash = untrackedContentHash(repoRoot);
    const treeHash = sha(`${porcelain}\n${diff}\n${untrackedHash}`);
    const cacheRoot = resolveCacheRoot(process.env, repoRoot);
    mkdirSync(cacheRoot, { recursive: true });

    const sha7 = head.slice(0, 7);
    console.log(
        `▶ gate @ ${sha7} (${clean ? "clean" : "dirty"}) — cache: ${cacheRoot}` +
            (noCache ? " [--no-cache]" : ""),
    );

    let failed = false;
    for (const step of steps) {
        const key = sha([step.id, step.cmd, head, lock, treeHash].join("\n"));
        const metaPath = path.join(cacheRoot, `${key}.json`);
        const logPath = path.join(cacheRoot, `${key}.log`);

        // --- キャッシュ読込（PASS のみ記録されている） ---
        if (!noCache) {
            let meta = null;
            try {
                meta = JSON.parse(readFileSync(metaPath, "utf8"));
            } catch {
                // キャッシュ無し
            }
            if (meta && meta.code === 0) {
                console.log(
                    `✓ gate:${step.id} CACHE HIT — ${step.label}\n` +
                        `    recorded ${meta.ts} @ ${sha7} (${meta.clean ? "clean" : "dirty"})\n` +
                        `    summary: ${meta.summary}\n` +
                        `    log: ${logPath}`,
                );
                continue;
            }
        }

        // --- 実行 ---
        console.log(`… gate:${step.id} RUN — ${step.cmd}`);
        const { code, output } = await run(step.cmd);
        const summary =
            output
                .trimEnd()
                .split("\n")
                .filter((l) => l.trim())
                .slice(-3)
                .join(" / ") || "(no output)";

        if (code === 0) {
            // PASS のみ記録。フル出力をテキストログに残す。
            // log → meta の順で temp+rename（meta を最後に確定）: リーダーは meta の code===0 を見て
            // hit 判定し log を参照するため、meta が見えた時点で log が揃っている必要がある。
            atomicWrite(logPath, output);
            atomicWrite(
                metaPath,
                JSON.stringify(
                    {
                        step: step.id,
                        cmd: step.cmd,
                        head,
                        lockHash: lock,
                        treeHash,
                        clean,
                        code,
                        ts: new Date().toISOString(),
                        summary,
                        logPath,
                    },
                    null,
                    2,
                ),
            );
            console.log(`✓ gate:${step.id} PASS (recorded) — log: ${logPath}`);
        } else {
            // 失敗は記録しない（赤をキャッシュしない）。
            console.error(`✗ gate:${step.id} FAIL (exit ${code}) — 結果は記録しない（再実行で再評価）`);
            failed = true;
            break; // 以降のステップは走らせない（lint && build && test と同義）
        }
    }

    process.exit(failed ? 1 : 0);
}

// テストから純関数（untrackedContentHash）を import するときに main を走らせないため、
// CLI として直接実行されたとき（このファイルがエントリポイント）のみ起動する。
// Bun は import.meta.main を提供する。Node ESM では argv[1] と import.meta.url を比較する。
const isMain =
    import.meta.main ??
    (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url);
if (isMain) {
    await main();
}
