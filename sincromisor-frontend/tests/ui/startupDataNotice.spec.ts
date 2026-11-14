import { expect, test } from "@playwright/test";
import { selectSettingsCategory } from "./settingsLayoutAssertions";

test.use({ channel: "chrome", baseURL: "http://127.0.0.1:5173" });

test("データ説明を共通モーダルで開閉し、設定とフォーカスを保つ", async ({ page }) => {
    await page.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
            throw new Error("説明の閲覧では機器を取得しない");
        };
    });
    for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 600 });
        await page.goto("/simple-vrm/?talkMode=chat");
        const startup = page.locator("#configurationDialog");
        const trigger = startup.getByRole("button", { name: "データの扱いについて" });
        const notice = page.getByRole("dialog", { name: "データの扱いについて", exact: true });
        await expect(
            startup.getByRole("radio", { name: "キャラクターと話す", exact: true }),
        ).toBeFocused();
        await expect(startup).not.toContainText("音声を接続先サーバーへ送信します。");
        await trigger.focus();
        await page.keyboard.press("Enter");
        await expect(notice).toBeVisible();
        await expect(notice).toContainText("会話履歴もサーバーに保存します。");
        const close = notice.getByRole("button", { name: "閉じる", exact: true });
        await expect(close).toBeFocused();
        await page.keyboard.press("Shift+Tab");
        await expect(trigger).not.toBeFocused();
        await page.keyboard.press("Tab");
        await expect(close).toBeFocused();
        const bounds = await notice.boundingBox();
        if (!bounds) throw new Error("説明モーダルが表示されていません");
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(600);
        await page.keyboard.press("Escape");
        await expect(notice).toBeHidden();
        await expect(trigger).toBeFocused();
        await expect(startup).toBeVisible();
        await trigger.click();
        await close.click();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await page.mouse.click(1, 1);
        await expect(notice).toBeHidden();
        await expect(trigger).toBeFocused();

        await startup.getByRole("button", { name: "詳しい設定", exact: true }).click();
        for (const [id, label] of [
            ["experience", "体験"],
            ["character", "キャラクター"],
            ["audio", "マイク・音声"],
            ["camera", "カメラ・動き"],
            ["screen", "画面・保存"],
        ]) {
            await selectSettingsCategory(startup, id);
            await expect(startup).not.toContainText("音声を接続先サーバーへ送信します。");
            await expect(trigger).toHaveCount(1);
            await trigger.click();
            await expect(notice).toBeVisible();
            await page.keyboard.press("Escape");
            await expect(trigger).toBeFocused();
            await expect(startup.getByRole("tabpanel", { name: label, exact: true })).toBeVisible();
        }
        await startup
            .getByRole("textbox", { name: "タイトル", exact: true })
            .fill("確認用タイトル");
        await trigger.click();
        await close.click();
        await expect(startup.getByRole("textbox", { name: "タイトル", exact: true })).toHaveValue(
            "確認用タイトル",
        );
    }
});
