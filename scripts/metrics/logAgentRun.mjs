#!/usr/bin/env node
/**
 * サブエージェント実行の実績を `.claude/metrics/agent-runs.jsonl` に 1 行追記する hook。
 * Node / Bun 両対応・依存ゼロ。**Claude Code と Codex CLI の両方**から起動される。
 *
 * - Claude Code: `.claude/settings.json` の PostToolUse hook（matcher: "Task|Agent"）。
 *   stdin に tool_name / tool_input / tool_response（.usage 等）を受け取る。
 * - Codex CLI: `.codex/hooks.json` の PostToolUse hook（matcher: "close_agent"）。Codex は
 *   サブエージェントを multi_agent ツール（spawn_agent / wait_agent / close_agent）として実行する
 *   ため、ツール完了を Claude と同じ PostToolUse で捕捉する。stdin に tool_name / cwd /
 *   サブエージェントの結果・usage を受け取る（フィールド名は Codex のバージョンで揺れ得るため
 *   buildCodexLine で防御的に複数候補から拾う）。
 * - モデルのトークンを一切消費せずにオブザーバビリティ（誰が・どれだけの時間とトークンで
 *   作業したか）を得るのが目的。集計は `npm run tasks:metrics`。
 * - 取れない値は null で記録する。**どんな入力でも exit 0**（hook 失敗でパイプラインを止めない）。
 * - `.claude/metrics/` は gitignore しておくこと（ローカル計測データ）。
 *
 * 注意（Codex 連携の検証ポイント）: project スコープの hook は対話 TUI でのみ発火し、非対話
 * `codex exec` では発火しないことを 0.139.0 で確認済み。close_agent の PostToolUse ペイロードの
 * 実フィールド名（usage / duration）は対話セッションで 1 度確認し、必要なら buildCodexLine の
 * 候補を増やすこと。未対応でも「メトリクス行が出ない」だけで安全に劣化する（exit 0 を維持）。
 */

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

function num(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function str(v) {
    return typeof v === "string" && v ? v : null;
}

function rec(v) {
    return v !== null && typeof v === "object" ? v : {};
}

/** 最初に見つかった有限数を返す（フィールド名がブレる Codex/Claude 双方の防御的抽出用）。 */
function firstNum(...vals) {
    for (const v of vals) {
        const n = num(v);
        if (n !== null) return n;
    }
    return null;
}

/** プロンプト/指示文から <TASKS_ROOT>/<category>/task-... を拾ってタスクに紐づける。 */
function matchTask(text) {
    const tasksRoot = process.env.TASKS_ROOT ?? "tasks";
    const taskRe = new RegExp(`${tasksRoot}/(?:[A-Za-z0-9._-]+/)?task-\\d{12}[A-Za-z0-9._-]*`);
    return (str(text) ?? "").match(taskRe)?.[0] ?? null;
}

/** Claude Code の PostToolUse(Task|Agent) ペイロード → 計測行。対象外なら null。 */
function buildClaudeLine(input) {
    const toolName = str(input.tool_name) ?? "";
    if (!/^(Task|Agent)$/.test(toolName)) return null;
    const toolInput = rec(input.tool_input);
    const toolResponse = rec(input.tool_response);
    const usage = rec(toolResponse.usage);
    return {
        ts: new Date().toISOString(),
        harness: "claude",
        agent: str(toolInput.subagent_type) ?? toolName,
        description: str(toolInput.description),
        task: matchTask(`${str(toolInput.prompt) ?? ""} ${str(toolInput.description) ?? ""}`),
        duration_ms: firstNum(toolResponse.totalDurationMs, toolResponse.total_duration_ms),
        tokens: {
            input: num(usage.input_tokens),
            output: num(usage.output_tokens),
            cache_read: num(usage.cache_read_input_tokens),
            cache_creation: num(usage.cache_creation_input_tokens),
            total: firstNum(toolResponse.totalTokens, toolResponse.total_tokens),
        },
        tool_use_count: firstNum(toolResponse.totalToolUseCount, toolResponse.total_tool_use_count),
        session_id: str(input.session_id),
    };
}

/** Codex の subagent ツール（PostToolUse の close_agent 等）の payload → 計測行。
 *  サブエージェント情報・usage の入れ子は実機で揺れ得るため、判明/想定経路を総当りする。 */
function buildCodexLine(input) {
    // PostToolUse 形（tool_input = spawn パラメータ, tool_response = 結果 + usage）と、
    // 旧 SubagentStop 形（subagent / result 直下）の両方から拾えるよう候補を広く取る。
    const toolInput = rec(input.tool_input);
    const toolResponse = rec(input.tool_response);
    const sub = rec(input.subagent ?? input.agent ?? toolInput ?? input.hookSpecificOutput);
    const usage = rec(input.usage ?? toolResponse.usage ?? sub.usage ?? rec(input.result).usage);
    const promptText = `${str(toolInput.prompt) ?? ""} ${str(input.prompt) ?? ""} ${str(sub.prompt) ?? ""} ${str(input.instructions) ?? ""}`;
    return {
        ts: new Date().toISOString(),
        harness: "codex",
        agent:
            str(
                toolInput.name ??
                    toolInput.agent ??
                    sub.name ??
                    input.subagent_name ??
                    input.agent_name,
            ) ?? "subagent",
        description: str(sub.description ?? input.description),
        task: matchTask(promptText),
        duration_ms: firstNum(
            toolResponse.duration_ms,
            input.duration_ms,
            input.totalDurationMs,
            sub.duration_ms,
        ),
        tokens: {
            input: firstNum(usage.input_tokens, usage.prompt_tokens),
            output: firstNum(usage.output_tokens, usage.completion_tokens),
            cache_read: firstNum(usage.cache_read_input_tokens, usage.cached_input_tokens),
            cache_creation: num(usage.cache_creation_input_tokens),
            total: firstNum(usage.total_tokens, input.total_tokens),
        },
        tool_use_count: firstNum(toolResponse.tool_use_count, input.tool_use_count, sub.tool_use_count),
        session_id: str(input.session_id ?? input.turn_id),
    };
}

try {
    const input = rec(JSON.parse(readFileSync(0, "utf8")));
    const toolName = str(input.tool_name) ?? "";
    const isCodex =
        str(input.hook_event_name) === "SubagentStop" ||
        /^(spawn_agent|wait_agent|close_agent)$/.test(toolName) ||
        (!toolName && !!input.cwd);
    const line = isCodex ? buildCodexLine(input) : buildClaudeLine(input);
    if (!line) process.exit(0); // Claude の対象外ツールなど

    // 出力先ルート: Claude は CLAUDE_PROJECT_DIR、Codex は hook input の cwd、無ければ cwd。
    const projectDir = process.env.CLAUDE_PROJECT_DIR || str(input.cwd) || process.cwd();
    const outPath = join(projectDir, ".claude", "metrics", "agent-runs.jsonl");
    mkdirSync(dirname(outPath), { recursive: true });
    appendFileSync(outPath, `${JSON.stringify(line)}\n`);
} catch {
    // 解析失敗・書き込み失敗でも黙って成功扱い（テレメトリのためにパイプラインを止めない）
}
process.exit(0);
