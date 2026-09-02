import { describe, expect, test } from "bun:test";

import { findEscapedNewline, validateCommitMessage } from "../checkCommitMessage.mjs";

const VALID = [
    "fix(rtc): 接続失敗時の再試行を修正",
    "",
    "一時的な切断から復旧できるよう再試行条件を修正した。対象テストで確認し、既知の残リスクはない。",
    "",
    "Refs: task-260101000000-example",
].join("\n");

describe("validateCommitMessage", () => {
    test("日本語散文の標準形式を許可する", () => {
        expect(validateCommitMessage(VALID)).toEqual([]);
    });

    test("英語だけの件名と本文を拒否する", () => {
        const errors = validateCommitMessage("fix(rtc): retry connection\n\nFix retry handling.");
        expect(errors).toContain("件名の要約を日本語で書いてください。");
        expect(errors).toContain("本文を日本語の散文で書いてください。");
    });

    test("英語の項目ラベルを拒否する", () => {
        expect(validateCommitMessage("fix(rtc): 再試行を修正\n\nWhy: 必要なため。")).toContain(
            "Why/What/Verify/Riskなどの英語の項目ラベルを使わないでください。",
        );
    });

    test("本文の項目分けと手動折り返しを拒否する", () => {
        expect(
            validateCommitMessage("fix(rtc): 再試行を修正\n\n理由を書く。\n変更を書く。"),
        ).toContain("本文は項目分けや手動折り返しをせず、一段落一行で書いてください。");
    });

    test("本文のないコミットを拒否する", () => {
        expect(validateCommitMessage("fix(rtc): 再試行を修正\n\nRefs: task-1")).toContain(
            "変更理由、主な変更、確認、残リスクを含む日本語の本文を書いてください。",
        );
        expect(validateCommitMessage("fix(rtc): 再試行を修正")).toContain(
            "変更理由、主な変更、確認、残リスクを含む日本語の本文を書いてください。",
        );
    });

    test("フッターへ任意の英語項目を追加できない", () => {
        expect(validateCommitMessage(VALID + "\nStatus: done")).toContain(
            "フッターはRefsまたはGitが定義する固定項目だけにしてください。",
        );
    });
});

describe("findEscapedNewline", () => {
    test("構造用に埋め込まれたエスケープ改行を検出する", () => {
        expect(findEscapedNewline("fix(rtc): 再試行を修正\\n\\nRefs: task-1")).toBe("\\n\\n");
    });

    test("本文中の正当な文字列表現は誤検出しない", () => {
        expect(findEscapedNewline("パーサーは例中の文字列\\nを受理する。")).toBeNull();
    });
});
