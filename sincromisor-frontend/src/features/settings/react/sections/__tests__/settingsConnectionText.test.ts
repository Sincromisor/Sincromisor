import { describe, expect, it } from "vitest";
import { createTalkModeReconnectHint } from "../settingsConnectionText";

describe("体験の再接続案内", () => {
    it("開始準備中と実行中だけ操作を案内する", () => {
        for (const state of ["starting", "running"] as const) {
            expect(createTalkModeReconnectHint(state)).toContain("停止して再開");
        }
        for (const state of ["idle", "stopping", "stopped"] as const) {
            expect(createTalkModeReconnectHint(state)).toBe("");
        }
    });
});
