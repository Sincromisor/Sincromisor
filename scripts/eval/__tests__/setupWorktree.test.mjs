import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decideRemoval, parseArgs } from "../setupWorktree.mjs";

test("clean worktree（porcelain 空）は削除可", () => {
    assert.deepEqual(decideRemoval("", false), { refuse: false });
});

test("dirty かつ --discard 無しは削除を拒否し保全候補パスを理由に含む", () => {
    const porcelain = "?? acceptance/\n M scripts/eval/setupWorktree.mjs";
    const decision = decideRemoval(porcelain, false);
    assert.equal(decision.refuse, true);
    assert.ok(decision.reason.includes("acceptance/"));
    assert.ok(decision.reason.includes("scripts/eval/setupWorktree.mjs"));
    assert.ok(decision.reason.includes("--discard"));
});

test("dirty でも --discard 指定なら削除可", () => {
    assert.deepEqual(decideRemoval("?? acceptance/", true), { refuse: false });
});

test("空白のみ・末尾改行は dirty 扱いしない", () => {
    assert.deepEqual(decideRemoval("\n  \n", false), { refuse: false });
});

test("理由に検出件数を含む", () => {
    const porcelain = "?? acceptance/eval.test.mjs\n?? acceptance/fixtures/";
    const decision = decideRemoval(porcelain, false);
    assert.equal(decision.refuse, true);
    assert.ok(decision.reason.includes("2 件"));
});

test("parseArgs: add は既定で detach モード（branch 未指定）", () => {
    assert.deepEqual(parseArgs(["add", "abc123"]), { cmd: "add", target: "abc123" });
});

test("parseArgs: add --branch <name> はブランチモード（フラグ前後どちらでも解決）", () => {
    assert.deepEqual(parseArgs(["add", "abc123", "--branch", "task/foo"]), {
        cmd: "add",
        target: "abc123",
        branch: "task/foo",
    });
    assert.deepEqual(parseArgs(["add", "--branch", "task/foo", "abc123"]), {
        cmd: "add",
        target: "abc123",
        branch: "task/foo",
    });
});

test("parseArgs: add --branch に値が無い（末尾）は usage", () => {
    assert.deepEqual(parseArgs(["add", "abc123", "--branch"]), { cmd: "usage" });
});

test("parseArgs: remove は target と --discard を解決する", () => {
    assert.deepEqual(parseArgs(["remove", "/tmp/wt"]), {
        cmd: "remove",
        target: "/tmp/wt",
        discard: false,
    });
    assert.deepEqual(parseArgs(["remove", "/tmp/wt", "--discard"]), {
        cmd: "remove",
        target: "/tmp/wt",
        discard: true,
    });
});

test("parseArgs: cmd 不明・target 欠落は usage", () => {
    assert.deepEqual(parseArgs([]), { cmd: "usage" });
    assert.deepEqual(parseArgs(["add"]), { cmd: "usage" });
    assert.deepEqual(parseArgs(["bogus", "x"]), { cmd: "usage" });
});
