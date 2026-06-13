#!/usr/bin/env node
/**
 * タスク実績（リードタイム・サブエージェント実行・トークン消費）を集計して表示する（読み取り専用）。
 * Node / Bun 両対応・依存は yaml のみ。
 *
 *   node scripts/tasks/metrics.mjs                  # 全タスクのサマリテーブル
 *   node scripts/tasks/metrics.mjs <task-dir>       # 1 タスクの詳細（エージェント実行の内訳）
 *   node scripts/tasks/metrics.mjs --json           # 機械連携用 JSON
 *
 * データソース:
 *   1. git タイムスタンプ — タスクディレクトリに触れた最初のコミット（起票）と最後のコミット
 *      （通常 close）からリードタイムを復元する。過去タスクにも遡及できる。
 *   2. .claude/metrics/agent-runs.jsonl — PostToolUse hook（scripts/metrics/logAgentRun.mjs）が
 *      モデル外で追記するサブエージェント実行ログ（duration / input・output・cache トークン）。
 *      プロンプト中の `<TASKS_ROOT>/<category>/<task-dir>` 言及でタスクに紐づける。
 *      ファイルが無ければ git 由来のみ表示。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { discoverTasks, TASKS_ROOT } from "./lib.mjs";

const RUNS_PATH = ".claude/metrics/agent-runs.jsonl";

function fail(msg) {
    console.error(`エラー: ${msg}`);
    process.exit(1);
}

/** @param {string} dir @returns {{first: number|null, last: number|null, count: number}} */
function gitTimestamps(dir) {
    let out = "";
    try {
        out = execFileSync("git", ["log", "--format=%ct", "--", dir], { encoding: "utf8" }).trim();
    } catch {
        return { first: null, last: null, count: 0 };
    }
    if (!out) return { first: null, last: null, count: 0 };
    const ts = out.split("\n").map(Number); // newest-first
    return { first: ts[ts.length - 1] ?? null, last: ts[0] ?? null, count: ts.length };
}

async function loadAgentRuns() {
    if (!existsSync(RUNS_PATH)) return [];
    const runs = [];
    for (const line of (await readFile(RUNS_PATH, "utf8")).split("\n")) {
        if (!line.trim()) continue;
        try {
            const r = JSON.parse(line);
            runs.push({
                ts: r.ts ?? null,
                agent: r.agent ?? null,
                description: r.description ?? null,
                task: r.task ?? null,
                duration_ms: r.duration_ms ?? null,
                tokens: {
                    input: r.tokens?.input ?? null,
                    output: r.tokens?.output ?? null,
                    cache_read: r.tokens?.cache_read ?? null,
                    cache_creation: r.tokens?.cache_creation ?? null,
                    total: r.tokens?.total ?? null,
                },
            });
        } catch {
            // 壊れた行は集計から黙って外す（hook は防御的に書くが、手編集等への耐性）
        }
    }
    return runs;
}

function fmtDuration(sec) {
    if (sec === null) return "-";
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    return `${(sec / 3600).toFixed(1)}h`;
}

function fmtTokens(n) {
    if (n === null) return "-";
    return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

function sumTokens(runs) {
    let output = null;
    let total = null;
    for (const r of runs) {
        if (r.tokens.output !== null) output = (output ?? 0) + r.tokens.output;
        if (r.tokens.total !== null) total = (total ?? 0) + r.tokens.total;
    }
    return { output, total };
}

async function collect() {
    const tasks = await discoverTasks();
    const allRuns = await loadAgentRuns();
    const out = [];
    for (const t of tasks) {
        const { first, last, count } = gitTimestamps(t.dir);
        const agentRuns = allRuns.filter((r) => r.task !== null && basename(r.task) === t.meta.id);
        out.push({
            id: t.meta.id,
            status: t.meta.status,
            verdict: t.meta.verdict,
            attempts: t.meta.attempts,
            firstCommitAt: first,
            lastCommitAt: last,
            leadTimeSec: first !== null && last !== null && last >= first ? last - first : null,
            commits: count,
            agentRuns,
        });
    }
    return out;
}

function printSummary(metrics) {
    console.log(
        "id | status | verdict | attempts | lead(起票→最終commit) | commits | agent実行 | tokens(out/total)",
    );
    console.log("---|---|---|---|---|---|---|---");
    for (const m of metrics) {
        const tok = sumTokens(m.agentRuns);
        console.log(
            [
                m.id,
                m.status,
                m.verdict ?? "-",
                m.attempts,
                fmtDuration(m.leadTimeSec),
                m.commits,
                m.agentRuns.length || "-",
                `${fmtTokens(tok.output)}/${fmtTokens(tok.total)}`,
            ].join(" | "),
        );
    }
    const withLead = metrics.filter((m) => m.leadTimeSec !== null && m.status === "done");
    if (withLead.length > 0) {
        const avg = Math.round(withLead.reduce((a, m) => a + (m.leadTimeSec ?? 0), 0) / withLead.length);
        console.log(`\ndone タスク ${withLead.length} 件の平均リードタイム: ${fmtDuration(avg)}`);
    }
    if (metrics.every((m) => m.agentRuns.length === 0)) {
        console.log(
            `\n（agent 実行ログなし: ${RUNS_PATH} が未生成。PostToolUse hook 導入後のサブエージェント実行から記録される）`,
        );
    }
}

function printDetail(m) {
    console.log(`# ${m.id}`);
    console.log(`status=${m.status} verdict=${m.verdict ?? "-"} attempts=${m.attempts}`);
    console.log(
        `リードタイム: ${fmtDuration(m.leadTimeSec)}（起票 ${m.firstCommitAt ? new Date(m.firstCommitAt * 1000).toISOString() : "-"} → 最終 ${m.lastCommitAt ? new Date(m.lastCommitAt * 1000).toISOString() : "-"} / ${m.commits} commits）`,
    );
    if (m.agentRuns.length === 0) {
        console.log("agent 実行ログ: なし");
        return;
    }
    console.log(`\nagent 実行 ${m.agentRuns.length} 件:`);
    for (const r of m.agentRuns) {
        const dur = r.duration_ms !== null ? fmtDuration(Math.round(r.duration_ms / 1000)) : "-";
        console.log(
            `- ${r.ts ?? "-"} ${r.agent ?? "?"} (${r.description ?? ""}) duration=${dur} ` +
                `in=${fmtTokens(r.tokens.input)} out=${fmtTokens(r.tokens.output)} ` +
                `cache_r=${fmtTokens(r.tokens.cache_read)} cache_w=${fmtTokens(r.tokens.cache_creation)} total=${fmtTokens(r.tokens.total)}`,
        );
    }
    const tok = sumTokens(m.agentRuns);
    console.log(`合計 tokens: out=${fmtTokens(tok.output)} total=${fmtTokens(tok.total)}`);
}

async function main() {
    const args = process.argv.slice(2);
    const json = args.includes("--json");
    const target = args.find((a) => !a.startsWith("--"));

    const metrics = await collect();
    if (target) {
        const id = basename(target.replace(/\/+$/, ""));
        const m = metrics.find((x) => x.id === id);
        if (!m) fail(`タスクが見つかりません: ${target}（${TASKS_ROOT}/<category>/${id} を確認）`);
        if (json) console.log(JSON.stringify(m, null, 2));
        else printDetail(m);
        return;
    }
    if (json) console.log(JSON.stringify(metrics, null, 2));
    else printSummary(metrics);
}

await main();
