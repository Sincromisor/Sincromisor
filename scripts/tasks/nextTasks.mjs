#!/usr/bin/env node
/**
 * 「次に実行できる / 実行が推奨されるタスク」を `meta.yaml` 群から機械抽出する読み取り専用ツール。
 * `tasks:index`（status 別の単純一覧）に対し、本ツールは `depends_on` を辿って
 * **依存が解決済みで今すぐ着手できるか**まで判定し、推奨順に並べる。`/run-task` の前段に置く想定。
 * Node / Bun 両対応・依存は yaml のみ。
 *
 *   node scripts/tasks/nextTasks.mjs                # READY / WAITING / BLOCKED を表示し、先頭に推奨1件
 *   node scripts/tasks/nextTasks.mjs --ready-only   # 即実行可（READY かつ review=APPROVED）のみ表示
 *   node scripts/tasks/nextTasks.mjs --json         # 機械可読（エージェント連携・/run-task への自動チェーン用）
 *
 * 状態（実装コード・meta.yaml）は一切変更しない。データモデルは scripts/tasks/lib.mjs を再利用する。
 */

import { discoverTasks } from "./lib.mjs";

// 着手準備の分類:
//   ready   … open かつ依存がすべて done
//   waiting … open だが未充足の依存がある
//   blocked … status=blocked（依存以外の外部要因待ち）
// READY 内のサブ状態（review/verdict 由来の「次の一手」）:
//   run          … review=APPROVED → /run-task に即投入可
//   rerun        … verdict=FAIL かつ open → 再実装候補（APPROVED 前提）
//   needs-review … review が null / NEEDS_REVISION → 先に /review-task が必要

const READY_KIND_RANK = { run: 0, rerun: 1, "needs-review": 2 };

const READY_KIND_LABEL = {
    run: "即実行可（APPROVED）",
    rerun: "再実装候補（前回 FAIL）",
    "needs-review": "要レビュー（未 APPROVED）",
};

/** 依存先の done 充足状況を調べる（done 以外＝cancelled/superseded/blocked/open/missing は未充足扱い） */
function assessDeps(meta, byId) {
    const unmet = [];
    for (const depId of meta.depends_on) {
        const dep = byId.get(depId);
        const status = dep ? dep.status : "missing";
        if (status !== "done") unmet.push({ id: depId, status });
    }
    return unmet;
}

function classifyReadyKind(meta) {
    if (meta.review === "APPROVED") {
        // APPROVED 済みで前回 FAIL のものは「再実装候補」として区別する
        return meta.verdict === "FAIL" ? "rerun" : "run";
    }
    return "needs-review";
}

function assess(tasks) {
    const byId = new Map(tasks.map((t) => [t.meta.id, t.meta]));
    const out = [];
    for (const t of tasks) {
        const m = t.meta;
        if (m.status === "blocked") {
            out.push({ task: t, readiness: "blocked", readyKind: null, unmetDeps: [] });
            continue;
        }
        if (m.status !== "open") continue; // done / cancelled / superseded は対象外
        const unmetDeps = assessDeps(m, byId);
        if (unmetDeps.length > 0) {
            out.push({ task: t, readiness: "waiting", readyKind: null, unmetDeps });
        } else {
            out.push({
                task: t,
                readiness: "ready",
                readyKind: classifyReadyKind(m),
                unmetDeps: [],
            });
        }
    }
    return out;
}

/** READY の推奨順: APPROVED(run) → rerun → needs-review、次に created_at 昇順、最後に id */
function sortReady(a, b) {
    const k = READY_KIND_RANK[a.readyKind] - READY_KIND_RANK[b.readyKind];
    if (k !== 0) return k;
    const ca = a.task.meta.created_at ?? "";
    const cb = b.task.meta.created_at ?? "";
    if (ca !== cb) return ca.localeCompare(cb);
    return a.task.meta.id.localeCompare(b.task.meta.id);
}

/** WAITING/BLOCKED の表示順: id 順 */
function sortById(a, b) {
    return a.task.meta.id.localeCompare(b.task.meta.id);
}

