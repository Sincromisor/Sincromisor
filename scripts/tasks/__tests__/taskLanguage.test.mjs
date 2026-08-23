import { describe, expect, test } from "bun:test";
import { hasJapaneseText } from "../lib.mjs";

describe("タスク名の言語境界", () => {
    test("日本語を含む名前だけを受け入れる", () => {
        expect(hasJapaneseText("WebRTC接続を修正")).toBe(true);
        expect(hasJapaneseText("Fix WebRTC connection")).toBe(false);
    });
});
