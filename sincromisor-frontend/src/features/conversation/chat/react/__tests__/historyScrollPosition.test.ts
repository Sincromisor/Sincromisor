import { expect, it } from "vitest";
import { historyIsAtLatest, historyScrollAdjustment } from "../historyScrollPosition";

it("末尾だけ追従し、端数丸めと過去の閲覧を区別する", () => {
    expect(historyIsAtLatest({ scrollTop: 100, scrollHeight: 302, clientHeight: 200 })).toBe(true);
    expect(historyIsAtLatest({ scrollTop: 50, scrollHeight: 302, clientHeight: 200 })).toBe(false);
});
it("同一IDの位置変化と古い発話の削除を、残る閲覧対象に合わせて補正する", () => {
    const before = [
        { id: "old", top: -50, bottom: 50 },
        { id: "kept", top: 50, bottom: 200 },
    ];
    expect(
        historyScrollAdjustment(before, [
            { id: "old", top: -30, bottom: 70 },
            { id: "kept", top: 70, bottom: 220 },
        ]),
    ).toBe(20);
    expect(historyScrollAdjustment(before, [{ id: "kept", top: 0, bottom: 150 }])).toBe(-50);
    expect(historyScrollAdjustment(before, [])).toBe(0);
});
