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
 *   - 作業ツリーがクリーン（`git status --porcelain` が空）のときキーは **コミット由来のみ** に
 *     なり、worktree をまたいで共有される（評価者の隔離 worktree は同一コミットで即ヒット）。
 *   - dirty ツリーは tracked diff と untracked file contents までキーに含めるため、
 *     **完全に同一の状態** が再現したときだけ再利用される（= 編集のたびに実質フレッシュ実行。
 *     誤ヒットなし）。
 *
 * 安全側の原則:
 *   - **PASS (exit 0) のみ記録**。失敗は決して記録せず常に再実行する（赤をキャッシュしない）。
 *   - キャッシュは `GATE_CACHE_DIR`、未指定ならリポジトリ直下 `.gate-cache/` に置く。
 *     Codex の通常 workspace sandbox でも書けるよう、既定では `.git/` 配下を使わない。
 *   - 限界: gitignore 対象ファイル（.env / 生成物）はキーに含まれない。ゲートに登録するステップは
 *     外部依存を mock した決定的なコマンドに限ること（非決定的な実機検証は対象外＝別コマンドで都度実行）。
 *   - 生成物のコミットを伴う条件付きステップ（例: 公開型定義の再生成）も対象外とし、都度実行する。
 *
 * 使い方:
 *   npm run gate              # gateSteps を順に（キャッシュ有効）
 *   npm run gate -- test      # 指定ステップのみ
 *   npm run gate -- --no-cache # 読込スキップして必ず実行（PASS なら記録は更新）
 */

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const sha = (s) => createHash("sha256").update(s).digest("hex");

function gitText(args) {
    const r = spawnSync("git", args, { encoding: "utf8" });
    return r.status === 0 ? (r.stdout ?? "") : "";
}

function untrackedHash() {
    const r = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
        encoding: "buffer",
    });
    if (r.status !== 0 || !r.stdout?.length) return "";
    const parts = [];
    for (const raw of r.stdout.toString("utf8").split("\0")) {
        if (!raw) continue;
        try {
            const contentHash = createHash("sha256").update(readFileSync(raw)).digest("hex");
            parts.push(`${raw}\0${contentHash}`);
        } catch (error) {
            parts.push(`${raw}\0unreadable:${error?.code ?? "unknown"}`);
        }
    }
    return parts.sort().join("\0");
}

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
    const treeHash = sha(`${porcelain}\n${diff}\n${untrackedHash()}`);

    const cacheRoot = path.resolve(process.env.GATE_CACHE_DIR || ".gate-cache");
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
            writeFileSync(logPath, output);
            writeFileSync(
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

await main();
