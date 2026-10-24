import { expect, test } from "@playwright/test";

test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173" });

test("起動前後で未保存の入力を保持し、最新値を再試行して復元する", async ({ page }) => {
    await page.addInitScript(() => {
        const fixture = { fail: true };
        Object.assign(window, { savingFixture: fixture });
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (fixture.fail && key.startsWith("sincromisor:settings:")) {
                throw new DOMException("Fixture full", "QuotaExceededError");
            }
            original.call(this, key, value);
        };
    });
    await page.route("**/api/v1/RTCSignalingServer/config.json", (route) =>
        route.fulfill({
            json: { iceServers: [], offerURL: "/fixture/rtc", candidateURL: "/fixture/candidate" },
        }),
    );
    await page.goto("/simple-vrm/");
    await expect(page.getByRole("alert", { name: "重要な通知" })).toBeHidden();
    await page.getByRole("button", { name: "詳しい設定", exact: true }).click();
    await page.getByRole("tab", { name: "画面・保存" }).click();
    const title = page.getByRole("textbox", { name: "タイトル", exact: true });
    await title.fill("未保存の入力");
    await expect(title).toBeFocused();
    await expect(page.getByRole("alert")).toContainText("設定が未保存です");
    await title.fill("最新の入力");
    await page.evaluate(async () => {
        const path = "/app/controller/index.ts";
        const { SincroAppController } = await import(path);
        SincroAppController.getCurrent().dialog.close();
    });
    await page.locator("#debugMenuButton").click();
    await page.getByRole("menuitem", { name: "基本設定" }).click();
    await page.getByRole("tab", { name: "画面・保存" }).click();
    await expect(title).toHaveValue("最新の入力");
    await expect(page.getByRole("alert")).toContainText("設定が未保存です");
    await page.evaluate(() => {
        (window as unknown as { savingFixture: { fail: boolean } }).savingFixture.fail = false;
    });
    await page.getByRole("button", { name: "保存を再試行" }).click();
    await expect(page.getByRole("alert")).toBeHidden();
    await page.reload();
    await page.getByRole("button", { name: "詳しい設定", exact: true }).click();
    await page.getByRole("tab", { name: "画面・保存" }).click();
    await expect(title).toHaveValue("最新の入力");
    await expect(page.getByRole("button", { name: "保存を再試行" })).toBeHidden();
});
