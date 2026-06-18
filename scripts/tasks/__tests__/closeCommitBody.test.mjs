import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCloseCommitBody, readCommitTemplate } from "../lib.mjs";

let tmp;

beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "kit-close-body-"));
});
afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
});

const PASS = {
    id: "task-260101000000-fixture",
    verdict: "PASS",
    attempts: 1,
    taskDir: "tasks/chore/task-260101000000-fixture",
};
const FAIL = { ...PASS, verdict: "FAIL", attempts: 2 };

describe("buildCloseCommitBody 既定 body（機械的事実のみ）", () => {
    test("PASS: Verdict / Attempts / Refs / 成果物ポインタを含む", () => {
        const body = buildCloseCommitBody(PASS);
        expect(body).toContain("Verdict: PASS");
        expect(body).toContain("Attempts: 1");
        expect(body).toContain("Refs: task-260101000000-fixture");
        expect(body).toContain("See tasks/chore/task-260101000000-fixture/eval.md, impl.md");
    });

    test("FAIL: Verdict / Attempts / Refs / 成果物ポインタを含む", () => {
        const body = buildCloseCommitBody(FAIL);
        expect(body).toContain("Verdict: FAIL");
        expect(body).toContain("Attempts: 2");
        expect(body).toContain("Refs: task-260101000000-fixture");
        expect(body).toContain("See tasks/chore/task-260101000000-fixture/eval.md, impl.md");
    });

    test("LLM 散文（Why/What/Risk）は含まない", () => {
        const body = buildCloseCommitBody(PASS);
        expect(body).not.toMatch(/Why|What|Risk/i);
    });

    test("taskDir の末尾スラッシュは正規化される", () => {
        const body = buildCloseCommitBody({ ...PASS, taskDir: "tasks/chore/fixture/" });
        expect(body).toContain("See tasks/chore/fixture/eval.md, impl.md");
        expect(body).not.toContain("fixture//eval.md");
    });
});

describe("buildCloseCommitBody commitTemplate 展開", () => {
    test("既知プレースホルダを展開する", () => {
        const tpl = "v={verdict} a={attempts} id={id} dir={taskDir}";
        expect(buildCloseCommitBody(PASS, tpl)).toBe(
            "v=PASS a=1 id=task-260101000000-fixture dir=tasks/chore/task-260101000000-fixture",
        );
    });

    test("同一プレースホルダの複数出現をすべて展開する", () => {
        expect(buildCloseCommitBody(PASS, "{verdict} {verdict}")).toBe("PASS PASS");
    });

    test("未知プレースホルダは温存する", () => {
        expect(buildCloseCommitBody(PASS, "{verdict} {unknown} {id}")).toBe(
            "PASS {unknown} task-260101000000-fixture",
        );
    });

    test("空文字テンプレートはそのまま空 body（既定にフォールバックしない）", () => {
        expect(buildCloseCommitBody(PASS, "")).toBe("");
    });
});

describe("readCommitTemplate", () => {
    test("package.json の taskClose.commitTemplate を読む", async () => {
        const pkg = join(tmp, "package.json");
        await writeFile(pkg, JSON.stringify({ taskClose: { commitTemplate: "Verdict: {verdict}" } }));
        expect(await readCommitTemplate(pkg)).toBe("Verdict: {verdict}");
    });
    test("未設定なら null（既定 body にフォールバック）", async () => {
        const pkg = join(tmp, "package.json");
        await writeFile(pkg, JSON.stringify({ name: "x" }));
        expect(await readCommitTemplate(pkg)).toBeNull();
    });
    test("文字列でなければ null", async () => {
        const pkg = join(tmp, "package.json");
        await writeFile(pkg, JSON.stringify({ taskClose: { commitTemplate: 42 } }));
        expect(await readCommitTemplate(pkg)).toBeNull();
    });
    test("ファイルが無ければ null", async () => {
        expect(await readCommitTemplate(join(tmp, "nope.json"))).toBeNull();
    });
    test("パース失敗なら null", async () => {
        const pkg = join(tmp, "package.json");
        await writeFile(pkg, "{ not json");
        expect(await readCommitTemplate(pkg)).toBeNull();
    });
});
