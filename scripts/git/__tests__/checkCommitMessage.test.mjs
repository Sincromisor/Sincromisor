import { describe, expect, test } from "bun:test";

import { findEscapedNewline } from "../checkCommitMessage.mjs";

describe("findEscapedNewline", () => {
  test("実改行を使った標準 body は許可する", () => {
    expect(
      findEscapedNewline("fix(scope): summary\n\nWhy: reason\nWhat: change\n"),
    ).toBeNull();
  });

  test("エージェントが埋め込んだエスケープ改行を検出する", () => {
    expect(
      findEscapedNewline(
        "fix(scope): summary\n\nWhy: reason\\nWhat: change\\n\\nRefs: task-1",
      ),
    ).toBe("\\n");
  });

  test("本文中の正当な文字列表現は誤検出しない", () => {
    expect(
      findEscapedNewline("What: parser accepts the token `\\n` in examples."),
    ).toBeNull();
  });
});
