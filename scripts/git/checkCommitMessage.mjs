import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const JAPANESE_TEXT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
const SUBJECT = /^[a-z]+(?:\([^)]+\))?!?: (.+)$/;
const ENGLISH_SECTION = /^(?:Why|What|Verify|Risk|Verdict|Attempts):/im;
const FOOTER = /^(?:Refs|BREAKING CHANGE|Co-authored-by|Signed-off-by):/;

/**
 * Gitが展開しない、構造用として埋め込まれた文字列 `\\n` を返す。
 * コード例に現れる単独の `\\n` は拒否せず、段落や項目の代用にした場合だけを対象にする。
 * @param {string} message
 * @returns {string|null}
 */
export function findEscapedNewline(message) {
    const match = message.match(
        /\\n(?:\\n|(?=Why:|What:|Verify:|Risk:|Verdict:|Attempts:|Refs:|- ))/,
    );
    return match?.[0] ?? null;
}

/**
 * コミットメッセージを正本の日本語散文形式に照らして検査する。
 *
 * コメント行はGitによる編集用の補助情報なので除外する。本文は手動折り返しや項目化を
 * 再び定着させないよう一段落一行に限定し、固定フッターだけを別段落として許可する。
 * @param {string} message
 * @returns {string[]}
 */
export function validateCommitMessage(message) {
    const cleaned = message
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .filter((line) => !line.startsWith("#"))
        .join("\n")
        .trim();
    const errors = [];

    if (findEscapedNewline(cleaned)) {
        errors.push("構造用の改行に文字列 \\n を使わないでください。");
    }
    if (ENGLISH_SECTION.test(cleaned)) {
        errors.push("Why/What/Verify/Riskなどの英語の項目ラベルを使わないでください。");
    }

    const lines = cleaned.split("\n");
    const subject = lines[0] ?? "";
    const match = subject.match(SUBJECT);
    if (!match) {
        errors.push("件名をConventional Commits形式で書いてください。");
    } else if (!JAPANESE_TEXT.test(match[1])) {
        errors.push("件名の要約を日本語で書いてください。");
    }

    if (lines.length === 1) {
        errors.push("変更理由、主な変更、確認、残リスクを含む日本語の本文を書いてください。");
        return errors;
    }
    if (lines[1] !== "") {
        errors.push("件名と本文の間にだけ空行を1行入れてください。");
    }

    const rest = lines.slice(2);
    const footerIndex = rest.findIndex((line) => FOOTER.test(line));
    let bodyLines = rest;
    if (footerIndex >= 0) {
        bodyLines = rest.slice(0, footerIndex);
        if (bodyLines.at(-1) === "") {
            bodyLines.pop();
        } else if (bodyLines.length > 0) {
            errors.push("本文とフッターの間にだけ空行を1行入れてください。");
        }
        if (rest.slice(footerIndex).some((line) => line === "")) {
            errors.push("フッター内に空行を入れないでください。");
        }
        if (rest.slice(footerIndex).some((line) => !FOOTER.test(line))) {
            errors.push("フッターはRefsまたはGitが定義する固定項目だけにしてください。");
        }
    }

    if (bodyLines.some((line) => line === "") || bodyLines.length > 1) {
        errors.push("本文は項目分けや手動折り返しをせず、一段落一行で書いてください。");
    }
    const body = bodyLines.join("");
    if (body && !JAPANESE_TEXT.test(body)) {
        errors.push("本文を日本語の散文で書いてください。");
    }
    if (!body) {
        errors.push("変更理由、主な変更、確認、残リスクを含む日本語の本文を書いてください。");
    }

    return [...new Set(errors)];
}

function check(label, message) {
    const errors = validateCommitMessage(message);
    for (const error of errors) console.error(label + ": " + error);
    return errors.length === 0;
}

/* Gitフックは編集中のファイルを、手動確認は指定した単一コミットまたは範囲を同じ規則で検査する。 */
if (import.meta.main) {
    const args = process.argv.slice(2);
    let passed = true;
    if (args[0] === "--file") {
        if (!args[1]) throw new Error("--fileにはコミットメッセージファイルを指定してください。");
        passed = check(args[1], readFileSync(args[1], "utf8"));
    } else {
        const revision = args[0] ?? "HEAD";
        const hashes = execFileSync(
            "git",
            revision.includes("..") ? ["rev-list", revision] : ["rev-list", "-1", revision],
            { encoding: "utf8" },
        )
            .trim()
            .split("\n")
            .filter(Boolean);
        for (const hash of hashes) {
            const message = execFileSync("git", ["show", "-s", "--format=%B", hash], {
                encoding: "utf8",
            });
            if (!check(hash, message)) passed = false;
        }
    }
    if (!passed) process.exitCode = 1;
}