function renderText(assessments, readyOnly) {
    const ready = assessments
        .filter((a) => a.readiness === "ready")
        .filter((a) => !readyOnly || a.readyKind !== "needs-review")
        .sort(sortReady);
    const lines = [];

    const runnable = ready.filter((a) => a.readyKind !== "needs-review");
    const top = runnable[0] ?? ready[0];
    if (top) {
        const hint =
            top.readyKind === "needs-review"
                ? `（先に /review-task ${top.task.dir}）`
                : `→ /run-task ${top.task.dir}`;
        lines.push(`▶ 次に実行すべき: ${top.task.meta.id}  ${hint}`);
    } else {
        lines.push("▶ 即着手できる open タスクはありません（下の WAITING/BLOCKED を参照）");
    }
    lines.push("");

    const renderReady = (kind) => {
        const group = ready.filter((a) => a.readyKind === kind);
        if (group.length === 0) return;
        lines.push(`## READY — ${READY_KIND_LABEL[kind]}（${group.length} 件）`);
        for (const a of group) {
            lines.push(`  - [${a.task.meta.category}] ${a.task.meta.id}`);
            lines.push(`        ${a.task.meta.title}`);
        }
        lines.push("");
    };
    renderReady("run");
    renderReady("rerun");
    if (!readyOnly) renderReady("needs-review");

    if (readyOnly) return lines.join("\n").trimEnd();

    const waiting = assessments.filter((a) => a.readiness === "waiting").sort(sortById);
    if (waiting.length > 0) {
        lines.push(`## WAITING — 依存待ち（${waiting.length} 件）`);
        for (const a of waiting) {
            const blockers = a.unmetDeps.map((d) => `${d.id}(${d.status})`).join(", ");
            lines.push(`  - [${a.task.meta.category}] ${a.task.meta.id}`);
            lines.push(`        ${a.task.meta.title}`);
            lines.push(`        待機中の依存: ${blockers}`);
        }
        lines.push("");
    }

    const blocked = assessments.filter((a) => a.readiness === "blocked").sort(sortById);
    if (blocked.length > 0) {
        lines.push(`## BLOCKED — status=blocked（${blocked.length} 件・参考）`);
        for (const a of blocked) {
            lines.push(`  - [${a.task.meta.category}] ${a.task.meta.id}`);
            lines.push(`        ${a.task.meta.title}`);
        }
        lines.push("");
    }

    return lines.join("\n").trimEnd();
}

function toJson(assessments) {
    const pick = (a) => ({
        id: a.task.meta.id,
        dir: a.task.dir,
        title: a.task.meta.title,
        category: a.task.meta.category,
        readiness: a.readiness,
        readyKind: a.readyKind,
        review: a.task.meta.review,
        verdict: a.task.meta.verdict,
        attempts: a.task.meta.attempts,
        created_at: a.task.meta.created_at,
        unmetDeps: a.unmetDeps,
    });
    const ready = assessments
        .filter((a) => a.readiness === "ready")
        .sort(sortReady)
        .map(pick);
    return {
        recommended: ready.find((r) => r.readyKind !== "needs-review") ?? ready[0] ?? null,
        ready,
        waiting: assessments
            .filter((a) => a.readiness === "waiting")
            .sort(sortById)
            .map(pick),
        blocked: assessments
            .filter((a) => a.readiness === "blocked")
            .sort(sortById)
            .map(pick),
    };
}

async function main() {
    const json = process.argv.includes("--json");
    const readyOnly = process.argv.includes("--ready-only");
    const tasks = await discoverTasks();
    const assessments = assess(tasks);

    if (json) {
        const result = toJson(assessments);
        const ready = readyOnly
            ? result.ready.filter((r) => r.readyKind !== "needs-review")
            : result.ready;
        const filtered = readyOnly ? { recommended: ready[0] ?? null, ready } : result;
        console.log(JSON.stringify(filtered, null, 2));
        return;
    }
    console.log(renderText(assessments, readyOnly));
}

await main();
