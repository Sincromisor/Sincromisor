import { expect, type Locator, test } from "@playwright/test";
import { selectSettingsCategory } from "./settingsLayoutAssertions";

test.use({ baseURL: "http://127.0.0.1:5173" });

// 見えていても別の固定領域に覆われていれば操作できないため、実際のヒット位置も確認する。
async function expectReachable(control: Locator) {
    await control.scrollIntoViewIfNeeded();
    await expect(control).toBeInViewport();
    expect(
        await control.evaluate((el) => {
            const rect = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
            );
            return hit === el || el.contains(hit);
        }),
    ).toBe(true);
}

for (const route of ["simple-vrm", "vrm360", "looking-glass-vrm"]) {
    test(`${route}: 横向き・拡大相当の画面でも設定と操作に到達できる`, async ({ page }) => {
        await page.addInitScript(() => {
            navigator.mediaDevices.enumerateDevices = async () => [];
        });
        await page.route("**/api/v1/RTCSignalingServer/config.json", (route) =>
            route.fulfill({
                json: {
                    iceServers: [],
                    offerURL: "/fixture/rtc",
                    candidateURL: "/fixture/candidate",
                },
            }),
        );
        for (const width of [740, 320]) {
            await page.setViewportSize({ width, height: 320 });
            await page.goto(`/${route}/`);
            const startup = page.locator("#configurationDialog");
            await expectReachable(
                startup.getByRole("combobox", { name: "マイク入力", exact: true }),
            );
            await expectReachable(startup.getByRole("button", { name: "開始する", exact: true }));
            await startup.getByRole("button", { name: "詳しい設定", exact: true }).click();
            await selectSettingsCategory(startup, "camera");
            await expectReachable(
                startup.getByRole("combobox", { name: "追跡用カメラ", exact: true }),
            );
            await expectReachable(startup.getByRole("button", { name: "開始する", exact: true }));
            await expectReachable(startup.getByRole("link", { name: "トップへ戻る" }));
            await page.evaluate(async () => {
                const path = "/app/controller/index.ts";
                const { SincroAppController } = await import(path);
                SincroAppController.getCurrent().dialog.close();
            });
            await page.locator("#debugMenuButton").click();
            await page.getByRole("menuitem", { name: "基本設定", exact: true }).click();
            const basic = page.locator(".sincroControlPanel");
            await selectSettingsCategory(basic, "screen");
            await expectReachable(basic.getByRole("textbox", { name: "タイトル", exact: true }));
            await expectReachable(basic.getByRole("button", { name: "会話を開始", exact: true }));
            await expectReachable(page.getByRole("button", { name: "基本設定を閉じる" }));
        }
    });
}
