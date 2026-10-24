import { expect, test } from "@playwright/test";

test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173" });

test("起動前と右側パネルをキーボードで切り替えても見える操作へ戻る", async ({ page }) => {
    // 機器権限は固定で拒否し、フォーカス確認が実機の取得を開始しないようにする。
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
            throw new DOMException("Fixture denial", "NotAllowedError");
        };
    });
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/simple-vrm/");
        const startup = page.getByRole("dialog", { name: "開始前の確認", exact: true });
        await expect(
            startup.getByRole("radio", { name: "キャラクターと話す", exact: true }),
        ).toBeFocused();
        await startup.getByRole("button", { name: "詳しい設定", exact: true }).focus();
        await page.keyboard.press("Enter");
        const details = page.getByRole("dialog", { name: "詳しい設定", exact: true });
        await expect(details.getByRole("button", { name: "開始画面へ戻る" })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(details).toBeVisible();
        const tabs = details.getByRole("tab");
        if (await tabs.first().isVisible()) {
            await tabs.first().focus();
            await page.keyboard.press("End");
            await expect(details.getByRole("tab", { name: "画面・保存" })).toBeFocused();
            await page.keyboard.press("Home");
            await page.keyboard.press("ArrowRight");
            await expect(
                details.getByRole("tab", { name: "キャラクター", exact: true }),
            ).toBeFocused();
        } else {
            const category = details.getByRole("combobox", { name: "詳しい設定 カテゴリ" });
            await category.selectOption("camera");
            await expect(details.getByRole("tabpanel", { name: "カメラ・動き" })).toBeVisible();
        }
        await details.getByRole("button", { name: "開始画面へ戻る" }).click();
        await expect(
            startup.getByRole("button", { name: "詳しい設定", exact: true }),
        ).toBeFocused();
        await startup.getByRole("button", { name: "開始する", exact: true }).click();
        const gear = page.locator("#debugMenuButton");
        await expect(gear).toBeFocused();
        await page.keyboard.press("ArrowDown");
        await expect(page.getByRole("menuitem", { name: "会話履歴" })).toBeFocused();
        await page.keyboard.press("End");
        await expect(page.getByRole("menuitem", { name: "開発者ツール" })).toBeFocused();
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowDown");
        await expect(page.getByRole("menuitem", { name: "基本設定" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: "基本設定を閉じる" })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(gear).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(page.getByRole("menuitem", { name: "開発者ツール" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("button", { name: "開発者ツールを閉じる" })).toBeFocused();
        await page.keyboard.press("Escape");
        await expect(gear).toBeFocused();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Escape");
        await expect(gear).toBeFocused();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("menu")).toBeHidden();
        expect(await page.evaluate(() => document.activeElement?.closest("[inert]"))).toBeNull();
    }
});
