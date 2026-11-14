import { expect, test } from "@playwright/test";
import { selectSettingsCategory } from "./settingsLayoutAssertions";

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
        // メニュー・機器の確認に不要な3D描画は設定で止め、モデル交換はVRM試験で確認する。
        await page.evaluate(async () => {
            const path = "/app/controller/activeSincroAppController.ts";
            const { getActiveSincroAppController } = await import(path);
            getActiveSincroAppController().applySettings({ enableCharacter: false });
        });
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
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowUp");
        await expect(page.getByRole("menuitem", { name: "体験を終了" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("menu")).toBeHidden();
        await expect(gear).toBeFocused();
        await page.keyboard.press("Enter");
        await page.keyboard.press("End");
        await page.keyboard.press("ArrowUp");
        await expect(page.getByRole("menuitem", { name: "体験を開始" })).toBeFocused();
        await page.keyboard.press("Space");
        await expect(gear).toBeFocused();
        await expect(page.getByRole("menu")).toBeHidden();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Tab");
        await expect(page.getByRole("menu")).toBeHidden();
        expect(await page.evaluate(() => document.activeElement?.closest("[inert]"))).toBeNull();
    }
});

test("標準メニューは画面端を避け、説明と併用してもパネルを保つ", async ({ page }) => {
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
            document.documentElement.dataset.menuDeviceRequests = "true";
            throw new Error("Menu operations must not acquire devices");
        };
    });
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 480 });
        await page.goto("/simple-vrm/");
        await expect(page.getByRole("button", { name: "開始する", exact: true })).toBeVisible();
        // 機器の開始を経ずにパネルを使い、表示操作そのものを検査する。
        await page.evaluate(async () => {
            const path = "/app/controller/activeSincroAppController.ts";
            const { getActiveSincroAppController } = await import(path);
            getActiveSincroAppController().dialog.close();
        });
        const gear = page.locator("#debugMenuButton");
        const menu = page.getByRole("menu", { name: "右側ツール" });
        await gear.click();
        await expect(menu).toHaveAttribute("popover", "auto");
        await expect(gear).toHaveAttribute("aria-expanded", "true");
        await page.getByRole("menuitem", { name: "基本設定", exact: true }).click();
        const settings = page.getByRole("dialog", { name: "基本設定", exact: true });
        await expect(settings).toBeVisible();
        await selectSettingsCategory(page.locator(".sincroControlPanel"), "audio");
        const help = settings.getByRole("button", { name: "マイク入力の説明を表示" });
        await help.scrollIntoViewIfNeeded();
        await gear.click();
        await help.hover();
        await expect(page.getByRole("tooltip")).toBeVisible();
        await expect(menu).toBeVisible();
        await expect(settings).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("tooltip")).toHaveCount(0);
        await expect(menu).toBeVisible();
        await expect(settings).toBeVisible();
        await page.mouse.move(0, 0);
        await page.keyboard.press("Escape");
        await expect(menu).toBeHidden();
        await expect(gear).toHaveAttribute("aria-expanded", "false");
        await expect(gear).toBeFocused();
        await expect(settings).toBeVisible();
        await settings.getByRole("button", { name: "基本設定を閉じる" }).click();

        // 無効項目を飛ばし、Shift+Tabでも閉じたメニューにフォーカスを残さない。
        await gear.press("ArrowDown");
        await page.getByRole("menuitem", { name: "基本設定", exact: true }).evaluate((node) => {
            (node as HTMLButtonElement).disabled = true;
        });
        await page.keyboard.press("Home");
        await page.keyboard.press("ArrowDown");
        await expect(page.getByRole("menuitem", { name: "体験を開始" })).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(menu).toBeHidden();
        expect(
            await page.evaluate(() => document.activeElement?.closest("#debugMenuPanel")),
        ).toBeNull();

        // OBS既定CSSと一般的な追加指定より、メニューの要素・ID指定が優先される。
        await page.addStyleTag({
            content:
                "body { background-color: transparent; margin: 0 auto; overflow: hidden; } [popover] { position: absolute; width: 10px; }",
        });
        // 下端・左右端に起点がある場合にも標準の配置反転で項目を表示する。
        for (const left of [0, width - 74]) {
            await gear.evaluate((node, x) => {
                Object.assign(node.style, { position: "fixed", top: "400px", left: `${x}px` });
            }, left);
            await gear.click();
            await expect(menu).toBeVisible();
            await expect(menu).toHaveCSS("position", "fixed");
            await expect(menu).toHaveCSS("width", "200px");
            const box = await menu.boundingBox();
            if (!box) throw new Error("Menu must be visible");
            expect(box.x).toBeGreaterThanOrEqual(0);
            expect(box.y).toBeGreaterThanOrEqual(0);
            expect(box.x + box.width).toBeLessThanOrEqual(width);
            expect(box.y + box.height).toBeLessThanOrEqual(480);
            await page.mouse.click(width / 2, 10);
            await expect(menu).toBeHidden();
            await expect(gear).toHaveAttribute("aria-expanded", "false");
        }
        await expect(page.locator("html")).not.toHaveAttribute("data-menu-device-requests", "true");
        await gear.evaluate((node) => node.removeAttribute("style"));
        await page.keyboard.press("Control+Alt+d");
        await expect(page.getByRole("dialog", { name: "開発者ツール", exact: true })).toBeVisible();
    }
});
